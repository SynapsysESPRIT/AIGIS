console.log("📝 Text extraction content script loaded!");

// Configuration
const GEMINI_API_KEY = 'AIzaSyAnjxxUiTFoL7RIBokjJ_uIh8DKdLXsdG0';
const DJANGO_API_URL = 'http://127.0.0.1:8000/text/classify_text/';

// Global rate limiting
let lastTextRequestTime = 0;
let textRequestInFlight = false;
const TEXT_REQUEST_COOLDOWN = 20000; // 20 seconds

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
        // Preprocess CSS to handle modern color functions
        styleElement = preprocessCSS();

        const options = {
            logging: false,
            useCORS: true,
            allowTaint: true,
            foreignObjectRendering: true,
            scrollX: 0,
            scrollY: 0,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            backgroundColor: '#ffffff',
            scale: 1,
            onclone: (clonedDoc) => {
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

        // Only capture the visible viewport
        const viewport = document.documentElement;
        const canvas = await html2canvas(viewport, options);
        return canvas.toDataURL('image/png');
    } catch (error) {
        console.error('Error taking screenshot:', error);
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
            return extractedText;
        }

        console.warn('No text found in Gemini response:', result);
        return null;
    } catch (error) {
        console.error('Error analyzing image with Gemini:', error);
        return null;
    }
}

// Function to send text to Django API
async function sendTextToAPI(text) { // Reverted to accept only text
    try {
        if (textRequestInFlight) return null;
        if (!isTabActiveAndVisible()) return null;
        const now = Date.now();
        if (now - lastTextRequestTime < TEXT_REQUEST_COOLDOWN) return null;
        lastTextRequestTime = now;
        textRequestInFlight = true;
        console.log('Sending text to API for classification:', text.substring(0, 100) + '...'); // Log first 100 chars

        const response = await fetch(DJANGO_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text }) // Send only text
        });

        const responseData = await response.json();
        textRequestInFlight = false;

        if (!response.ok) {
            throw new Error(`Django API error: ${response.status} ${response.statusText}\n${JSON.stringify(responseData)}`);
        }

        console.log('Text classification results from backend:', responseData);

        // Send results to popup
        chrome.runtime.sendMessage({
            type: 'textClassificationResults',
            results: responseData
        });

        return responseData;
    } catch (error) {
        textRequestInFlight = false;
        console.error('Error sending text to API:', error);
        return null;
    }
}

// Main function to process text
async function processPageText() {
    try {
        const screenshot = await takeScreenshot();
        if (!screenshot) {
            console.warn('Screenshot capture failed, skipping this iteration');
            return;
        }

        const extractedText = await analyzeImageWithGemini(screenshot); // Changed variable name
        if (extractedText) { // Check if text was extracted
            await sendTextToAPI(extractedText); // Send only extracted text
        } else {
            console.warn('No text extracted from image, skipping API call.');
        }
    } catch (error) {
        console.error('Error processing page text:', error);
    }
}

// Export the processPageText function to be called from other scripts
window.processPageText = processPageText;

// Test function to verify API key
async function testGeminiAPI() {
    try {
        console.log('Testing Gemini API...');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: "Hello, this is a test message."
                    }]
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API Test Failed:', {
                status: response.status,
                statusText: response.statusText,
                error: errorData
            });
            return false;
        }

        const result = await response.json();
        console.log('API Test Successful:', result);
        return true;
    } catch (error) {
        console.error('API Test Error:', error);
        return false;
    }
}

// Add test function to window object so it can be called from console
window.testGeminiAPI = testGeminiAPI;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'processText') {
        processPageText().then(sendResponse);
        return true; // Will respond asynchronously
    }
});