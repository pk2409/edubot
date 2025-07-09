import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { DatabaseService, SUBJECTS } from '../../services/supabase';
import GradingService from '../../services/grading/gradingService';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  FileText, 
  Users, 
  Clock,
  Save,
  Upload,
  Image,
  CheckCircle,
  AlertCircle,
  Brain
} from 'lucide-react';

const CreateSession = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Question Paper, 2: Session Details, 3: Upload Answer Images
  
  const [questionPaper, setQuestionPaper] = useState({
    title: '',
    subject: '',
    class_section: '',
    questions: [
      {
        question_number: 1,
        question_text: '',
        max_marks: 5,
        answer_key: ''
      }
    ],
    total_marks: 5
  });

  const [sessionDetails, setSessionDetails] = useState({
    session_name: '',
    instructions: ''
  });

  const [answerImages, setAnswerImages] = useState([]); // Store uploaded answer images
  const [gradingResults, setGradingResults] = useState({}); // Store AI grading results
  const [processingStatus, setProcessingStatus] = useState({}); // Track processing status

  useEffect(() => {
    // Calculate total marks whenever questions change
    const total = questionPaper.questions.reduce((sum, q) => sum + (q.max_marks || 0), 0);
    setQuestionPaper(prev => ({ ...prev, total_marks: total }));
  }, [questionPaper.questions]);

  const addQuestion = () => {
    const newQuestion = {
      question_number: questionPaper.questions.length + 1,
      question_text: '',
      max_marks: 5,
      answer_key: ''
    };
    setQuestionPaper(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion]
    }));
  };

  const removeQuestion = (index) => {
    if (questionPaper.questions.length > 1) {
      const updatedQuestions = questionPaper.questions
        .filter((_, i) => i !== index)
        .map((q, i) => ({ ...q, question_number: i + 1 }));
      
      setQuestionPaper(prev => ({
        ...prev,
        questions: updatedQuestions
      }));
    }
  };

  const updateQuestion = (index, field, value) => {
    const updatedQuestions = [...questionPaper.questions];
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      [field]: field === 'max_marks' ? parseInt(value) || 0 : value
    };
    setQuestionPaper(prev => ({
      ...prev,
      questions: updatedQuestions
    }));
  };

  const handleAnswerImageUpload = async (questionIndex, files) => {
    const question = questionPaper.questions[questionIndex];
    const uploadedImages = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const imageId = `q${questionIndex + 1}_img${i + 1}_${Date.now()}`;
      
      // Convert file to base64 for storage
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });

      const imageData = {
        id: imageId,
        questionIndex: questionIndex,
        questionNumber: question.question_number,
        file: file,
        base64: base64,
        fileName: file.name,
        studentName: `Student ${uploadedImages.length + 1}`, // Default name, can be edited
        rollNumber: `${(uploadedImages.length + 1).toString().padStart(3, '0')}`,
        uploadedAt: new Date().toISOString()
      };

      uploadedImages.push(imageData);
    }

    setAnswerImages(prev => [...prev, ...uploadedImages]);
  };

  const removeAnswerImage = (imageId) => {
    setAnswerImages(prev => prev.filter(img => img.id !== imageId));
    // Also remove any grading results for this image
    setGradingResults(prev => {
      const updated = { ...prev };
      delete updated[imageId];
      return updated;
    });
  };

  const updateStudentInfo = (imageId, field, value) => {
    setAnswerImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, [field]: value } : img
    ));
  };

  const gradeAnswerImage = async (imageData) => {
    const question = questionPaper.questions[imageData.questionIndex];
    
    setProcessingStatus(prev => ({ ...prev, [imageData.id]: 'processing' }));
    
    try {
      console.log('Grading answer image:', imageData.fileName);
      
      // Add subject context to question for better AI grading
      const questionWithContext = {
        ...question,
        subject: questionPaper.subject
      };
      
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
      console.error('Error grading answer image:', error);
      setProcessingStatus(prev => ({ ...prev, [imageData.id]: 'error' }));
    }
  };

  const gradeAllAnswers = async () => {
    setLoading(true);
    
    try {
      const gradingPromises = answerImages.map(imageData => gradeAnswerImage(imageData));
      await Promise.all(gradingPromises);
      
      console.log('All answers graded successfully');
    } catch (error) {
      console.error('Error grading answers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    setLoading(true);
    try {
      // Generate session name if not provided
      const sessionName = sessionDetails.session_name || 
        `${questionPaper.subject} - ${questionPaper.title} - ${new Date().toLocaleDateString()}`;

      // Create question paper first
      const { data: paperData, error: paperError } = await DatabaseService.createQuestionPaper({
        created_by: user.id,
        title: questionPaper.title,
        subject: questionPaper.subject,
        class_section: questionPaper.class_section,
        questions: questionPaper.questions,
        total_marks: questionPaper.total_marks
      });

      if (paperError) throw paperError;

      // Create grading session
      const { data: sessionData, error: sessionError } = await DatabaseService.createGradingSession({
        teacher_id: user.id,
        question_paper_id: paperData.id,
        session_name: sessionName,
        total_submissions: answerImages.length,
        graded_submissions: Object.keys(gradingResults).length
      });

      if (sessionError) throw sessionError;

      // Create student submissions with grading results
      for (const imageData of answerImages) {
        const gradingResult = gradingResults[imageData.id];
        
        const submissionData = {
          session_id: sessionData.id,
          student_name: imageData.studentName,
          roll_number: imageData.rollNumber,
          class_section: questionPaper.class_section,
          file_url: imageData.base64,
          file_name: imageData.fileName,
          ocr_text: gradingResult ? { text: gradingResult.ocrText, confidence: gradingResult.ocrConfidence } : {},
          ai_grades: gradingResult ? {
            marks: gradingResult.marks,
            feedback: gradingResult.feedback,
            strengths: gradingResult.strengths,
            improvements: gradingResult.improvements,
            confidence: gradingResult.confidence
          } : {},
          total_marks: gradingResult ? gradingResult.marks : 0,
          percentage: gradingResult ? (gradingResult.marks / questionPaper.questions[imageData.questionIndex].max_marks) * 100 : 0,
          processing_status: gradingResult ? 'graded' : 'uploaded'
        };

        await DatabaseService.createStudentSubmission(submissionData);
      }

      console.log('Grading session created successfully');
      navigate('/grading');
    } catch (error) {
      console.error('Error creating grading session:', error);
    } finally {
      setLoading(false);
    }
  };

  const canProceedToStep2 = () => {
    return questionPaper.title && 
           questionPaper.subject && 
           questionPaper.questions.every(q => q.question_text && q.max_marks > 0);
  };

  const canProceedToStep3 = () => {
    return sessionDetails.session_name || questionPaper.title;
  };

  const canCreateSession = () => {
    return answerImages.length > 0 && 
           answerImages.every(img => img.studentName && img.rollNumber);
  };

  const getQuestionImages = (questionIndex) => {
    return answerImages.filter(img => img.questionIndex === questionIndex);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/grading')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Create Grading Session</h1>
            <p className="text-gray-600 mt-2">Set up AI-powered grading with answer images</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center space-x-8">
          {[
            { number: 1, title: 'Question Paper', icon: FileText },
            { number: 2, title: 'Session Details', icon: Users },
            { number: 3, title: 'Upload Answer Images', icon: Image }
          ].map((stepInfo) => {
            const Icon = stepInfo.icon;
            const isActive = step === stepInfo.number;
            const isCompleted = step > stepInfo.number;
            
            return (
              <div key={stepInfo.number} className="flex items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  isCompleted ? 'bg-green-500 text-white' :
                  isActive ? 'bg-blue-500 text-white' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  <Icon size={20} />
                </div>
                <span className={`ml-3 font-medium ${
                  isActive ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {stepInfo.title}
                </span>
                {stepInfo.number < 3 && (
                  <div className={`w-16 h-1 mx-4 ${
                    step > stepInfo.number ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-800">Question Paper Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paper Title
                  </label>
                  <input
                    type="text"
                    value={questionPaper.title}
                    onChange={(e) => setQuestionPaper(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Mid-term Examination"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject
                  </label>
                  <select
                    value={questionPaper.subject}
                    onChange={(e) => setQuestionPaper(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select subject</option>
                    {SUBJECTS.map(subject => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Class Section
                  </label>
                  <input
                    type="text"
                    value={questionPaper.class_section}
                    onChange={(e) => setQuestionPaper(prev => ({ ...prev, class_section: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 10-A"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Total Marks
                  </label>
                  <input
                    type="number"
                    value={questionPaper.total_marks}
                    readOnly
                    className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
              </div>

              {/* Questions */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Questions</h3>
                  <button
                    onClick={addQuestion}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 font-medium"
                  >
                    <Plus size={16} />
                    <span>Add Question</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {questionPaper.questions.map((question, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-800">Question {question.question_number}</h4>
                        {questionPaper.questions.length > 1 && (
                          <button
                            onClick={() => removeQuestion(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Question Text
                          </label>
                          <textarea
                            value={question.question_text}
                            onChange={(e) => updateQuestion(index, 'question_text', e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows="2"
                            placeholder="Enter the question text (e.g., 'What is photosynthesis?')"
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            AI will automatically grade student answers based on the question and subject context
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Maximum Marks
                            </label>
                            <input
                              type="number"
                              value={question.max_marks}
                              onChange={(e) => updateQuestion(index, 'max_marks', e.target.value)}
                              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              min="1"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Answer Key/Rubric (Optional)
                            </label>
                            <textarea
                              value={question.answer_key}
                              onChange={(e) => updateQuestion(index, 'answer_key', e.target.value)}
                              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              rows="2"
                              placeholder="Optional: Expected answer or grading rubric for reference"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Leave blank - AI will grade based on question content and educational standards
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!canProceedToStep2()}
                  className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next: Session Details
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-800">Session Details</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Session Name
                  </label>
                  <input
                    type="text"
                    value={sessionDetails.session_name}
                    onChange={(e) => setSessionDetails(prev => ({ ...prev, session_name: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={`${questionPaper.subject} - ${questionPaper.title} - ${new Date().toLocaleDateString()}`}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Leave blank to auto-generate from paper details
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Instructions for Grading
                  </label>
                  <textarea
                    value={sessionDetails.instructions}
                    onChange={(e) => setSessionDetails(prev => ({ ...prev, instructions: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows="4"
                    placeholder="Any specific instructions for AI grading or manual review..."
                  />
                </div>

                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">Session Summary</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Paper Title:</span>
                      <span className="ml-2 font-medium">{questionPaper.title}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Subject:</span>
                      <span className="ml-2 font-medium">{questionPaper.subject}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Questions:</span>
                      <span className="ml-2 font-medium">{questionPaper.questions.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Marks:</span>
                      <span className="ml-2 font-medium">{questionPaper.total_marks}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canProceedToStep3()}
                  className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next: Upload Answer Images
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">Upload Answer Images</h2>
                {answerImages.length > 0 && (
                  <button
                    onClick={gradeAllAnswers}
                    disabled={loading}
                    className="flex items-center space-x-2 bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
                  >
                    <Brain size={16} />
                    <span>{loading ? 'Grading...' : 'Grade All Answers'}</span>
                  </button>
                )}
              </div>
              
              {/* Question-wise Upload */}
              <div className="space-y-6">
                {questionPaper.questions.map((question, questionIndex) => {
                  const questionImages = getQuestionImages(questionIndex);
                  
                  return (
                    <div key={questionIndex} className="border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800">
                            Question {question.question_number} ({question.max_marks} marks)
                          </h3>
                          <p className="text-gray-600 text-sm mt-1">{question.question_text}</p>
                        </div>
                        <div className="text-sm text-gray-500">
                          {questionImages.length} answer(s) uploaded
                        </div>
                      </div>

                      {/* Upload Area */}
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-4">
                        <Image className="mx-auto text-gray-400 mb-2" size={32} />
                        <h4 className="text-lg font-medium text-gray-800 mb-2">
                          Upload Answer Images for Question {question.question_number}
                        </h4>
                        <p className="text-gray-600 mb-4">
                          Select multiple images of student answers. AI will automatically grade them based on the question content.
                        </p>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={(e) => handleAnswerImageUpload(questionIndex, e.target.files)}
                          className="hidden"
                          id={`file-upload-q${questionIndex}`}
                        />
                        <label
                          htmlFor={`file-upload-q${questionIndex}`}
                          className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors cursor-pointer inline-block"
                        >
                          Choose Images
                        </label>
                        <p className="text-xs text-gray-500 mt-2">
                          Supported formats: JPG, PNG, JPEG
                        </p>
                      </div>

                      {/* Uploaded Images */}
                      {questionImages.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-800">Uploaded Answer Images:</h4>
                          {questionImages.map((imageData) => {
                            const gradingResult = gradingResults[imageData.id];
                            const status = processingStatus[imageData.id];
                            
                            return (
                              <div key={imageData.id} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg">
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                                  <img 
                                    src={imageData.base64} 
                                    alt={imageData.fileName}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">Student Name</label>
                                    <input
                                      type="text"
                                      value={imageData.studentName}
                                      onChange={(e) => updateStudentInfo(imageData.id, 'studentName', e.target.value)}
                                      className="w-full p-2 border border-gray-300 rounded text-sm"
                                      placeholder="Student name"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">Roll Number</label>
                                    <input
                                      type="text"
                                      value={imageData.rollNumber}
                                      onChange={(e) => updateStudentInfo(imageData.id, 'rollNumber', e.target.value)}
                                      className="w-full p-2 border border-gray-300 rounded text-sm"
                                      placeholder="Roll number"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">File</label>
                                    <span className="text-sm text-gray-600">{imageData.fileName}</span>
                                  </div>
                                </div>

                                {/* Grading Status */}
                                <div className="text-center">
                                  {status === 'processing' && (
                                    <div className="flex items-center space-x-2 text-blue-600">
                                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                      <span className="text-sm">Grading...</span>
                                    </div>
                                  )}
                                  {status === 'completed' && gradingResult && (
                                    <div className="text-green-600">
                                      <CheckCircle size={16} className="mx-auto mb-1" />
                                      <div className="text-sm font-medium">{gradingResult.marks}/{question.max_marks}</div>
                                    </div>
                                  )}
                                  {status === 'error' && (
                                    <div className="text-red-600">
                                      <AlertCircle size={16} className="mx-auto mb-1" />
                                      <div className="text-sm">Error</div>
                                    </div>
                                  )}
                                  {!status && (
                                    <button
                                      onClick={() => gradeAnswerImage(imageData)}
                                      className="bg-purple-500 text-white px-3 py-1 rounded text-sm hover:bg-purple-600 transition-colors"
                                    >
                                      Grade
                                    </button>
                                  )}
                                </div>

                                <button
                                  onClick={() => removeAnswerImage(imageData.id)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateSession}
                  disabled={!canCreateSession() || loading}
                  className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Creating Session...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Create Grading Session</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default CreateSession;