require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { analyzeImage, generateSummary, handleFollowUp } = require('./aiService');
const { generateSpeech } = require('./ttsService');
const { storeAnalysis, getAnalysis, hasSession } = require('./sessionManager');

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
const allowedOrigins = [
    'http://localhost:8000',  // Local development
    'http://localhost:3000',  // Local frontend
    'https://naitik615.github.io',  // GitHub Pages
    'https://naitik615.github.io/Health-Buddy'  // GitHub Pages with repo name
];

// CORS middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // Check if the request origin is in the allowed list
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Helper function to generate a new session ID
const generateSessionId = () => uuidv4();

// Helper middleware to check for valid session
const validateSession = (req, res, next) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
        return res.status(400).json({
            success: false,
            error: 'Session ID is required in X-Session-ID header'
        });
    }
    
    req.sessionId = sessionId;
    next();
};

// Phase 1: Analyze food label image
app.post('/api/analyze', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded or unsupported file type' 
            });
        }

        // Convert image to base64
        const imageBase64 = req.file.buffer.toString('base64');
        
        // Analyze the image using GPT-4 Vision
        const analysisResult = await analyzeImage(imageBase64, req.file.mimetype);
        
        if (!analysisResult.success) {
            return res.status(500).json({
                success: false,
                error: analysisResult.error,
                details: analysisResult.details
            });
        }

        // Generate a new session ID
        const sessionId = generateSessionId();
        
        // Store the analysis in the session
        storeAnalysis(sessionId, analysisResult.analysis);

        // Generate a user-friendly summary
        let summary = 'Analysis complete';
        try {
            const summaryResult = await generateSummary(analysisResult.analysis);
            if (summaryResult.success && summaryResult.summary) {
                summary = summaryResult.summary;
            } else {
                console.error('Failed to generate summary, using fallback:', summaryResult.error);
                // Create a basic summary from the analysis
                const product = analysisResult.analysis.productName || 'This product';
                const ingredients = analysisResult.analysis.ingredients?.join(', ') || 'various ingredients';
                summary = `${product} contains ${ingredients}. `;
                
                if (analysisResult.analysis.nutritionFacts?.calories) {
                    summary += `It has approximately ${analysisResult.analysis.nutritionFacts.calories} calories per serving.`;
                }
            }
        } catch (error) {
            console.error('Error generating summary:', error);
            summary = 'Analysis complete. Ask me anything about this product.';
        }

        // Prepare the response
        const responseData = {
            success: true,
            sessionId,
            summary,
            hasAnalysis: true,
            analysis: analysisResult.analysis // Include the full analysis for debugging
        };

        console.log('Sending response to client:', JSON.stringify({
            success: true,
            sessionId: responseData.sessionId,
            summary: responseData.summary.substring(0, 100) + '...',
            hasAnalysis: true
        }, null, 2));

        res.json(responseData);

    } catch (error) {
        console.error('Error in /api/analyze:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process image',
            details: error.message
        });
    }
});

// Phase 2: Get summary or handle follow-up questions
app.post('/api/chat', validateSession, async (req, res) => {
    try {
        const { message, isFollowUp = false } = req.body;
        const { sessionId } = req;

        // Get the stored analysis
        const sessionData = getAnalysis(sessionId);
        
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                error: 'Session not found or expired. Please scan the product again.'
            });
        }

        let response;
        
        if (isFollowUp && message) {
            // Handle follow-up question
            const followUpResult = await handleFollowUp(sessionData.analysis, message);
            
            if (!followUpResult.success) {
                throw new Error(followUpResult.error);
            }
            
            response = {
                success: true,
                response: followUpResult.response,
                isFollowUp: true
            };
        } else {
            // Generate a new summary
            const summaryResult = await generateSummary(sessionData.analysis);
            
            if (!summaryResult.success) {
                throw new Error(summaryResult.error);
            }
            
            response = {
                success: true,
                response: summaryResult.summary,
                isFollowUp: false
            };
        }

        res.json(response);

    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process request',
            details: error.message
        });
    }
});

// TTS Endpoint
app.post('/api/tts', express.json(), async (req, res) => {
    try {
        const { text, voice = 'alloy' } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        // Generate speech using the TTS service
        const audioBuffer = await generateSpeech(text, voice);
        
        // Set headers for audio response
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'no-cache',
            'Accept-Ranges': 'bytes'
        });
        
        // Send the audio buffer
        res.send(audioBuffer);
        
    } catch (error) {
        console.error('TTS Error:', error);
        res.status(500).json({ 
            error: 'Failed to generate speech',
            details: error.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Generate AI response
app.post('/generate-response', async (req, res) => {
    try {
        // Ensure the request has a body
        if (!req.body) {
            return res.status(400).json({ 
                success: false, 
                error: 'Request body is required' 
            });
        }

        // Support both { message: 'text' } and { text: 'text' } formats
        const message = req.body.message || req.body.text || req.body;
        
        if (!message) {
            return res.status(400).json({ 
                success: false, 
                error: 'Message is required in the request body' 
            });
        }

        console.log('Received request with message:', message);
        const result = await generateResponse(message);
        
        if (result.success) {
            res.json({ 
                success: true, 
                response: result.response 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: result.error,
                details: result.details
            });
        }
    } catch (error) {
        console.error('Error in /generate-response:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            details: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- POST /api/analyze (Image Analysis)');
    console.log('- POST /api/chat (Follow-up Questions)');
});