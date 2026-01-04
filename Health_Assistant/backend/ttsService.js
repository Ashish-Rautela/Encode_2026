const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate speech from text using OpenAI's TTS
 * @param {string} text - The text to convert to speech
 * @param {string} [voice='alloy'] - The voice to use (alloy, echo, fable, onyx, nova, or shimmer)
 * @returns {Promise<Buffer>} - Audio buffer containing the generated speech
 */
async function generateSpeech(text, voice = 'alloy') {
    if (!text) {
        throw new Error('No text provided for TTS');
    }

    try {
        const mp3 = await openai.audio.speech.create({
            model: 'tts-1',
            voice: voice.toLowerCase(),
            input: text,
            response_format: 'mp3',
            speed: 1.0
        });

        return Buffer.from(await mp3.arrayBuffer());
    } catch (error) {
        console.error('Error in TTS generation:', error);
        throw new Error('Failed to generate speech');
    }
}

module.exports = {
    generateSpeech
};
