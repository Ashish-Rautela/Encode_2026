const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Supported image MIME types
const SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
];

const SYSTEM_PROMPT = `You are an AI-native food label co-pilot.

Your role is to help users understand food ingredients at the exact moment they are making a decision.
You are not a database, a recommendation engine, or a medical authority.

Core behavior:
- Act as a calm, intelligent co-pilot, not a lookup tool.
- Do the cognitive work on behalf of the user.
- Reduce confusion and cognitive effort.
- Explain reasoning clearly and concisely.

When given a product or ingredient list:
- Explain what matters and why it matters.
- Translate complex or regulatory language into plain, human-friendly terms.
- Describe trade-offs instead of giving absolute judgments.
- Communicate uncertainty honestly and explicitly when information is incomplete or ambiguous.

Response style:
- Be concise, clear, and neutral in tone.
- Avoid alarmist or sensational language.
- Do not say “good” or “bad” without context.
- Prefer “this may matter because…” over definitive claims.

Follow-up questions:
- Maintain context within the same product session.
- Answer follow-up questions based on the previously analyzed product.
- Do not assume new products unless explicitly stated.

Personalization:
- Use any provided user context (such as allergies or preferences) only when relevant.
- Never ask users to fill forms or configure settings.
- Infer intent from questions rather than demanding explicit input.

Safety and scope:
- Do NOT provide medical advice or diagnoses.
- Do NOT prescribe diets or treatments.
- Do NOT claim certainty where none exists.
- If a question crosses into medical territory, explain limits clearly and redirect to general information.

Your goal is not to tell users what to eat,
but to help them understand what they are looking at,
so they can decide for themselves.
`;

// In responseGenerator.js
async function generateResponse(userInput) {
    try {
        let messageContent;
        
        // Handle different input types (text or image)
        if (userInput && userInput.image) {
            // Process image with Vision API
            // ... existing image processing code ...
        } else {
            // Handle text input - more robust handling
            let userMessage;
            
            if (typeof userInput === 'string') {
                userMessage = userInput;
            } else if (userInput && typeof userInput === 'object') {
                userMessage = userInput.text || userInput.message || JSON.stringify(userInput);
            } else {
                userMessage = String(userInput);
            }
            
            if (!userMessage || userMessage.trim() === '') {
                throw new Error('No valid input provided');
            }

            const completion = await openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    { 
                        role: "system", 
                        content: SYSTEM_PROMPT 
                    },
                    { 
                        role: "user", 
                        content: userMessage 
                    }
                ],
                max_tokens: 500,
                temperature: 0.7,
            });
            
            messageContent = completion.choices[0].message.content;
        }

        return {
            success: true,
            response: messageContent.trim()
        };
    } catch (error) {
        console.error('Error in generateResponse:', error);
        return {
            success: false,
            error: 'Failed to generate response',
            details: error.message
        };
    }
}

module.exports = { 
    generateResponse,
    SUPPORTED_IMAGE_TYPES 
};



// // In responseGenerator.js
// async function generateResponse(userInput) {
//     try {
//         let messageContent;
        
//         // Handle different input types (text or image)
//         if (userInput && userInput.image) {
//             // Process image with Vision API
//             // ... existing image processing code ...
//         } else {
//             // Handle text input - more robust handling
//             let userMessage;
            
//             if (typeof userInput === 'string') {
//                 userMessage = userInput;
//             } else if (userInput && typeof userInput === 'object') {
//                 userMessage = userInput.text || userInput.message || JSON.stringify(userInput);
//             } else {
//                 userMessage = String(userInput);
//             }
            
//             if (!userMessage || userMessage.trim() === '') {
//                 throw new Error('No valid input provided');
//             }

//             const completion = await openai.chat.completions.create({
//                 model: "gpt-4-turbo",
//                 messages: [
//                     { 
//                         role: "system", 
//                         content: SYSTEM_PROMPT 
//                     },
//                     { 
//                         role: "user", 
//                         content: userMessage 
//                     }
//                 ],
//                 max_tokens: 500,
//                 temperature: 0.7,
//             });
            
//             messageContent = completion.choices[0].message.content;
//         }

//         return {
//             success: true,
//             response: messageContent.trim()
//         };
//     } catch (error) {
//         console.error('Error in generateResponse:', error);
//         return {
//             success: false,
//             error: 'Failed to generate response',
//             details: error.message
//         };
//     }
// }