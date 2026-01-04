require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { 
  analyzeImage, 
  searchProductInfo,
  generateFormattedSummary,
  handleFollowUp 
} = require('./aiService');
const { 
  storeAnalysis, 
  getAnalysis, 
  updateSession,
  addToConversationHistory,
  hasSession,
  getSessionStats
} = require('./sessionManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (SUPPORTED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
  credentials: true
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Helper function to generate a new session ID
const generateSessionId = () => uuidv4();

// Helper middleware to validate session
const validateSession = (req, res, next) => {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'Session ID is required in X-Session-ID header'
    });
  }
  
  if (!hasSession(sessionId)) {
    return res.status(404).json({
      success: false,
      error: 'Session not found or expired. Please scan the product again.'
    });
  }
  
  req.sessionId = sessionId;
  next();
};

// ==================== MAIN ENDPOINTS ====================

// Phase 1: Analyze food label image with web search
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  console.log('\n========== NEW ANALYSIS REQUEST ==========');
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded or unsupported file type'
      });
    }

    // Step 1: Analyze the image
    console.log('Step 1: Analyzing image...');
    const imageBase64 = req.file.buffer.toString('base64');
    const analysisResult = await analyzeImage(imageBase64, req.file.mimetype);

    if (!analysisResult.success) {
      return res.status(500).json({
        success: false,
        error: analysisResult.error,
        details: analysisResult.details
      });
    }

    const analysis = analysisResult.analysis;
    console.log('✓ Image analysis complete');

    // Step 2: Search web for additional information
    console.log('Step 2: Searching web for product information...');
    const webSearchResult = await searchProductInfo(
      analysis.productName || 'Unknown Product',
      analysis.ingredients || []
    );

    const webInfo = webSearchResult.success ? webSearchResult.webInfo : {
      ingredientInfo: [],
      nutritionalContext: 'Additional information unavailable',
      recommendations: 'Consult with a healthcare provider',
      comparisons: []
    };
    console.log('✓ Web search complete');

    // Step 3: Generate formatted summary
    console.log('Step 3: Generating formatted summary...');
    const summaryResult = await generateFormattedSummary(analysis, webInfo);

    if (!summaryResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate summary',
        details: summaryResult.error
      });
    }

    const formattedData = summaryResult.data;
    console.log('✓ Formatted summary generated');

    // Step 4: Create session and store all data
    const sessionId = generateSessionId();
    storeAnalysis(sessionId, analysis, webInfo, formattedData);
    console.log(`✓ Session ${sessionId} created`);

    // Prepare response
    const responseData = {
      success: true,
      sessionId,
      data: formattedData,
      suggestedQuestions: [
        "What are the main health benefits?",
        "Are there any concerning ingredients?",
        "Is this suitable for my diet?",
        "How does this compare to similar products?"
      ]
    };

    console.log('✓ Sending response to client');
    console.log('========== ANALYSIS COMPLETE ==========\n');

    res.json(responseData);

  } catch (error) {
    console.error('❌ Error in /api/analyze:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process image',
      details: error.message
    });
  }
});

// Phase 2: Handle follow-up questions
app.post('/api/chat', validateSession, async (req, res) => {
  console.log('\n========== CHAT REQUEST ==========');
  
  try {
    const { message } = req.body;
    const { sessionId } = req;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string'
      });
    }

    console.log(`Session: ${sessionId}`);
    console.log(`Question: ${message}`);

    // Get session data
    const sessionData = getAnalysis(sessionId);

    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }

    // Add user message to history
    addToConversationHistory(sessionId, 'user', message);

    // Generate response
    console.log('Generating AI response...');
    const followUpResult = await handleFollowUp(
      sessionData.analysis,
      sessionData.webInfo || {},
      message,
      sessionData.conversationHistory || []
    );

    if (!followUpResult.success) {
      return res.status(500).json({
        success: false,
        error: followUpResult.error,
        details: followUpResult.details
      });
    }

    const aiResponse = followUpResult.response;

    // Add AI response to history
    addToConversationHistory(sessionId, 'assistant', aiResponse.answer);

    console.log('✓ Response generated');
    console.log('========== CHAT COMPLETE ==========\n');

    res.json({
      success: true,
      response: aiResponse.answer,
      suggestedQuestions: aiResponse.suggestedQuestions || [],
      conversationHistory: sessionData.conversationHistory
    });

  } catch (error) {
    console.error('❌ Error in /api/chat:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      details: error.message
    });
  }
});

// Get session information
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sessionData = getAnalysis(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      success: false,
      error: 'Session not found or expired'
    });
  }

  res.json({
    success: true,
    data: {
      hasAnalysis: !!sessionData.analysis,
      hasWebInfo: !!sessionData.webInfo,
      messageCount: sessionData.conversationHistory?.length || 0,
      productName: sessionData.analysis?.productName || 'Unknown'
    }
  });
});

// Delete session
app.delete('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const deleted = deleteSession(sessionId);

  res.json({
    success: deleted,
    message: deleted ? 'Session deleted' : 'Session not found'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    sessions: getSessionStats()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      details: err.message
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 Health Buddy Server Started');
  console.log('================================');
  console.log(`Port: ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('\n📍 Available Endpoints:');
  console.log('  POST   /api/analyze       - Analyze food label');
  console.log('  POST   /api/chat          - Ask follow-up questions');
  console.log('  GET    /api/session/:id   - Get session info');
  console.log('  DELETE /api/session/:id   - Delete session');
  console.log('  GET    /api/health        - Health check');
  console.log('================================\n');
});