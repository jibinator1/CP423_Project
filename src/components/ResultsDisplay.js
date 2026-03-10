import React from 'react';
import './ResultsDisplay.css'; // Assuming you'll create this CSS file

const ResultsDisplay = ({ data, title }) => {
  if (!data) {
    return null;
  }

  return (
    <div className="results-display">
      <h3>{title}</h3>
      {data.summary && (
        <div>
          <h4>Summary:</h4>
          <p>{data.summary}</p>
        </div>
      )}
      {data.top_result && (
        <div>
          <h4>Top Result:</h4>
          {/* Assuming top_result is an object with relevant fields */}
          <p><strong>ID:</strong> {data.top_result.id || 'N/A'}</p>
          <p><strong>Title:</strong> {data.top_result.title || 'N/A'}</p>
          <p><strong>Score:</strong> {data.top_result.score !== undefined ? data.top_result.score.toFixed(4) : 'N/A'}</p>
          {/* Add more fields as needed based on what your backend returns */}
        </div>
      )}
      {!data.summary && !data.top_result && <p>No results to display.</p>}
    </div>
  );
};

export default ResultsDisplay;
