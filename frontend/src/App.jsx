import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import LiveRecording from './components/LiveRecording';
import ResultsDisplay from './components/ResultsDisplay';
import { FileAudio, Mic, Activity } from 'lucide-react';
import './App.css';

function App() {
  const [activeMode, setActiveMode] = useState('upload'); // 'upload' or 'live'
  const [results, setResults] = useState(null);

  const handleResult = (data) => {
    setResults(data);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="gradient-text">
          <Activity size={40} style={{marginRight: '12px', verticalAlign: 'text-bottom', display: 'inline-block'}}/>
          Clinical IR System
        </h1>
        <p>Advanced medical audio analysis and retrieval. Choose a mode below to begin.</p>
      </header>

      <main className="main-content">
        <div className="mode-toggle animate-fade-in" style={{animationDelay: '0.2s'}}>
          <button 
            className={`mode-btn ${activeMode === 'upload' ? 'active' : ''}`}
            onClick={() => { setActiveMode('upload'); setResults(null); }}
          >
            <FileAudio size={18} /> Upload MP3
          </button>
          <button 
            className={`mode-btn ${activeMode === 'live' ? 'active' : ''}`}
            onClick={() => { setActiveMode('live'); setResults(null); }}
          >
            <Mic size={18} /> Live Recording
          </button>
        </div>

        <div className="glass-panel active-panel-container animate-fade-in" style={{animationDelay: '0.4s'}}>
          {activeMode === 'upload' ? (
            <FileUpload onResult={handleResult} />
          ) : (
            <LiveRecording onResult={handleResult} />
          )}
        </div>

        {results && (
          <div className="results-section">
            <ResultsDisplay data={results} title={activeMode === 'upload' ? "Upload Results" : "Live Recording Results"} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
