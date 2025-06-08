console.log("📝 Text extraction content script loaded!");

// Configuration
const GEMINI_API_KEY = 'AIzaSyAnjxxUiTFoL7RIBokjJ_uIh8DKdLXsdG0';
const LOGGING_API_URL = 'http://127.0.0.1:8000/monitoring/log-chat/'; // For logging conversations
const CLASSIFICATION_API_URL = 'http://127.0.0.1:8000/text/classify_text/'; // For text classification

function isTabActiveAndVisible() {
    return !document.hidden && document.visibilityState === 'visible';
}

// Function to preprocess CSS to handle modern color functions
function preprocessCSS() {
    try {
        // Create a style element to override problematic CSS
        const style = document.createElement('style');
        style.textContent = `
            * {
                color: inherit !important;
                background-color: inherit !important;
                border-color: inherit !important;
                box-shadow: none !important;
                text-shadow: none !important;
            }
        `;
        document.head.appendChild(style);
        return style;
    } catch (error) {
        console.error('Error preprocessing CSS:', error);
        return null;
    }
}

// Function to take a screenshot of the current viewport
async function takeScreenshot() {
    let styleElement = null;
    try {
        // Scroll to the top of the page to ensure full capture
        window.scrollTo(0, 0);

        // Wait for document to be ready
        if (document.readyState !== 'complete') {
            console.log('Document not ready, waiting...');
            await new Promise(resolve => {
                window.addEventListener('load', resolve);
            });
        }

        // Check if html2canvas is available
        if (typeof html2canvas === 'undefined') {
            console.error('html2canvas not found. Checking script loading...');
            const scripts = document.getElementsByTagName('script');
            console.log('Loaded scripts:', Array.from(scripts).map(s => s.src));
            throw new Error('html2canvas library not loaded');
        }

        // Check if document.body exists
        if (!document.body) {
            console.error('Document body not found. Document state:', {
                readyState: document.readyState,
                hasDocumentElement: !!document.documentElement,
                hasHead: !!document.head
            });
            throw new Error('Document body not found');
        }

        // Preprocess CSS to handle modern color functions
        styleElement = preprocessCSS();

        const options = {
            logging: true,
            useCORS: true,
            allowTaint: true,
            foreignObjectRendering: true,
            scrollX: 0,
            scrollY: 0,
            width: document.documentElement.scrollWidth, // Full page width
            height: document.documentElement.scrollHeight, // Full page height
            backgroundColor: '#ffffff',
            scale: 1,
            onclone: (clonedDoc) => {
                console.log('Cloning document for screenshot...');
                // Remove any problematic elements or styles
                const elements = clonedDoc.querySelectorAll('*');
                elements.forEach(el => {
                    if (el.style) {
                        el.style.color = '';
                        el.style.backgroundColor = '';
                        el.style.borderColor = '';
                        el.style.boxShadow = 'none';
                        el.style.textShadow = 'none';
                    }
                });
            }
        };

        console.log('Taking screenshot with options:', options);
        console.log('Document dimensions:', {
            bodyWidth: document.body.scrollWidth,
            bodyHeight: document.body.scrollHeight,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight
        });

        // Try document.body first, fall back to documentElement if needed
        let canvas;
        try {
            canvas = await html2canvas(document.body, options);
        } catch (bodyError) {
            console.warn('Failed to capture body, trying documentElement:', bodyError);
            canvas = await html2canvas(document.documentElement, options);
        }

        if (!canvas) {
            throw new Error('Failed to create canvas');
        }

        const dataUrl = canvas.toDataURL('image/png');
        if (!dataUrl) {
            throw new Error('Failed to convert canvas to data URL');
        }

        return dataUrl;
    } catch (error) {
        console.error('Error taking screenshot:', error);
        // Log additional debugging information
        console.log('Document state:', {
            readyState: document.readyState,
            hasBody: !!document.body,
            hasHtml2Canvas: typeof html2canvas !== 'undefined',
            url: window.location.href,
            timestamp: new Date().toISOString()
        });
        return null;
    } finally {
        // Clean up the style element
        if (styleElement && styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
        }
    }
}

