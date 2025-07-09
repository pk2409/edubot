// AI Grading Service using IBM Watsonx
import { WatsonxService } from '../watsonx.js';

class GradingService {
  constructor() {
    this.watsonxService = WatsonxService;
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
          confidence: 1,
          ocrText: '',
          ocrConfidence: 0
        };
      }
      
      // Grade the extracted text using Watsonx without answer key
      const grade = await this.gradeAnswerWithoutKey(question, ocrResult.text);
      
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

  // Extract text from uploaded answer image using OCR
  async extractTextFromImage(imageData) {
    try {
      console.log('Extracting text from answer image...');
      
      // Simulate OCR processing - in production, this would use actual OCR service
      // The OCR would analyze the actual image content
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // In a real implementation, this would:
      // 1. Send the image to an OCR service (Tesseract, Google Vision, etc.)
      // 2. Get back the extracted text with confidence scores
      // 3. Clean and format the text
      
      // For now, we'll simulate realistic OCR extraction
      const confidence = 80 + Math.random() * 15; // 80-95% confidence
      
      // Simulate extracted text that would come from OCR
      // Generate more realistic sample answers based on common student responses
      const sampleAnswers = [
        "Photosynthesis is the process by which plants make food using sunlight, water and carbon dioxide. Chlorophyll in leaves captures light energy and converts it to chemical energy. This produces glucose and oxygen.",
        "The water cycle includes evaporation from oceans, condensation in clouds, precipitation as rain, and collection in water bodies. This process repeats continuously.",
        "To solve 2x + 5 = 15: First subtract 5 from both sides: 2x = 10. Then divide by 2: x = 5. Therefore x equals 5.",
        "The three types of rocks are igneous (formed from cooled magma), sedimentary (formed from compressed layers), and metamorphic (formed by heat and pressure).",
        "Democracy is a system of government where people elect their representatives. Citizens have the right to vote and participate in decision making.",
        "Mitosis is cell division that produces two identical cells. The phases are prophase, metaphase, anaphase, and telophase.",
        "Force equals mass times acceleration (F = ma). This is Newton's second law of motion which describes the relationship between force, mass and acceleration."
      ];
      
      const extractedText = sampleAnswers[Math.floor(Math.random() * sampleAnswers.length)];
      
      console.log('OCR extraction completed with confidence:', confidence);
      
      return {
        text: extractedText,
        confidence: confidence
      };
    } catch (error) {
      console.error('Error extracting text from image:', error);
      throw error;
    }
  }

  // Grade answer using Watsonx without requiring answer key
  async gradeAnswerWithoutKey(question, studentAnswer) {
    try {
      const prompt = this.buildGradingPromptWithoutKey(question, studentAnswer);
      
      // Use Watsonx for intelligent grading
      const response = await this.watsonxService.sendMessage(prompt);
      
      return this.parseGradingResponse(response, question.max_marks);
    } catch (error) {
      console.error('Error grading answer with Watsonx:', error);
      
      // Fallback grading without answer key
      return this.fallbackGradingWithoutKey(question, studentAnswer);
    }
  }

  buildGradingPromptWithoutKey(question, studentAnswer) {
    return `You are an expert teacher grading a student's answer. Evaluate this response based on your knowledge of the subject and standard educational criteria.

QUESTION: ${question.question_text}
SUBJECT: ${question.subject || 'General'}
MAXIMUM MARKS: ${question.max_marks}

STUDENT ANSWER: ${studentAnswer}

Please grade this answer based on:
1. Correctness of the content
2. Completeness of the response
3. Clarity of explanation
4. Use of appropriate terminology
5. Logical structure and reasoning

Provide:
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

Be fair and consider partial credit for partially correct answers. Base your evaluation on educational standards for this type of question.`;
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
          feedback: parsed.feedback || 'Answer evaluated by AI',
          strengths: parsed.strengths || 'Shows effort in attempting the question',
          improvements: parsed.improvements || 'Continue practicing and studying',
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
    const feedback = feedbackMatch ? feedbackMatch[1].trim() : 'Answer evaluated by AI. Please review.';
    
    return {
      marks: marks,
      feedback: feedback,
      strengths: 'Shows understanding of the topic',
      improvements: 'Continue studying and practicing',
      confidence: 6
    };
  }

  fallbackGradingWithoutKey(question, studentAnswer) {
    // Intelligent fallback grading based on answer analysis
    const answerLength = studentAnswer.trim().length;
    const maxMarks = question.max_marks;
    
    let marks = 0;
    let feedback = '';
    let strengths = '';
    let improvements = '';
    
    if (answerLength === 0) {
      marks = 0;
      feedback = 'No answer provided';
      improvements = 'Please attempt to answer the question';
    } else if (answerLength < 20) {
      marks = Math.floor(maxMarks * 0.2);
      feedback = 'Very brief answer, needs more detail';
      strengths = 'Attempted the question';
      improvements = 'Provide more detailed explanation';
    } else if (answerLength < 50) {
      marks = Math.floor(maxMarks * 0.4);
      feedback = 'Basic answer provided, could be more comprehensive';
      strengths = 'Shows basic understanding';
      improvements = 'Add more details and examples';
    } else if (answerLength < 100) {
      marks = Math.floor(maxMarks * 0.6);
      feedback = 'Good attempt with reasonable detail';
      strengths = 'Provides adequate explanation';
      improvements = 'Could include more specific details';
    } else {
      marks = Math.floor(maxMarks * 0.8);
      feedback = 'Comprehensive answer with good detail';
      strengths = 'Detailed response showing good understanding';
      improvements = 'Continue with this level of detail';
    }
    
    // Analyze question type for better scoring
    const questionText = question.question_text.toLowerCase();
    if (questionText.includes('explain') || questionText.includes('describe')) {
      // Explanation questions need more detail
      if (answerLength > 100) marks = Math.min(marks + 1, maxMarks);
    } else if (questionText.includes('calculate') || questionText.includes('solve')) {
      // Math questions - look for numbers and operations
      const hasNumbers = /\d/.test(studentAnswer);
      const hasOperations = /[+\-*/=]/.test(studentAnswer);
      if (hasNumbers && hasOperations) {
        marks = Math.min(marks + 2, maxMarks);
        strengths += ' Shows mathematical working';
      }
    } else if (questionText.includes('list') || questionText.includes('name')) {
      // List questions - count items
      const items = studentAnswer.split(/[,\n•\-]/).filter(item => item.trim().length > 0);
      marks = Math.min(items.length * (maxMarks / 5), maxMarks);
    }
    
    marks = Math.max(0, Math.min(marks, maxMarks));
    
    return {
      marks: marks,
      feedback: feedback,
      strengths: strengths,
      improvements: improvements,
      confidence: 4
    };
  }

  calculateGrade(percentage) {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
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
}

export default new GradingService();