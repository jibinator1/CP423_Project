import React from 'react';
import { FileText, Database, ShieldAlert } from 'lucide-react';
import './ResultsDisplay.css';

const ResultsDisplay = ({ data, title }) => {
  if (!data) return null;

  const renderTopResult = () => {
    if (!data.top_result) {
      return (
        <div className="no-data-alert">
           <ShieldAlert size={24} />
           <p>No related database results found.</p>
        </div>
      );
    }

    if (typeof data.top_result === 'string') {
      return (
        <div className="top-result-content">
          <div className="result-text">{data.top_result}</div>
        </div>
      );
    }

    return (
      <div className="top-result-content">
        <div className="result-metadata">
          <span className="badge">ID: {data.top_result.id || 'N/A'}</span>
          {data.top_result.score !== undefined && (
            <span className="badge score">Score: {data.top_result.score.toFixed(4)}</span>
          )}
          {data.top_result.speaker_role && (
            <span className="badge role">{data.top_result.speaker_role}</span>
          )}
        </div>
        {data.top_result.title && <h4 className="result-item-title">{data.top_result.title}</h4>}
        
        <div className="result-text">
           {data.top_result.content || data.top_result.text || 'No content provided.'}
        </div>
      </div>
    );
  };

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

        <div className="result-card retrieve-card">
          <div className="card-header">
            <div className="icon-wrapper retrieve-icon">
              <Database size={20} />
            </div>
            <h3>Top Related Result</h3>
          </div>
          <div className="card-body">
            {renderTopResult()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
