import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { DatabaseService } from '../../services/supabase';
import { 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Eye,
  FileText,
  User,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Download,
  Edit3,
  Brain,
  Image
} from 'lucide-react';

const GradingInterface = () => {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [session, setSession] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grades, setGrades] = useState({});
  const [feedback, setFeedback] = useState('');
  const [showOriginalGrades, setShowOriginalGrades] = useState(true);

  useEffect(() => {
    loadGradingSession();
  }, [sessionId]);

  const loadGradingSession = async () => {
    setLoading(true);
    try {
      // Load actual session data from database
      const { data: sessionData, error: sessionError } = await DatabaseService.getGradingSessions(user.id);
      if (sessionError) throw sessionError;
      
      const currentSession = sessionData?.find(s => s.id === sessionId);
      if (!currentSession) {
        throw new Error('Session not found');
      }
      
      // Load submissions for this session
      const { data: submissionData, error: submissionError } = await DatabaseService.getSessionSubmissions(sessionId);
      if (submissionError) throw submissionError;

      setSession(currentSession);
      setSubmissions(submissionData || []);
      
      // Initialize grades for current submission
      if (submissionData && submissionData.length > 0) {
        const currentSubmission = submissionData[0];
        if (currentSubmission.ai_grades) {
          setGrades({
            marks: currentSubmission.ai_grades.marks,
            feedback: currentSubmission.ai_grades.feedback,
            strengths: currentSubmission.ai_grades.strengths,
            improvements: currentSubmission.ai_grades.improvements
          });
        }
        setFeedback(currentSubmission.teacher_feedback || '');
      }
    } catch (error) {
      console.error('Error loading grading session:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentSubmission = submissions[currentIndex];

  const handleGradeChange = (field, value) => {
    setGrades(prev => ({
      ...prev,
      [field]: field === 'marks' ? Math.max(0, parseInt(value) || 0) : value
    }));
  };

  const handleSaveGrades = async () => {
    setSaving(true);
    try {
      const question = session.question_paper.questions[0]; // For single question demo
      const maxMarks = question.max_marks;
      const marks = Math.min(grades.marks || 0, maxMarks);
      const percentage = (marks / maxMarks) * 100;
      const grade = percentage >= 90 ? 'A' : percentage >= 80 ? 'B' : percentage >= 70 ? 'C' : percentage >= 60 ? 'D' : 'F';

      // Update submission
      const updatedSubmissions = [...submissions];
      updatedSubmissions[currentIndex] = {
        ...currentSubmission,
        final_grades: {
          marks: marks,
          feedback: grades.feedback,
          strengths: grades.strengths,
          improvements: grades.improvements
        },
        total_marks: marks,
        percentage: percentage,
        grade: grade,
        teacher_feedback: feedback,
        is_reviewed: true,
        reviewed_at: new Date().toISOString()
      };

      setSubmissions(updatedSubmissions);

      // Move to next submission
      if (currentIndex < submissions.length - 1) {
        setCurrentIndex(currentIndex + 1);
        // Load grades for next submission
        const nextSubmission = updatedSubmissions[currentIndex + 1];
        if (nextSubmission.ai_grades) {
          setGrades({
            marks: nextSubmission.ai_grades.marks,
            feedback: nextSubmission.ai_grades.feedback,
            strengths: nextSubmission.ai_grades.strengths,
            improvements: nextSubmission.ai_grades.improvements
          });
        }
        setFeedback(nextSubmission.teacher_feedback || '');
      }

      console.log('Grades saved successfully');
    } catch (error) {
      console.error('Error saving grades:', error);
    } finally {
      setSaving(false);
    }
  };

  const navigateSubmission = (direction) => {
    const newIndex = direction === 'next' 
      ? Math.min(currentIndex + 1, submissions.length - 1)
      : Math.max(currentIndex - 1, 0);
    
    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
      
      // Load grades for the new submission
      const submission = submissions[newIndex];
      if (submission.final_grades) {
        // Load saved grades
        setGrades({
          marks: submission.final_grades.marks,
          feedback: submission.final_grades.feedback,
          strengths: submission.final_grades.strengths,
          improvements: submission.final_grades.improvements
        });
        setFeedback(submission.teacher_feedback || '');
      } else if (submission.ai_grades) {
        // Load AI grades
        setGrades({
          marks: submission.ai_grades.marks,
          feedback: submission.ai_grades.feedback,
          strengths: submission.ai_grades.strengths,
          improvements: submission.ai_grades.improvements
        });
        setFeedback('');
      }
    }
  };

  const resetToAIGrades = () => {
    if (currentSubmission.ai_grades) {
      setGrades({
        marks: currentSubmission.ai_grades.marks,
        feedback: currentSubmission.ai_grades.feedback,
        strengths: currentSubmission.ai_grades.strengths,
        improvements: currentSubmission.ai_grades.improvements
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading grading interface...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!session || !currentSubmission) {
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
      <div className="h-screen flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/grading')}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">{session.session_name}</h1>
                <p className="text-sm text-gray-600">{session.question_paper.subject} • Question-wise Grading</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {currentIndex + 1} of {submissions.length} submissions
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => navigateSubmission('prev')}
                  disabled={currentIndex === 0}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => navigateSubmission('next')}
                  disabled={currentIndex === submissions.length - 1}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex">
          {/* Answer Image Viewer */}
          <div className="w-1/3 bg-white border-r border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">Answer Image</h3>
              <p className="text-sm text-gray-600">{currentSubmission.file_name}</p>
            </div>
            <div className="p-4">
              <div className="bg-gray-100 rounded-lg p-4 text-center">
                {currentSubmission.file_url ? (
                  <img 
                    src={currentSubmission.file_url} 
                    alt="Student Answer"
                    className="max-w-full h-auto rounded"
                  />
                ) : (
                  <>
                    <Image className="mx-auto text-gray-400 mb-2" size={48} />
                    <p className="text-gray-600">Answer Image</p>
                    <p className="text-sm text-gray-500 mt-2">
                      {currentSubmission.file_name}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* OCR Text Panel */}
          <div className="w-1/3 bg-white border-r border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">Extracted Text (OCR)</h3>
              <p className="text-sm text-gray-600">
                Confidence: {currentSubmission.ocr_text?.confidence || 0}%
              </p>
            </div>
            <div className="p-4 h-full overflow-y-auto">
              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {currentSubmission.ocr_text?.text || 'No text extracted'}
                </pre>
              </div>
            </div>
          </div>

          {/* Grading Panel */}
          <div className="w-1/3 bg-white">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">Manual Review & Grading</h3>
                  <p className="text-sm text-gray-600">
                    {currentSubmission.student_name} ({currentSubmission.roll_number})
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {currentSubmission.is_reviewed && (
                    <CheckCircle className="text-green-500" size={20} />
                  )}
                  <button
                    onClick={resetToAIGrades}
                    className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                    title="Reset to AI grades"
                  >
                    <Brain size={16} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4 h-full overflow-y-auto">
              <div className="space-y-6">
                {/* Question Info */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-2">
                    Current Question ({currentSubmission.question_number || 1})
                  </h4>
                  <p className="text-sm text-blue-700 mb-2">
                    {currentSubmission.question_text || 'Question text not available'}
                  </p>
                  <div className="text-xs text-blue-600 bg-blue-100 p-2 rounded">
                    <strong>AI Evaluation:</strong> This answer was automatically graded by AI based on question content and educational standards.
                  </div>
                </div>

                {/* AI Grading Results */}
                {currentSubmission.ai_grades && (
                  <div className="bg-purple-50 rounded-lg p-4">
                    <h4 className="font-medium text-purple-800 mb-3 flex items-center">
                      <Brain size={16} className="mr-2" />
                      AI Grading Results
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-purple-700">AI Score:</span>
                        <span className="font-medium text-purple-800">
                          {currentSubmission.ai_grades.marks}/{currentSubmission.max_marks || 10}
                        </span>
                      </div>
                      <div>
                        <span className="text-purple-700">AI Feedback:</span>
                        <p className="text-purple-600 mt-1">{currentSubmission.ai_grades.feedback}</p>
                      </div>
                      <div>
                        <span className="text-purple-700">Confidence:</span>
                        <span className="ml-2 text-purple-600">{currentSubmission.ai_grades.confidence}/10</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Manual Grading */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-800">Manual Review</h4>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Final Marks
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={currentSubmission.max_marks || 10}
                      value={grades.marks || 0}
                      onChange={(e) => handleGradeChange('marks', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Feedback
                    </label>
                    <textarea
                      value={grades.feedback || ''}
                      onChange={(e) => handleGradeChange('feedback', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="3"
                      placeholder="Feedback for this answer..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Strengths
                    </label>
                    <textarea
                      value={grades.strengths || ''}
                      onChange={(e) => handleGradeChange('strengths', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="2"
                      placeholder="What the student did well..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Areas for Improvement
                    </label>
                    <textarea
                      value={grades.improvements || ''}
                      onChange={(e) => handleGradeChange('improvements', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="2"
                      placeholder="Areas that need improvement..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Overall Teacher Feedback
                    </label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="3"
                      placeholder="Overall feedback for the student..."
                    />
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-2">Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Final Marks:</span>
                      <span className="font-medium">
                        {grades.marks || 0} / {currentSubmission.max_marks || 10}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Percentage:</span>
                      <span className="font-medium">
                        {Math.round(((grades.marks || 0) / (currentSubmission.max_marks || 10)) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveGrades}
                  disabled={saving}
                  className="w-full bg-green-500 text-white py-3 px-4 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save & Next</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default GradingInterface;