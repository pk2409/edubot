import { useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import GradingService from '../../services/grading/gradingService';
import { DatabaseService } from '../../services/supabase';
import { 
  Upload, 
  Image, 
  X, 
  FileImage, 
  CheckCircle, 
  AlertCircle, 
  Brain, 
  Loader, 
  ArrowLeft,
  Eye,
  Edit3,
  Save,
  Trash2,
  Download,
  Users,
  Clock,
  Target
} from 'lucide-react';

const BulkUpload = () => {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [session, setSession] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [processingStatus, setProcessingStatus] = useState({});
  const [gradingResults, setGradingResults] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState('upload'); // upload, process, review
  const fileInputRef = useRef(null);

  // Load session data
  useState(() => {
    const loadSession = async () => {
      try {
        const { data: sessions } = await DatabaseService.getGradingSessions(user.id);
        const currentSession = sessions?.find(s => s.id === sessionId);
        if (currentSession) {
          setSession(currentSession);
        }
      } catch (error) {
        console.error('Error loading session:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (sessionId && user) {
      loadSession();
    }
  }, [sessionId, user]);

  // Handle drag and drop
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      handleFileSelection(imageFiles);
    }
  }, []);

  // Handle file selection
  const handleFileSelection = async (files) => {
    const newImages = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const imageId = `bulk_${Date.now()}_${i}`;
      
      // Convert to base64 for preview and storage
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });

      const imageData = {
        id: imageId,
        file: file,
        base64: base64,
        fileName: file.name,
        studentName: `Student ${uploadedImages.length + i + 1}`,
        rollNumber: `${(uploadedImages.length + i + 1).toString().padStart(3, '0')}`,
        uploadedAt: new Date().toISOString(),
        status: 'uploaded'
      };

      newImages.push(imageData);
    }

    setUploadedImages(prev => [...prev, ...newImages]);
  };

  // Process all images through OCR and AI grading
  const processAllImages = async () => {
    if (!session?.question_paper?.questions || uploadedImages.length === 0) return;
    
    setProcessing(true);
    setCurrentStep('process');
    
    try {
      const question = session.question_paper.questions[0]; // For demo, using first question
      const questionWithContext = {
        ...question,
        subject: session.question_paper.subject
      };

      for (const imageData of uploadedImages) {
        setProcessingStatus(prev => ({ ...prev, [imageData.id]: 'processing' }));
        
        try {
          const result = await GradingService.gradeAnswerImage(
            questionWithContext,
            imageData.base64,
            {
              studentName: imageData.studentName,
              rollNumber: imageData.rollNumber
            }
          );
          
          setGradingResults(prev => ({
            ...prev,
            [imageData.id]: {
              ...result,
              gradedAt: new Date().toISOString(),
              questionNumber: question.question_number
            }
          }));
          
          setProcessingStatus(prev => ({ ...prev, [imageData.id]: 'completed' }));
          
        } catch (error) {
          console.error('Error grading image:', imageData.fileName, error);
          setProcessingStatus(prev => ({ ...prev, [imageData.id]: 'error' }));
        }
      }
      
      setCurrentStep('review');
    } catch (error) {
      console.error('Error processing images:', error);
    } finally {
      setProcessing(false);
    }
  };

  // Update student information
  const updateStudentInfo = (imageId, field, value) => {
    setUploadedImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, [field]: value } : img
    ));
  };

  // Update grading results
  const updateGradingResult = (imageId, field, value) => {
    setGradingResults(prev => ({
      ...prev,
      [imageId]: {
        ...prev[imageId],
        [field]: field === 'marks' ? Math.max(0, parseInt(value) || 0) : value
      }
    }));
  };

  // Remove image
  const removeImage = (imageId) => {
    setUploadedImages(prev => prev.filter(img => img.id !== imageId));
    setGradingResults(prev => {
      const updated = { ...prev };
      delete updated[imageId];
      return updated;
    });
    setProcessingStatus(prev => {
      const updated = { ...prev };
      delete updated[imageId];
      return updated;
    });
  };

  // Save all results to database
  const saveAllResults = async () => {
    setLoading(true);
    
    try {
      for (const imageData of uploadedImages) {
        const gradingResult = gradingResults[imageData.id];
        
        if (gradingResult) {
          const submissionData = {
            session_id: sessionId,
            student_name: imageData.studentName,
            roll_number: imageData.rollNumber,
            class_section: session.question_paper.class_section,
            file_url: imageData.base64,
            file_name: imageData.fileName,
            ocr_text: { 
              text: gradingResult.ocrText || '', 
              confidence: gradingResult.ocrConfidence || 0 
            },
            ai_grades: {
              marks: gradingResult.marks,
              feedback: gradingResult.feedback,
              strengths: gradingResult.strengths,
              improvements: gradingResult.improvements,
              confidence: gradingResult.confidence
            },
            final_grades: {
              marks: gradingResult.marks,
              feedback: gradingResult.feedback,
              strengths: gradingResult.strengths,
              improvements: gradingResult.improvements
            },
            total_marks: gradingResult.marks,
            percentage: (gradingResult.marks / (session.question_paper.questions[0]?.max_marks || 10)) * 100,
            processing_status: 'graded',
            is_reviewed: true,
            reviewed_at: new Date().toISOString()
          };

          await DatabaseService.createStudentSubmission(submissionData);
        }
      }
      
      // Navigate back to grading interface
      navigate(`/grading/session/${sessionId}`);
    } catch (error) {
      console.error('Error saving results:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading bulk upload interface...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto text-center py-12">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Session Not Found</h2>
          <p className="text-gray-600 mb-6">The grading session could not be loaded.</p>
          <button
            onClick={() => navigate('/grading')}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Back to Grading Hub
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(`/grading/session/${sessionId}`)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Bulk Upload & Grading</h1>
              <p className="text-gray-600 mt-2">{session.session_name}</p>
            </div>
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center space-x-4">
            {[
              { key: 'upload', label: 'Upload', icon: Upload },
              { key: 'process', label: 'Process', icon: Brain },
              { key: 'review', label: 'Review', icon: Eye }
            ].map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.key;
              const isCompleted = ['upload', 'process', 'review'].indexOf(currentStep) > index;
              
              return (
                <div key={step.key} className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isCompleted ? 'bg-green-500 text-white' :
                    isActive ? 'bg-blue-500 text-white' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    <Icon size={20} />
                  </div>
                  <span className={`ml-2 font-medium ${
                    isActive ? 'text-blue-600' : 'text-gray-600'
                  }`}>
                    {step.label}
                  </span>
                  {index < 2 && (
                    <div className={`w-8 h-1 mx-4 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Upload Step */}
        {currentStep === 'upload' && (
          <div className="space-y-6">
            {/* Drag and Drop Area */}
            <div
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50 scale-105' 
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="space-y-4">
                <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center transition-colors ${
                  isDragging ? 'bg-blue-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'
                }`}>
                  <Upload className="text-white" size={32} />
                </div>
                
                <div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">
                    {isDragging ? 'Drop images here!' : 'Upload Answer Images'}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Drag and drop multiple answer images or click to browse
                  </p>
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-3 rounded-lg hover:from-blue-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
                  >
                    Choose Images
                  </button>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleFileSelection(Array.from(e.target.files))}
                    className="hidden"
                  />
                </div>
                
                <div className="text-sm text-gray-500">
                  Supported formats: JPG, PNG, JPEG • Max 50 images
                </div>
              </div>
            </div>

            {/* Uploaded Images Grid */}
            {uploadedImages.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-800">
                    Uploaded Images ({uploadedImages.length})
                  </h3>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setUploadedImages([])}
                      className="flex items-center space-x-2 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                      <span>Clear All</span>
                    </button>
                    <button
                      onClick={processAllImages}
                      disabled={processing}
                      className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-teal-500 text-white px-6 py-2 rounded-lg hover:from-green-600 hover:to-teal-600 transition-all duration-200 disabled:opacity-50"
                    >
                      <Brain size={16} />
                      <span>{processing ? 'Processing...' : 'Process All'}</span>
                    Supported formats: JPG, PNG, JPEG • Max 50 images • No answer key required
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {uploadedImages.map((imageData) => (
                    <div key={imageData.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <FileImage className="text-blue-500" size={20} />
                          <span className="font-medium text-gray-800 truncate">
                            {imageData.fileName}
                          </span>
                        </div>
                        <button
                          onClick={() => removeImage(imageData.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="w-full h-32 bg-gray-200 rounded-lg mb-4 overflow-hidden">
                        <img 
                          src={imageData.base64} 
                          alt={imageData.fileName}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="space-y-2">
                        <input
                          type="text"
                          value={imageData.studentName}
                          onChange={(e) => updateStudentInfo(imageData.id, 'studentName', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          placeholder="Student name"
                        />
                        <input
                          type="text"
                          value={imageData.rollNumber}
                          onChange={(e) => updateStudentInfo(imageData.id, 'rollNumber', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          placeholder="Roll number"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing Step */}
        {currentStep === 'process' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Brain className="text-white animate-pulse" size={32} />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Processing Answer Images</h3>
              <p className="text-gray-600">Smart AI is analyzing handwriting and grading each answer based on your questions...</p>
            </div>

            <div className="space-y-4">
              {uploadedImages.map((imageData) => {
                const status = processingStatus[imageData.id];
                const result = gradingResults[imageData.id];
                
                return (
                  <div key={imageData.id} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-16 h-16 bg-gray-200 rounded-lg overflow-hidden">
                      <img 
                        src={imageData.base64} 
                        alt={imageData.fileName}
                        className="w-full h-full object-cover"
                      Drag and drop multiple answer images or click to browse. AI will automatically grade based on your questions.
                    </div>
                    
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{imageData.studentName}</div>
                      <div className="text-sm text-gray-600">{imageData.fileName}</div>
                    </div>

                    <div className="text-center">
                      {status === 'processing' && (
                        <div className="flex items-center space-x-2 text-blue-600">
                          <Loader className="animate-spin" size={20} />
                          <span className="text-sm">Processing...</span>
                        </div>
                      )}
                      {status === 'completed' && result && (
                        <div className="text-green-600">
                          <CheckCircle size={20} className="mx-auto mb-1" />
                          <div className="text-sm font-medium">
                            {result.marks}/{session.question_paper.questions[0]?.max_marks || 10}
                          </div>
                        </div>
                      )}
                      {status === 'error' && (
                        <div className="text-red-600">
                          <AlertCircle size={20} className="mx-auto mb-1" />
                          <div className="text-sm">Error</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Review Step */}
        {currentStep === 'review' && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Total Submissions</p>
                    <p className="text-2xl font-bold text-gray-800">{uploadedImages.length}</p>
                  </div>
                  <Users className="text-blue-600" size={24} />
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Average Score</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {Object.values(gradingResults).length > 0 
                        ? Math.round(Object.values(gradingResults).reduce((sum, result) => sum + result.marks, 0) / Object.values(gradingResults).length)
                        : 0
                      }%
                    </p>
                  </div>
                  <Target className="text-green-600" size={24} />
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Processed</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {Object.keys(gradingResults).length}/{uploadedImages.length}
                    </p>
                  </div>
                  <CheckCircle className="text-purple-600" size={24} />
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Time Saved</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {Math.round(uploadedImages.length * 15 / 60)}h
                    </p>
                  </div>
                  <Clock className="text-orange-600" size={24} />
                </div>
              </div>
            </div>

            {/* Results Review */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-800">Review & Adjust Grades</h3>
                <button
                  onClick={saveAllResults}
                  disabled={loading}
                  className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-teal-500 text-white px-6 py-3 rounded-lg hover:from-green-600 hover:to-teal-600 transition-all duration-200 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader className="animate-spin" size={16} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save All Results</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-4">
                {uploadedImages.map((imageData) => {
                  const result = gradingResults[imageData.id];
                  
                  if (!result) return null;
                  
                  return (
                    <div key={imageData.id} className="border border-gray-200 rounded-lg p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Image Preview */}
                        <div>
                          <h4 className="font-medium text-gray-800 mb-3">Answer Image</h4>
                          <div className="w-full h-48 bg-gray-100 rounded-lg overflow-hidden">
                            <img 
                              src={imageData.base64} 
                              alt={imageData.fileName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="mt-2 text-sm text-gray-600">
                            <div>{imageData.studentName}</div>
                            <div>Roll: {imageData.rollNumber}</div>
                          </div>
                        </div>

                        {/* AI Analysis */}
                        <div>
                          <h4 className="font-medium text-gray-800 mb-3">AI Analysis</h4>
                          <div className="space-y-3">
                            <div className="bg-blue-50 p-3 rounded-lg">
                              <div className="text-sm text-blue-700 font-medium">OCR Confidence</div>
                              <div className="text-blue-800">{result.ocrConfidence || 0}%</div>
                            </div>
                            <div className="bg-purple-50 p-3 rounded-lg">
                              <div className="text-sm text-purple-700 font-medium">AI Confidence</div>
                              <div className="text-purple-800">{result.confidence}/10</div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <div className="text-sm text-gray-700 font-medium">Extracted Text</div>
                              <div className="text-gray-800 text-xs mt-1 max-h-20 overflow-y-auto">
                                {result.ocrText || 'No text extracted'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Grade Adjustment */}
                        <div>
                          <h4 className="font-medium text-gray-800 mb-3">Grade & Feedback</h4>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Marks
                              </label>
                              <input
                                type="number"
                                min="0"
                                max={session.question_paper.questions[0]?.max_marks || 10}
                                value={result.marks || 0}
                                onChange={(e) => updateGradingResult(imageData.id, 'marks', e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Feedback
                              </label>
                              <textarea
                                value={result.feedback || ''}
                                onChange={(e) => updateGradingResult(imageData.id, 'feedback', e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                rows="3"
                                placeholder="Feedback for this answer..."
                              />
                            </div>

                            <div className="text-sm">
                              <div className="text-green-700 font-medium">Strengths:</div>
                              <div className="text-green-600">{result.strengths}</div>
                            </div>

                            <div className="text-sm">
                              <div className="text-orange-700 font-medium">Improvements:</div>
                              <div className="text-orange-600">{result.improvements}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default BulkUpload;