// This script captures audio from Facebook calls, segments it into 5-second chunks, and sends it to the model for inference.

(function () {
    // Function to create WAV file from audio buffer
    function createWavBlob(audioData, numChannels, sampleRate) {
        const buffer = new ArrayBuffer(44 + audioData.length * 2);
        const view = new DataView(buffer);

        // Write WAV header
        writeUTFBytes(view, 0, 'RIFF');
        view.setUint32(4, 36 + audioData.length * 2, true);
        writeUTFBytes(view, 8, 'WAVE');
        writeUTFBytes(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true);
        view.setUint16(32, numChannels * 2, true);
        view.setUint16(34, 16, true);
        writeUTFBytes(view, 36, 'data');
        view.setUint32(40, audioData.length * 2, true);

        // Write audio data
        const length = audioData.length;
        let index = 44;
        for (let i = 0; i < length; i++) {
            view.setInt16(index, audioData[i] * 0x7FFF, true);
            index += 2;
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    function writeUTFBytes(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Enhanced function to check if user is in a Google Meet call
    function isInGoogleMeet() {
        const micButton = document.querySelector('[aria-label*="microphone"], [data-is-muted]');
        const participantsList = document.querySelector('[aria-label*="participant"], .participants-list');
        const callControls = document.querySelector('.google-meet-controls, [role="dialog"]');

        return micButton !== null || participantsList !== null || callControls !== null;
    }

    // Enhanced function to check if user is in a Facebook call
    async function isInFacebookCall() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');

            for (const device of audioInputs) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: device.deviceId,
                        echoCancellation: true,
                        noiseSuppression: true
                    }
                });

                if (stream.active && stream.getAudioTracks().length > 0) {
                    const audioTrack = stream.getAudioTracks()[0];
                    if (audioTrack.enabled && !audioTrack.muted) {
                        const localAudioContext = new AudioContext();
                        const source = localAudioContext.createMediaStreamSource(stream);
                        const analyser = localAudioContext.createAnalyser();
                        source.connect(analyser);

                        const dataArray = new Uint8Array(analyser.frequencyBinCount);
                        analyser.getByteFrequencyData(dataArray);

                        const hasAudioActivity = dataArray.some(value => value > 0);

                        if (hasAudioActivity) {
                            return true;
                        }
                    }
                }
                stream.getTracks().forEach(track => track.stop());
            }
            return false;
        } catch (error) {
            console.error('Error checking Facebook call status:', error);
            return false;
        }
    }

    // Function to check if user is in a call
    async function isUserInCall() {
        const url = window.location.href;

        // For Google Meet
        if (url.includes('meet.google.com')) {
            return isInGoogleMeet();
        }

        // For Facebook calls
        if (url.includes('facebook.com') || url.includes('messenger.com')) {
            return await isInFacebookCall();
        }

        return false;
    }

    // Function to check if this is a video call window
    function isVideoCallWindow() {
        const url = window.location.href;
        return url.includes('facebook.com/messenger/room') ||
            url.includes('facebook.com/call') ||
            url.includes('messenger.com/call') ||
            url.includes('facebook.com/groupcall/ROOM-') ||
            url.includes('meet.google.com/');
    }

    // Function to request tab capture from background script
    function requestTabCapture() {
        return new Promise((resolve) => {
            // Send message to background script to start tab capture
            chrome.runtime.sendMessage({ action: "startTabCapture" }, (response) => {
                if (response && response.stream) {
                    resolve(response.stream);
                } else {
                    resolve(null);
                }
            });
        });
    }

    let audioContext = null;
    let audioProcessor = null;
    let audioSource = null;
    let audioChunks = [];
    let startTime = 0;

    // Updated to analyze audio every 5 seconds instead of sending requests more frequently
    function processAudioData(inputData) {
        audioChunks.push(...Array.from(inputData));

        // If 5 seconds of audio is collected, process it
        if (audioContext && (audioContext.currentTime - startTime >= 5)) {
            const wavBlob = createWavBlob(audioChunks, 1, audioContext.sampleRate);
            sendAudioToModel(wavBlob);
            audioChunks = []; // Reset chunks
            startTime = audioContext.currentTime; // Reset start time
        }
    }

    // Function to start audio processing from the user's microphone
    async function startMicrophoneAudioProcessing() {
        try {
            // Get the user's microphone stream
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Create audio context and processor
            audioContext = new AudioContext();
            audioSource = audioContext.createMediaStreamSource(stream);
            audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);

            // Connect the audio nodes
            audioSource.connect(audioProcessor);
            audioProcessor.connect(audioContext.destination);

            // Set up audio processing
            startTime = audioContext.currentTime;
            audioProcessor.onaudioprocess = (event) => {
                const inputBuffer = event.inputBuffer;
                processAudioData(inputBuffer.getChannelData(0));
            };

            return true;
        } catch (error) {
            console.error('Error starting microphone audio processing:', error);
            return false;
        }
    }

    // Function to start audio processing
    async function startAudioProcessing() {
        try {
            // Use microphone audio instead of tab capture
            return await startMicrophoneAudioProcessing();
        } catch (error) {
            return false;
        }
    }

    // Function to stop audio processing
    function stopAudioProcessing() {
        if (audioProcessor) {
            audioProcessor.disconnect();
            audioProcessor = null;
        }
        if (audioSource) {
            audioSource.disconnect();
            audioSource = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        audioChunks = [];
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "captureStarted" && message.success) {
            startAudioProcessing();
        } else if (message.action === "captureStopped") {
            stopAudioProcessing();
        }
    });

    // Function to display sentiment analysis results in the console
    async function displaySentimentResults(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.wav');

        try {
            const apiUrl = "http://127.0.0.1:8000/audio/infer_audio/";
            const response = await fetch(apiUrl, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.sentiment) {
                console.log(`Emotion: ${result.sentiment.emotion}`);
                console.log(`Confidence: ${result.sentiment.confidence}%`);
                console.log('Probabilities:', result.sentiment.probabilities);
            } else {
                console.log('No sentiment data received.');
            }
        } catch (error) {
            console.error('Error displaying sentiment results:', error);
        }
    }

    // Function to send audio to the model for inference
    async function sendAudioToModel(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.wav');

        try {
            const apiUrl = "http://127.0.0.1:8000/audio/infer_audio/";
            const response = await fetch(apiUrl, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            // Display sentiment analysis results
            await displaySentimentResults(audioBlob);
        } catch (error) {
            console.error('Error sending audio to model:', error);
        }
    }

    // Function to start audio processing when the microphone is connected and the tab is open
    async function startAudioProcessingOnMicConnection() {
        try {
            // Check if the microphone is connected
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');

            if (audioInputs.length === 0) {
                return;
            }

            // Check if the tab is active and open
            if (document.visibilityState === 'visible') {
                await startMicrophoneAudioProcessing();
            }

            // Listen for visibility changes to start/stop audio processing dynamically
            document.addEventListener('visibilitychange', async () => {
                if (document.visibilityState === 'visible') {
                    await startMicrophoneAudioProcessing();
                } else {
                    stopAudioProcessing();
                }
            });
        } catch (error) {
            console.error('Error checking microphone connection or tab status:', error);
        }
    }

    // Call the function to start monitoring microphone connection and tab status
    startAudioProcessingOnMicConnection();

    // Clean up on page unload
    window.addEventListener('unload', () => {
        stopAudioProcessing();
    });
})();