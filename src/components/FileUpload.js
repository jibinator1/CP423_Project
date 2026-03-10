import React, { useState } from 'react';
import './FileUpload.css'; // Assuming you'll create this CSS file

const FileUpload = ({ onResult }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setError(null); // Clear previous errors
    onResult(null); // Clear previous results when a new file is selected
  };

  const handleUploadClick = async () => {
    if (!selectedFile) {
      setError('Please select an MP3 file first.');
      return;
    }

    const formData = new FormData();
    formData.append('audio_file', selectedFile);

    setIsLoading(true);
    setError(null);

    try {
      // --- ASSUMED BACKEND API ENDPOINT ---
      // Replace with your actual backend API URL and endpoint
      const response = await fetch('/api/upload_mp3', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      onResult(data); // Pass results up to App.js
    } catch (err) {
      console.error('Upload failed:', err);
      setError(`Upload failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="file-upload-container">
      <input type="file" accept=".mp3" onChange={handleFileChange} />
      <button onClick={handleUploadClick} disabled={!selectedFile || isLoading}>
        {isLoading ? 'Uploading...' : 'Upload & Process'}
      </button>
      {error && <p className="error-message">{error}</p>}
      {selectedFile && !isLoading && <p>Selected file: {selectedFile.name}</p>}
    </div>
  );
};

export default FileUpload;
