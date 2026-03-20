import React from 'react';
import { FileText, Database, ShieldAlert, List } from 'lucide-react';
import './ResultsDisplay.css';

const ResultsDisplay = ({ data, title }) => {
  if (!data) return null;

  // Top Result rendering removed as per user request

  return (
    <div className="results-container animate-fade-in">
      <h2 className="results-title">{title}</h2>
      
      <div className="results-grid">
        <div className="result-card summary-card">
          <div className="card-header">
            <div className="icon-wrapper summary-icon">
              <FileText size={20} />
            </div>
            <h3>Clinical Summary</h3>
          </div>
          <div className="card-body">
            {data.summary ? (
              <div className="prose">
                {typeof data.summary === 'string' 
                  ? data.summary.split('\n').map((line, i) => <p key={i} style={{minHeight: line.trim() === '' ? '1rem' : 'auto'}}>{line}</p>)
                  : JSON.stringify(data.summary, null, 2)}
              </div>
            ) : (
              <p className="no-data">No summary available.</p>
            )}
          </div>
        </div>

        {/* The retrieve-card "Top Related Result" section was removed in favor of the global Search bar */}
      </div>

      <div className="results-grid" style={{marginTop: '20px'}}>
        <div className="result-card transcript-card" style={{gridColumn: '1 / -1'}}>
          <div className="card-header">
            <div className="icon-wrapper search-icon" style={{backgroundColor: 'rgba(167, 139, 250, 0.2)', color: '#a78bfa'}}>
              <List size={20} />
            </div>
            <h3>Full Transcript</h3>
          </div>
          <div className="card-body">
            {data.transcript ? (
              <div className="prose transcript-box" style={{ 
                maxHeight: '400px', 
                overflowY: 'auto', 
                backgroundColor: 'rgba(0,0,0,0.2)', 
                padding: '15px', 
                borderRadius: '8px',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: '1.5',
                textAlign: 'left',
                color: 'rgba(255,255,255,0.9)'
              }}>
                {data.transcript}
              </div>
            ) : (
              <p className="no-data">No full transcript available for this session.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
