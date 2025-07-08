// AI Grading Service using IBM Watsonx
import { WatsonxService } from '../watsonx.js';

class GradingService {
  constructor() {
    this.watsonxService = WatsonxService;
  }

  async gradeSubmission(questionPaper, ocrText) {
    try {
      console.log('Starting AI grading for submission...');
      
      const grades = [];
      const questions = questionPaper.questions || [];
      
      // Extract answers from OCR text
      const extractedAnswers = this.extractAnswersFromOCR(ocrText, questions.length);
      
      // Grade each question
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const studentAnswer = extractedAnswers[i] || '';
        
        if (studentAnswer.trim()) {
          const grade = await this.gradeAnswer(question, studentAnswer);
          grades.push({
            questionNumber: i + 1,
            question: question.question_text,
            studentAnswer: studentAnswer,
            maxMarks: question.max_marks,
            ...grade
          });
        } else {
          // No answer found
          grades.push({
            questionNumber: i + 1,
            question: question.question_text,
            studentAnswer: '',
            maxMarks: question.max_marks,
            marks: 0,
            feedback: 'No answer provided',
            strengths: '',
            improvements: 'Please provide an answer to this question',
            confidence: 10
          });
        }
      }
      
      const totalMarks = grades.reduce((sum, grade) => sum + grade.marks, 0);
      const maxTotalMarks = grades.reduce((sum, grade) => sum + grade.maxMarks, 0);
      const percentage = maxTotalMarks > 0 ? (totalMarks / maxTotalMarks) * 100 : 0;
      
      console.log('AI grading completed:', {
        totalQuestions: grades.length,
        totalMarks: totalMarks,
        maxTotalMarks: maxTotalMarks,
        percentage: percentage.toFixed(1)
      });
      
      return {
        grades: grades,
        totalMarks: totalMarks,
        maxTotalMarks: maxTotalMarks,
        percentage: percentage,
        overallFeedback: this.generateOverallFeedback(percentage, grades)
      };
    } catch (error) {
      console.error('Error in AI grading:', error);
      throw error;
    }
  }

  // Grade individual answer images uploaded by teacher
  async gradeAnswerImage(question, answerImageData, studentInfo) {
    try {
      console.log('Grading answer image for question:', question.question_number);
      
      // First, extract text from the image using OCR
      const ocrResult = await this.extractTextFromImage(answerImageData);
      
      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        return {
          marks: 0,
          feedback: 'No readable text found in the answer image',
          strengths: '',
          improvements: 'Please ensure the answer is clearly written and visible',
          confidence: 10,
          ocrText: '',
          ocrConfidence: 0
        };
      }
      
      // Grade the extracted text
      const grade = await this.gradeAnswer(question, ocrResult.text);
      
      return {
        ...grade,
        ocrText: ocrResult.text,
        ocrConfidence: ocrResult.confidence,
        studentInfo: studentInfo
      };
    } catch (error) {
      console.error('Error grading answer image:', error);
      return {
        marks: 0,
        feedback: 'Error processing answer image',
        strengths: '',
        improvements: 'Please try uploading the image again',
        confidence: 0,
        ocrText: '',
        ocrConfidence: 0,
        error: error.message
      };
    }
  }

  // Extract text from uploaded answer image
  async extractTextFromImage(imageData) {
    try {
      // Simulate OCR processing - in production, this would use actual OCR
      // For now, we'll generate realistic sample text based on common student answers
      const sampleAnswers = [
        "The process of photosynthesis involves chlorophyll absorbing sunlight to convert carbon dioxide and water into glucose and oxygen.",
        "To solve this equation: 2x + 5 = 15, we subtract 5 from both sides to get 2x = 10, then divide by 2 to get x = 5.",
        "The Harappan civilization was one of the earliest urban civilizations, known for their advanced city planning and drainage systems.",
        "Shakespeare's use of metaphors in this passage creates vivid imagery that helps convey the character's emotional state.",
        "The algorithm works by comparing adjacent elements and swapping them if they are in the wrong order, repeating until the list is sorted."
      ];
      
      const randomAnswer = sampleAnswers[Math.floor(Math.random() * sampleAnswers.length)];
      const confidence = 85 + Math.random() * 10; // 85-95% confidence
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        text: randomAnswer,
        confidence: confidence
      };
    } catch (error) {
      console.error('Error extracting text from image:', error);
      throw error;
    }
  }

  async gradeAnswer(question, studentAnswer) {
    try {
      const prompt = this.buildGradingPrompt(question, studentAnswer);
      
      // Use Watsonx for grading
      const response = await this.watsonxService.sendMessage(prompt);
      
      return this.parseGradingResponse(response, question.max_marks);
    } catch (error) {
      console.error('Error grading individual answer:', error);
      
      // Fallback grading
      return this.fallbackGrading(question, studentAnswer);
    }
  }

  buildGradingPrompt(question, studentAnswer) {
    return `You are an expert teacher grading a student's answer. Please evaluate this response carefully and provide detailed feedback.

QUESTION: ${question.question_text}
MAXIMUM MARKS: ${question.max_marks}
ANSWER KEY/RUBRIC: ${question.answer_key || 'Use your expertise to evaluate the answer'}

STUDENT ANSWER: ${studentAnswer}

Please grade this answer and provide:
1. MARKS: Give a specific score out of ${question.max_marks} marks
2. FEEDBACK: Brief constructive feedback (2-3 sentences)
3. STRENGTHS: What the student did well
4. IMPROVEMENTS: Specific areas for improvement
5. CONFIDENCE: Your confidence in this grading (1-10 scale)

Format your response as JSON:
{
  "marks": number (0 to ${question.max_marks}),
  "feedback": "string",
  "strengths": "string", 
  "improvements": "string",
  "confidence": number (1-10)
}

Be fair but thorough in your evaluation. Consider partial credit for partially correct answers.`;
  }

  parseGradingResponse(response, maxMarks) {
    try {
      // Try to extract JSON from the response
      let cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Look for JSON object in the response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate and sanitize the response
        return {
          marks: Math.min(Math.max(0, parsed.marks || 0), maxMarks),
          feedback: parsed.feedback || 'Good effort!',
          strengths: parsed.strengths || 'Shows understanding of the topic',
          improvements: parsed.improvements || 'Continue practicing',
          confidence: Math.min(Math.max(1, parsed.confidence || 5), 10)
        };
      }
    } catch (parseError) {
      console.error('Error parsing grading response:', parseError);
    }
    
    // Fallback parsing if JSON parsing fails
    return this.extractGradingInfo(response, maxMarks);
  }

  extractGradingInfo(response, maxMarks) {
    // Extract information using regex patterns
    const marksMatch = response.match(/marks?[:\s]*(\d+(?:\.\d+)?)/i);
    const feedbackMatch = response.match(/feedback[:\s]*([^\.]+\.?)/i);
    
    const marks = marksMatch ? Math.min(parseFloat(marksMatch[1]), maxMarks) : Math.floor(maxMarks * 0.6);
    const feedback = feedbackMatch ? feedbackMatch[1].trim() : 'Good effort! Keep practicing.';
    
    return {
      marks: marks,
      feedback: feedback,
      strengths: 'Shows effort and understanding',
      improvements: 'Continue studying and practicing',
      confidence: 6
    };
  }

  fallbackGrading(question, studentAnswer) {
    // Simple keyword-based fallback grading
    const answerLength = studentAnswer.trim().length;
    const maxMarks = question.max_marks;
    
    let marks = 0;
    
    if (answerLength > 0) {
      // Basic scoring based on answer length and keywords
      if (answerLength > 50) marks += maxMarks * 0.3;
      if (answerLength > 100) marks += maxMarks * 0.2;
      if (answerLength > 200) marks += maxMarks * 0.2;
      
      // Check for key terms from the question
      const questionWords = question.question_text.toLowerCase().split(' ');
      const answerWords = studentAnswer.toLowerCase().split(' ');
      
      const keywordMatches = questionWords.filter(word => 
        word.length > 3 && answerWords.includes(word)
      ).length;
      
      marks += (keywordMatches / questionWords.length) * maxMarks * 0.3;
    }
    
    marks = Math.min(Math.round(marks), maxMarks);
    
    return {
      marks: marks,
      feedback: 'Answer evaluated using basic criteria. Please review with teacher.',
      strengths: answerLength > 50 ? 'Provided a detailed response' : 'Attempted the question',
      improvements: 'Consider adding more specific details and examples',
      confidence: 4
    };
  }

  extractAnswersFromOCR(ocrText, numQuestions) {
    // Extract individual answers from OCR text
    const answers = [];
    
    if (!ocrText.pages || ocrText.pages.length === 0) {
      return new Array(numQuestions).fill('');
    }
    
    const fullText = ocrText.pages.map(page => page.text).join('\n');
    
    // Try to split by question numbers
    const questionPattern = /(?:Question|Q\.?)\s*(\d+)[:\.]?\s*(.*?)(?=(?:Question|Q\.?)\s*\d+|$)/gis;
    const matches = [...fullText.matchAll(questionPattern)];
    
    if (matches.length > 0) {
      // Found question-based structure
      for (let i = 0; i < numQuestions; i++) {
        const match = matches.find(m => parseInt(m[1]) === i + 1);
        answers.push(match ? match[2].trim() : '');
      }
    } else {
      // Split by paragraphs or sections
      const sections = fullText.split(/\n\s*\n/).filter(section => section.trim());
      
      for (let i = 0; i < numQuestions; i++) {
        answers.push(sections[i] || '');
      }
    }
    
    return answers;
  }

  generateOverallFeedback(percentage, grades) {
    if (percentage >= 90) {
      return 'Excellent work! You have demonstrated a strong understanding of the concepts.';
    } else if (percentage >= 80) {
      return 'Very good performance! You show good grasp of most concepts with room for minor improvements.';
    } else if (percentage >= 70) {
      return 'Good effort! You understand the basic concepts but could benefit from more detailed explanations.';
    } else if (percentage >= 60) {
      return 'Fair performance. Focus on understanding key concepts and providing more complete answers.';
    } else {
      return 'Needs improvement. Please review the material and practice more. Consider seeking additional help.';
    }
  }

  calculateGrade(percentage) {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  }
}

export default new GradingService();