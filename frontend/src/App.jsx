import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import LiveRecording from './components/LiveRecording';
import ResultsDisplay from './components/ResultsDisplay';
import SearchInterface from './components/SearchInterface';
import { FileAudio, Mic, Activity, Search, User } from 'lucide-react';
import './App.css';

function App() {
  const [activeMode, setActiveMode] = useState('upload'); // 'upload', 'live', or 'search'
  const [patientName, setPatientName] = useState('');
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
        <div className="global-inputs animate-fade-in" style={{animationDelay: '0.1s', marginBottom: '20px', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)'}}>
          <User size={20} style={{marginRight: '10px', color: '#a78bfa'}} />
          <input 
            type="text" 
            placeholder="Patient Name (e.g., John Doe)" 
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            style={{flex: 1, background: 'transparent', border: 'none', color: 'white', fontSize: '16px', outline: 'none'}}
          />
        </div>

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
          <button 
            className={`mode-btn ${activeMode === 'search' ? 'active' : ''}`}
            onClick={() => { setActiveMode('search'); setResults(null); }}
          >
            <Search size={18} /> Search
          </button>
        </div>

        <div className="glass-panel active-panel-container animate-fade-in" style={{animationDelay: '0.4s'}}>
          {activeMode === 'upload' && (
            <FileUpload onResult={handleResult} patientName={patientName} />
          )}
          {activeMode === 'live' && (
            <LiveRecording onResult={handleResult} patientName={patientName} />
          )}
          {activeMode === 'search' && (
            <SearchInterface patientName={patientName} />
          )}
        </div>

        {results && activeMode !== 'search' && (
          <div className="results-section">
            <ResultsDisplay data={results} title={activeMode === 'upload' ? "Upload Results" : "Live Recording Results"} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
