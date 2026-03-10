import React, { useState, useRef } from 'react';
import { UploadCloud, FileAudio, CheckCircle, AlertCircle } from 'lucide-react';
import './FileUpload.css';

const FileUpload = ({ onResult }) => {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (selectedFile) => {
    if (selectedFile.type !== 'audio/mpeg' && !selectedFile.name.endsWith('.mp3')) {
      setError('Please select an MP3 file.');
      return;
    }
    setFile(selectedFile);
    setError(null);
    onResult(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('audio_file', file);

    try {
      const response = await fetch('/api/upload_mp3', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Server error: ${response.status}`);
      }

      const data = await response.json();
      onResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="upload-container">
      <h2 className="section-title">Upload Audio File</h2>
      <p className="section-subtitle">Select or drag an MP3 file to analyze.</p>

      <div 
        className={`dropzone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          accept=".mp3,audio/mpeg" 
          ref={fileInputRef}
          onChange={handleChange}
          style={{ display: 'none' }} 
        />
        
        {!file ? (
          <div className="dropzone-content">
            <div className="icon-circle">
              <UploadCloud size={32} />
            </div>
            <p className="drop-main-text">Click to upload or drag and drop</p>
            <p className="drop-sub-text">MP3 files supported (max 20MB)</p>
          </div>
        ) : (
          <div className="file-selected">
            <FileAudio size={40} className="file-icon" />
            <div className="file-info">
              <p className="file-name">{file.name}</p>
              <p className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            <CheckCircle className="check-icon" size={24} />
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div className="action-row">
        <button 
          className="primary upload-btn" 
          onClick={handleUpload} 
          disabled={!file || isUploading}
        >
          {isUploading ? (
            <span className="loading-spinner"></span>
          ) : (
             <UploadCloud size={18} /> 
          )}
          {isUploading ? 'Processing...' : 'Upload & Analyze'}
        </button>
      </div>
    </div>
  );
};
export default FileUpload;
