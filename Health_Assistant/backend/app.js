// Speech Recognition Setup
let recognition = null;
let isListening = false;
let isSpeaking = false;


// DOM Elements
const micButton = document.getElementById('micButton');
const statusDiv = document.getElementById('status');
const transcriptDiv = document.getElementById('transcript');
const audioPlayer = document.getElementById('audioPlayer');

// Initialize speech recognition
function initializeSpeechRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new window.SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    
    recognition.onstart = () => {
        isListening = true;
        statusDiv.textContent = "Listening...";
        micButton.style.background = '#4CAF50';
    };

    recognition.onend = () => {
        isListening = false;
        micButton.style.background = '#f44336';
    };

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        transcriptDiv.textContent = transcript;
        
        if (event.results[0].isFinal) {
            await sendToBackend(transcript);
        }
    };

    recognition.onerror = (event) => {
        console.error("Recognition error:", event.error);
        statusDiv.textContent = "Error: " + event.error;
        isListening = false;
    };
}

// Send text to backend for processing
async function sendToBackend(text) {
    try {
        statusDiv.textContent = "Processing...";
        
        const response = await fetch('http://localhost:3000/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        const data = await response.json();
        
        if (data.audio) {
            // Play the received audio
            audioPlayer.src = `data:audio/mp3;base64,${data.audio}`;
            await audioPlayer.play();
        }
        
        statusDiv.textContent = "Ready";
    } catch (error) {
        console.error('Error:', error);
        statusDiv.textContent = "Error processing request";
    }
}

// Toggle microphone
micButton.addEventListener('click', () => {
    if (!recognition) {
        initializeSpeechRecognition();
    }

    if (!isListening) {
        try {
            recognition.start();
        } catch (error) {
            console.error('Start error:', error);
            statusDiv.textContent = "Error starting recognition";
        }
    } else {
        recognition.stop();
    }
});