const chatContainer = document.getElementById('chat-container');
const questionInput = document.getElementById('question-input');
const askButton = document.getElementById('ask-button');
const clearButton = document.getElementById('clear-button');

let conversationHistory = [];
const activeAudioPlayers = new Map();

function updateChatDisplay() {
    chatContainer.innerHTML = '';
    conversationHistory.forEach((entry, index) => {
        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.style.clear = 'both';
        bubbleWrapper.style.marginBottom = '10px';

        const bubble = document.createElement('div');
        bubble.className = entry.type === 'question' ? 'question-bubble' : 'answer-bubble';
        bubble.innerHTML = (entry.content || '').replace(/\\n/g, '<br>');

        bubbleWrapper.appendChild(bubble);

        if (entry.type === 'answer' && entry.audio_data && entry.audio_format) {
            const audioControlsContainer = document.createElement('div');
            audioControlsContainer.style.marginTop = '5px';
            audioControlsContainer.id = `audio-controls-${index}`;

            const playButton = document.createElement('button');
            playButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z"/></svg> Play Audio';
            playButton.className = 'btn btn-sm btn-outline-success ms-2';
            playButton.dataset.entryIndex = index;

            playButton.onclick = async function () {
                const currentIndex = this.dataset.entryIndex;
                const currentEntry = conversationHistory[currentIndex];
                let player = activeAudioPlayers.get(currentIndex);

                if (player && player.audioElement) {
                    if (player.audioElement.paused) {
                        player.audioElement.play();
                        this.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pause-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM6.25 5C5.56 5 5 5.56 5 6.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C7.5 5.56 6.94 5 6.25 5zm3.5 0c-.69 0-1.25.56-1.25 1.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C11 5.56 10.44 5 9.75 5z"/></svg> Pause';
                        player.stopButton.style.display = 'inline-block';
                    } else {
                        player.audioElement.pause();
                        this.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z"/></svg> Resume';
                    }
                    return;
                }

                this.disabled = true;
                this.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-hourglass-split" viewBox="0 0 16 16"><path d="M2.5 15a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm2-1a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Z"/><path d="M12 1H4a1 1 0 0 0-1 1v2.393A6.5 6.5 0 0 0 2.5 8a6.5 6.5 0 0 0 .5 3.607V14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.393A6.5 6.5 0 0 0 13.5 8a6.5 6.5 0 0 0-.5-3.607V2a1 1 0 0 0-1-1Zm-1 13H5V8.5A5.5 5.5 0 0 1 5.5 8a5.5 5.5 0 0 1 5-4.95V14Zm.5-11.107A5.501 5.501 0 0 1 12.5 8 5.5 5.5 0 0 1 7 12.95V2.893Z"/></svg> Loading...';

                const stopButton = document.createElement('button');
                stopButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-stop-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM6.5 5A1.5 1.5 0 0 0 5 6.5v3A1.5 1.5 0 0 0 6.5 11h3A1.5 1.5 0 0 0 11 9.5v-3A1.5 1.5 0 0 0 9.5 5h-3z"/></svg> Stop';
                stopButton.className = 'btn btn-sm btn-outline-danger ms-2';
                stopButton.style.display = 'none';

                const cleanupAndReset = () => {
                    if (player && player.audioUrl) {
                        URL.revokeObjectURL(player.audioUrl);
                    }
                    playButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z"/></svg> Play Audio';
                    playButton.disabled = false;
                    stopButton.style.display = 'none';
                    activeAudioPlayers.delete(currentIndex);
                };

                stopButton.onclick = () => {
                    if (player && player.audioElement) {
                        player.audioElement.pause();
                        player.audioElement.currentTime = 0;
                    }
                    cleanupAndReset();
                };

                audioControlsContainer.appendChild(stopButton);

                try {
                    const byteCharacters = atob(currentEntry.audio_data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const audioBlob = new Blob([byteArray], { type: currentEntry.audio_format });
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audioElement = new Audio(audioUrl);

                    player = { audioElement, audioUrl, stopButton };
                    activeAudioPlayers.set(currentIndex, player);

                    audioElement.oncanplaythrough = () => {
                        if (playButton.disabled) {
                            playButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pause-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM6.25 5C5.56 5 5 5.56 5 6.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C7.5 5.56 6.94 5 6.25 5zm3.5 0c-.69 0-1.25.56-1.25 1.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C11 5.56 10.44 5 9.75 5z"/></svg> Pause';
                            playButton.disabled = false;
                            stopButton.style.display = 'inline-block';
                        }
                    };
                    audioElement.onplaying = () => {
                        playButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pause-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM6.25 5C5.56 5 5 5.56 5 6.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C7.5 5.56 6.94 5 6.25 5zm3.5 0c-.69 0-1.25.56-1.25 1.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C11 5.56 10.44 5 9.75 5z"/></svg> Pause';
                        playButton.disabled = false;
                        stopButton.style.display = 'inline-block';
                    };
                    audioElement.onended = cleanupAndReset;
                    audioElement.onerror = () => {
                        console.error("Error playing audio object.");
                        alert("Could not play audio: Error with audio element.");
                        cleanupAndReset();
                    };
                    audioElement.play();

                } catch (e) {
                    console.error("Error decoding or playing audio:", e);
                    alert("Could not play audio: " + e.message);
                    cleanupAndReset();
                }
            };
            audioControlsContainer.appendChild(playButton);
            bubble.appendChild(audioControlsContainer);
        }
        chatContainer.appendChild(bubbleWrapper);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

askButton.addEventListener('click', async () => {
    const question = questionInput.value.trim();
    if (!question) return;

    conversationHistory.push({ type: 'question', content: question });
    updateChatDisplay();

    const thinkingMessageIndex = conversationHistory.length;
    conversationHistory.push({ type: 'answer', content: '<i>Mom Helper is thinking...</i>' });
    updateChatDisplay();

    try {
        const response = await fetch('/chatbot/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ question: question }),
        });

        const data = await response.json();

        const answerEntry = {
            type: 'answer',
            content: data.answer || 'No response received.'
        };

        if (data.audio_data && data.audio_format) {
            answerEntry.audio_data = data.audio_data;
            answerEntry.audio_format = data.audio_format;
        }

        conversationHistory.splice(thinkingMessageIndex, 1, answerEntry);
        updateChatDisplay();

    } catch (error) {
        console.error('Error fetching response:', error);
        conversationHistory.splice(thinkingMessageIndex, 1, { type: 'answer', content: 'Sorry, something went wrong. Please try again later.' });
        updateChatDisplay();
    }

    questionInput.value = '';
});

clearButton.addEventListener('click', () => {
    conversationHistory = [];
    updateChatDisplay();
});

// Initialize with welcome message
conversationHistory.push({
    type: 'answer',
    content: "Hi sweetie! I'm Mom Helper, and I'm here if you need someone to talk to about things you see online. What would you like to talk about today?"
});
updateChatDisplay(); 