// Function to send image to Gemini API for text extraction
async function analyzeImageWithGemini(imageData) {
    try {
        // Remove the data:image/jpeg;base64, prefix if present
        const base64Data = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: `Analyze this screenshot and extract all text content. Follow these guidelines:

1. Focus on extracting conversations, messages, or comments
2. Ignore UI elements, timestamps, and navigation buttons
3. Structure the output as a clear dialogue if it's a conversation
4. If text is unclear or partially visible, mark it as [illisible]
5. For multiple conversations, separate them with "--- Conversation X ---"
6. Include sender names if visible
7. Preserve the original language of the text

Format example:
--- Conversation 1 ---
User1: Hello, how are you?
User2: I'm good, thanks!

--- Conversation 2 ---
[illisible]
User3: Can we meet tomorrow?

Extract all visible text while maintaining this structure.`
                        },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: base64Data
                            }
                        }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}\n${JSON.stringify(errorData)}`);
        }

        const result = await response.json();

        // Safely extract text from Gemini's response
        if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const extractedText = result.candidates[0].content.parts[0].text;
            console.log('Extracted text:', extractedText);

            // Split the extracted text into individual conversations
            const conversations = extractedText.split(/--- Conversation \d+ ---/).filter(Boolean).map(conv => conv.trim());
            return conversations;
        }

        console.warn('No text found in Gemini response:', result);
        return [];
    } catch (error) {
        console.error('Error analyzing image with Gemini:', error);
        return [];
    }
}

// Function to send text to Django API
async function sendTextToAPI(text) {
    try {
        if (!isTabActiveAndVisible()) {
            console.log('sendTextToAPI (Classification): Tab not active or visible. Aborting.');
            return null;
        }

        // Ensure text is a string
        if (Array.isArray(text)) {
            console.warn('sendTextToAPI (Classification): Received an array, joining with newlines. This function expects a single text string.');
            text = text.join('\n\n');
        }

        console.log('Sending text for classification:', text.substring(0, 100) + '...');

        const data = await new Promise((resolve) => {
            chrome.storage.local.get('activeChildId', (result) => {
                resolve(result);
            });
        });
        const child_id = data.activeChildId || 1;

        const response = await fetch(CLASSIFICATION_API_URL, { // Use CLASSIFICATION_API_URL
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text, child_id: child_id })
        });

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(`Classification API error: ${response.status} ${response.statusText}\n${JSON.stringify(responseData)}`);
        }

        console.log('Text classification results:', responseData);

        // Send results to popup (if needed for classification)
        chrome.runtime.sendMessage({
            type: 'textClassificationResults',
            results: responseData
        });

        return responseData;
    } catch (error) {
        console.error('Error sending text to Classification API:', error);
        return null;
    }
}

// Function to send conversations to Django API for logging
async function sendConversationsToAPI(conversations) {
    try {
        if (!isTabActiveAndVisible()) {
            console.log('sendConversationsToAPI (Logging): Tab not active or visible. Aborting.');
            return;
        }

        console.log('Sending conversations for logging:', conversations);

        const data = await new Promise((resolve) => {
            chrome.storage.local.get(['activeChildId'], (result) => {
                resolve(result);
            });
        });
        const child_id = data.activeChildId || 1;
        console.log(`sendConversationsToAPI (Logging): Using child_id: ${child_id}`);

        if (!conversations || conversations.length === 0) {
            console.log('sendConversationsToAPI (Logging): No conversations to send.');
            return;
        }

        const response = await fetch(LOGGING_API_URL, { // Use LOGGING_API_URL directly
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ conversations: conversations, child_id: child_id })
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: 'Failed to parse error response from server.' };
            }
            console.error('Error sending conversations to Logging API:', response.status, errorData);
        } else {
            const responseData = await response.json();
            console.log('Conversations logged successfully:', responseData);
        }
    } catch (error) {
        console.error('Error sending conversations to Logging API:', error);
    }
}

// Main function to process text
async function processPageText() {
    try {
        const screenshot = await takeScreenshot();
        if (!screenshot) {
            console.warn('Screenshot failed, aborting text processing.');
            return;
        }

        const conversationsArray = await analyzeImageWithGemini(screenshot); // analyzeImageWithGemini returns string[]

        if (conversationsArray && conversationsArray.length > 0) {
            console.log('Extracted conversations by Gemini:', conversationsArray);

            // 1. Log all conversations
            //    We make a copy of the array in case sendConversationsToAPI modifies it, though it shouldn't.
            await sendConversationsToAPI([...conversationsArray]);

            // 2. Send each conversation for classification
            console.log('\nStarting classification for each conversation:');
            for (const conversation of conversationsArray) {
                if (conversation && conversation.trim().length > 0) {
                    // console.log(`Sending for classification: "${conversation.substring(0, 100)}..."`); // Already logged in sendTextToAPI
                    await sendTextToAPI(conversation.trim()); // sendTextToAPI handles its own console logging of results
                }
            }
            console.log('\nFinished classification process.');

        } else {
            console.warn('No conversations extracted by Gemini to process.');
        }
    } catch (error) { // This catch corresponds to the try block above
        console.error('Error processing page text:', error);
    }
}

// Listen for messages from other parts of the extension (e.g., popup)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'processText') {
        console.log('[text_content_script.js] Received processText request');
        processPageText()
            .then(results => {
                // While processPageText itself doesn't directly return a combined result for the popup,
                // individual classification results are sent via chrome.runtime.sendMessage in sendTextToAPI.
                // This sendResponse is more of an acknowledgment.
                sendResponse({ status: "Text processing initiated. Results will be sent separately." });
            })
            .catch(error => {
                console.error('[text_content_script.js] Error during processPageText execution:', error);
                sendResponse({ status: "Error initiating text processing.", error: error.message });
            });
        return true; // Indicates that the response is sent asynchronously
    }
    // Optional: Handle other actions if needed
});

// Export the processPageText function to be called from other scripts
// (Note: Direct export/import between content scripts and other extension pages like popups isn't standard.
// Message passing is the primary way, as implemented above.)