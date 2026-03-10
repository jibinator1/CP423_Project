import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import LiveRecording from './components/LiveRecording';
import ResultsDisplay from './components/ResultsDisplay';
import './App.css';

function App() {
  const [uploadResults, setUploadResults] = useState(null);
  const [liveResults, setLiveResults] = useState(null);

  const handleUploadSuccess = (data) => {
    setUploadResults(data);
    setLiveResults(null); // Clear live results when upload is successful
  };

  const handleLiveResult = (data) => {
    setLiveResults(data);
    setUploadResults(null); // Clear upload results when live result comes in
  };

  return (
    <div className="App">
      <h1>Clinical IR System</h1>
      <div className="container">
        <div className="section">
          <h2>Upload MP3 File</h2>
          <FileUpload onResult={handleUploadSuccess} />
        </div>
        <div className="section">
          <h2>Live Audio Processing</h2>
          <LiveRecording onResult={handleLiveResult} />
        </div>
      </div>

      {(uploadResults || liveResults) && (
        <div className="results-section">
          <h2>Processing Results</h2>
          {uploadResults && <ResultsDisplay data={uploadResults} title="Upload Results" />}
          {liveResults && <ResultsDisplay data={liveResults} title="Live Recording Results" />}
        </div>
      )}
    </div>
  );
}

export default App;
