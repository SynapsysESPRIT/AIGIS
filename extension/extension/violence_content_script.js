// Function to send image to backend for violence detection
function sendImageToViolenceAPI(imageFile) {
    const reader = new FileReader();
    
    reader.onloadend = () => {
        const base64Image = reader.result.split(',')[1];

        fetch('http://127.0.0.1:8000/violence/detect/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image }),
        })
        .then(response => response.json())
        .then(data => {
            console.log("Violence detection result:", data);
            if (data.is_violent) {
                alert('Violent content detected!');
            } else {
                alert('No violence detected');
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    };

    reader.readAsDataURL(imageFile); // Convert image to base64
}

// Example usage: assuming there's an <input type="file" id="imageUpload">
document.getElementById('imageUpload').addEventListener('change', function(event) {
    const imageFile = event.target.files[0];
    if (imageFile) {
        sendImageToViolenceAPI(imageFile);
    }
});
