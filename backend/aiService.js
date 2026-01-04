const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const ANALYSIS_PROMPT = `
You are a food label analysis tool. Extract the following information from the provided food label image:
1. Product name
2. Ingredients list (as listed on the package)
3. Nutrition facts (serving size, calories, macronutrients, etc.)
4. Allergen information
5. Any certifications (organic, non-GMO, etc.)
6. Expiration/best before date if visible

IMPORTANT: You MUST return a valid JSON object. If the image is not a food label or the text is not readable, return:
{
  "error": "I couldn't read the food label clearly. Please take a clear photo of the label and try again.",
  "isError": true
}

Otherwise, return a JSON object with this exact structure:
{
  "productName": "",
  "ingredients": [],
  "nutritionFacts": {
    "servingSize": "",
    "calories": 0,
    "macros": {},
    "otherNutrients": {}
  },
  "allergens": [],
  "certifications": [],
  "expiryDate": "",
  "confidenceScores": {
    "ingredients": 0.0,
    "nutritionFacts": 0.0,
    "allergens": 0.0
  },
  "isError": false
}
`;

const RESPONSE_PROMPT = `You are a helpful food label assistant. 
Provide a concise summary (10-15 seconds of reading time) of the 
food product based on the following analysis: {analysis} Focus on:
1. Main ingredients 
2. Key nutritional highlights 
3. Notable allergens or dietary restrictions 
4. Any special certifications Keep the response friendly, factual, and neutral in tone.
`;


const FOLLOW_UP_PROMPT = `You are a helpful food label assistant.
Answer the user's question based on the product analysis below.
If the question cannot be answered with the available information,
clearly state what information is missing. 
Product Analysis:
{analysis} 
User Question: 
{question} 
Answer concisely and factually. If the information isn't available in the analysis, say so.
`;


async function analyzeImage(imageBase64, mimeType) {
    console.log('\n===== STARTING IMAGE ANALYSIS =====');
    console.log(`Image MIME type: ${mimeType}`);
    console.log(`Image size: ${(imageBase64.length * 3/4).toLocaleString()} bytes (base64)`);
    
    try {
        if (!imageBase64 || typeof imageBase64 !== 'string') {
            throw new Error('Invalid image data: base64 string is empty or not a string');
        }

        if (!mimeType || !mimeType.startsWith('image/')) {
            throw new Error(`Invalid MIME type: ${mimeType}`);
        }

        console.log('Sending request to OpenAI API...');
        const startTime = Date.now();
        
        const requestData = {
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: ANALYSIS_PROMPT },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${imageBase64}`,
                                detail: "low" //making it low for testing mode 
                            }
                        }
                    ]
                }
            ],
            max_tokens: 1000
        };

        console.log('API Request Payload:', JSON.stringify({
            model: requestData.model,
            messages: [{
                role: requestData.messages[0].role,
                content: [
                    { type: 'text', text: requestData.messages[0].content[0].text.substring(0, 100) + '...' },
                    { type: 'image_url', image_url: { url: 'data:image/... (truncated)' } }
                ]
            }],
            max_tokens: requestData.max_tokens
        }, null, 2));

        const response = await openai.chat.completions.create(requestData);
        const responseTime = Date.now() - startTime;
        
        console.log(`\n===== OPENAI RESPONSE (${responseTime}ms) =====`);
        console.log('Response status:', response.status);
        
        if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
            console.error('No choices in response:', JSON.stringify(response, null, 2));
            throw new Error('No choices in API response');
        }

        const firstChoice = response.choices[0];
        if (!firstChoice.message || !firstChoice.message.content) {
            console.error('Invalid message format in response:', JSON.stringify(firstChoice, null, 2));
            throw new Error('Invalid message format in API response');
        }

        let content = firstChoice.message.content;
        console.log('Raw response (first 200 chars):', content.substring(0, 200) + '...');
        
        try {
            // Remove markdown code block markers if present
            if (content.startsWith('```json')) {
                content = content.replace(/^```json\n|\n```$/g, '').trim();
            } else if (content.startsWith('```')) {
                content = content.replace(/^```\n|\n```$/g, '').trim();
            }
            
            const analysis = JSON.parse(content);
            
            // Check if this is an error response from our prompt
            if (analysis.isError || analysis.error) {
                return { 
                    success: false, 
                    error: analysis.error || 'Failed to analyze the food label',
                    details: 'The model could not process the image as a food label'
                };
            }
            
            console.log('Successfully parsed analysis result');
            console.log('Analysis keys:', Object.keys(analysis));
            return { success: true, analysis };
        } catch (parseError) {
            console.error('Failed to parse response as JSON. Raw content:', content);
            throw new Error(`Failed to parse API response: ${parseError.message}`);
        }
        
    } catch (error) {
        console.error('\n===== ERROR DETAILS =====');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        
        if (error.response) {
            console.error('Error response status:', error.response.status);
            console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }

        return { 
            success: false, 
            error: 'Failed to analyze image',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        };
    } finally {
        console.log('===== END OF ANALYSIS =====\n');
    }
}

async function generateSummary(analysis) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: RESPONSE_PROMPT.replace('{analysis}', JSON.stringify(analysis, null, 2))
                }
            ],
            max_tokens: 300,
            temperature: 0.5
        });

        return { 
            success: true, 
            summary: response.choices[0].message.content.trim()
        };
    } catch (error) {
        console.error('Error generating summary:', error);
        return { 
            success: false, 
            error: 'Failed to generate summary',
            details: error.message 
        };
    }
}

async function handleFollowUp(analysis, question) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: FOLLOW_UP_PROMPT
                        .replace('{analysis}', JSON.stringify(analysis, null, 2))
                        .replace('{question}', question)
                }
            ],
            max_tokens: 300,
            temperature: 0.5
        });

        return { 
            success: true, 
            response: response.choices[0].message.content.trim()
        };
    } catch (error) {
        console.error('Error handling follow-up:', error);
        return { 
            success: false, 
            error: 'Failed to process follow-up question',
            details: error.message 
        };
    }
}

/**
 * Generate speech from text using OpenAI's TTS
 * @param {string} text - The text to convert to speech
 * @param {string} [voice='alloy'] - The voice to use (alloy, echo, fable, onyx, nova, or shimmer)
 * @returns {Promise<Buffer>} - Audio buffer containing the generated speech
 */
async function generateSpeech(text, voice = 'alloy') {
    try {
        const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
        if (!validVoices.includes(voice)) {
            throw new Error(`Invalid voice. Must be one of: ${validVoices.join(', ')}`);
        }

        const response = await openai.audio.speech.create({
            model: "tts-1",
            voice: voice,
            input: text,
            response_format: 'mp3',
            speed: 1.0
        });

        // Convert the response to a buffer
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error('Error generating speech:', error);
        throw new Error(`Failed to generate speech: ${error.message}`);
    }
}

module.exports = {
    analyzeImage,
    generateSummary,
    handleFollowUp,
    generateSpeech
};
