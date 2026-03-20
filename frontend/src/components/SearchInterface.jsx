import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import './SearchInterface.css';

const SearchInterface = ({ patientName }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [model, setModel] = useState('hybrid');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      // Build query string
      const params = new URLSearchParams({ 
        query: query.trim(),
        model: model
      });
      if (patientName?.trim()) {
        params.append('patient_name', patientName.trim());
      }
      
      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Search failed to return a successful response.');
      }
      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="search-container">
      <h2 className="section-title">Search Clinical Records</h2>
      <p className="section-subtitle">
        {patientName 
          ? `Searching records explicitly for patient: ${patientName}`
          : 'Searching all records (enter Patient Name above to filter results)'}
      </p>

      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-wrapper">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            className="search-input"
            placeholder="Search symptoms, diagnoses, or conversation history..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select 
            value={model} 
            onChange={(e) => setModel(e.target.value)}
            className="model-select"
            style={{ padding: '8px', borderRadius: '4px', background: '#1a1a2e', color: 'white', border: '1px solid #7c3aed', marginRight: '10px' }}
          >
            <option value="hybrid">Hybrid (Semantic + BM25)</option>
            <option value="bm25">BM25 (Classic IR)</option>
            <option value="vsm">Vector Space Model (TF-IDF)</option>
            <option value="boolean">Boolean (Set Matching)</option>
          </select>
          <button 
            type="submit" 
            className="primary search-btn"
            disabled={isSearching || !query.trim()}
          >
            {isSearching ? <Loader2 className="spinner" size={18} /> : 'Search'}
          </button>
        </div>
      </form>

      {error && <div className="error-message">{error}</div>}

      <div className="search-results">
        {results && results.length === 0 && (
          <p className="no-data" style={{textAlign: 'center', marginTop: '30px'}}>
            No matching records found.
          </p>
        )}
        
        {results && results.length > 0 && (
          <div className="results-list">
            <h4>Top Results ({results.length})</h4>
            {results.map((r, idx) => (
              <div key={r.id || idx} className="search-result-card">
                <div className="search-result-header">
                  <span className={`badge ${r.speaker_role?.toLowerCase()}`}>
                    {r.speaker_role}{r.speaker_label ? ` (${r.speaker_label})` : ''}
                  </span>
                  <span className="timestamp">
                    {r.start_time?.toFixed(2)}s – {r.end_time?.toFixed(2)}s
                  </span>
                  <span className="score badge">Score: {r.score?.toFixed(3)}</span>
                </div>
                <div className="search-result-body">
                  " {r.content} "
                </div>
                {r.patient_name && (
                  <div className="search-result-footer">
                    Patient: {r.patient_name}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchInterface;
