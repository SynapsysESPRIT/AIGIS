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

    // Function to check if user is in a Google Meet call
    function isInGoogleMeet() {
        // Check for Meet-specific UI elements that indicate an active call
        const micButton = document.querySelector('[aria-label*="microphone"], [data-is-muted]');
        const participantsList = document.querySelector('[aria-label*="participant"], .participants-list');
        const callControls = document.querySelector('.google-meet-controls, [role="dialog"]');

        return micButton !== null || participantsList !== null || callControls !== null;
    }

    // Function to check if user is in a Facebook call
    async function isInFacebookCall() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');

            // Check if any audio input device is in use
            for (const device of audioInputs) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: device.deviceId,
                        echoCancellation: true,
                        noiseSuppression: true
                    }
                });

                // Check if the stream is active and has audio tracks
                if (stream.active && stream.getAudioTracks().length > 0) {
                    // Check if the audio track is enabled and not muted
                    const audioTrack = stream.getAudioTracks()[0];
                    if (audioTrack.enabled && !audioTrack.muted) {
                        // Check if there's actual audio data being received
                        const localAudioContext = new AudioContext();
                        const source = localAudioContext.createMediaStreamSource(stream);
                        const analyser = localAudioContext.createAnalyser();
                        source.connect(analyser);

                        const dataArray = new Uint8Array(analyser.frequencyBinCount);
                        analyser.getByteFrequencyData(dataArray);

                        // If there's significant audio activity, user is likely in a call
                        const hasAudioActivity = dataArray.some(value => value > 0);
                        if (hasAudioActivity) {
                            return true;
                        }
                    }
                }
                // Clean up the stream when done
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
            console.log('Checking Google Meet call status...');
            return isInGoogleMeet();
        }

        // For Facebook calls
        if (url.includes('facebook.com') || url.includes('messenger.com')) {
            console.log('Checking Facebook call status...');
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

    // Log the current URL and call status for debugging
    console.log('Current URL:', window.location.href);
    console.log('Is video call window:', isVideoCallWindow());

    // Function to request tab capture from background script
    function requestTabCapture() {
        return new Promise((resolve) => {
            // Send message to background script to start tab capture
            chrome.runtime.sendMessage({ action: "startTabCapture" }, (response) => {
                if (response && response.stream) {
                    resolve(response.stream);
                } else {
                    console.error('Failed to get tab capture stream');
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

    // Function to process audio data
    function processAudioData(inputData) {
        audioChunks.push(...Array.from(inputData));

        // If 10 seconds of audio is collected, process it
        if (audioContext && (audioContext.currentTime - startTime >= 10)) {
            const wavBlob = createWavBlob(audioChunks, 1, audioContext.sampleRate);
            sendAudioToModel(wavBlob);
            audioChunks = []; // Reset chunks
            startTime = audioContext.currentTime; // Reset start time
        }
    }

    // Function to start audio processing
    async function startAudioProcessing() {
        try {
            // Only proceed if this is a video call window
            if (!isVideoCallWindow()) {
                console.log('Not a video call window. Audio capture paused.');
                return false;
            }

            // For Google Meet, check if we're in a call
            if (window.location.href.includes('meet.google.com') && !isInGoogleMeet()) {
                console.log('Not in an active Google Meet call. Audio capture paused.');
                return false;
            }

            console.log('Starting audio processing...');

            // Get the stream using chrome.tabCapture API
            const stream = await requestTabCapture();

            if (!stream) {
                console.error('No audio stream available from tab capture');
                return false;
            }

            console.log('Got audio stream:', stream);

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
                console.log('Processing audio data:', {
                    numberOfChannels: inputBuffer.numberOfChannels,
                    length: inputBuffer.length,
                    sampleRate: inputBuffer.sampleRate,
                    duration: inputBuffer.duration
                });
                processAudioData(inputBuffer.getChannelData(0));
            };

            console.log('Audio processing started successfully');
            return true;
        } catch (error) {
            console.error('Error starting audio processing:', error);
            return false;
        }
    }

    // Function to stop audio processing
    function stopAudioProcessing() {
        console.log('Stopping audio processing...');
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
        console.log('Audio processing stopped');
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "captureStarted" && message.success) {
            console.log('Received capture start message');
            startAudioProcessing();
        } else if (message.action === "captureStopped") {
            console.log('Received capture stop message');
            stopAudioProcessing();
        }
    });

    // Function to send audio to the model for inference
    async function sendAudioToModel(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.wav');

        try {
            const response = await fetch('http://127.0.0.1:8000/audio_app/infer/', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            console.log('Inference result:', result);
        } catch (error) {
            console.error('Error sending audio to model:', error);
        }
    }

    // Clean up on page unload
    window.addEventListener('unload', () => {
        stopAudioProcessing();
    });
})();