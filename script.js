document.getElementById('uploadForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const fileInput = document.getElementById('mp3File');
    const file = fileInput.files[0];
    const resultsDiv = document.getElementById('results');
    const summaryOutput = document.getElementById('summaryOutput');
    const topResultOutput = document.getElementById('topResultOutput');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    // Clear previous results and show loading state
    summaryOutput.textContent = '';
    topResultOutput.textContent = '';
    errorDiv.style.display = 'none';
    resultsDiv.style.display = 'none'; // Hide results until data is ready
    loadingDiv.style.display = 'block';
    fileInput.disabled = true;
    document.querySelector('#uploadForm button').disabled = true;

    if (!file) {
        errorDiv.textContent = 'Please select an MP3 file first.';
        errorDiv.style.display = 'block';
        loadingDiv.style.display = 'none';
        fileInput.disabled = false;
        document.querySelector('#uploadForm button').disabled = false;
        return;
    }

    const formData = new FormData();
    formData.append('audio_file', file); // 'audio_file' is the expected key for the uploaded file on the backend

    try {
        // IMPORTANT: Replace '/api/upload-mp3' with your actual backend API endpoint URL.
        // This frontend assumes a backend is running and accessible at this endpoint.
        const response = await fetch('/api/upload-mp3', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { message: 'An unknown error occurred on the server.' };
            }
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Display results
        summaryOutput.textContent = data.summary || 'No summary available.';
        topResultOutput.textContent = data.top_result || 'No top result available.';
        resultsDiv.style.display = 'block'; // Show results section

    } catch (err) {
        errorDiv.textContent = `Error: ${err.message}`;
        errorDiv.style.display = 'block';
        console.error('Upload failed:', err);
    } finally {
        loadingDiv.style.display = 'none';
        fileInput.disabled = false;
        document.querySelector('#uploadForm button').disabled = false;
    }
});
