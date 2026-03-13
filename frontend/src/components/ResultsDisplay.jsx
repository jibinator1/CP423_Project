import React from 'react';
import { FileText, Database, ShieldAlert } from 'lucide-react';
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
    </div>
  );
};

export default ResultsDisplay;
