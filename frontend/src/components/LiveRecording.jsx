import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Activity, AlertCircle } from 'lucide-react';
import './LiveRecording.css';

const LiveRecording = ({ onResult }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const audioChunksRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // Format time MM:SS
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startRecording = async () => {
    setError(null);
    onResult(null);
    setRecordingTime(0);

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = audioStream;

      const recorder = new MediaRecorder(audioStream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];

        const formData = new FormData();
        formData.append('audio_chunk', audioBlob, 'live_recording.webm');

        setIsLoading(true);
        setError(null);

        try {
          const response = await fetch('/api/process_live_audio', {
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
          console.error('Live processing failed:', err);
          setError(`Live processing failed: ${err.message}`);
        } finally {
          setIsLoading(false);
        }
      };

      recorder.start(100); // Record in small chunks
      setIsRecording(true);
      
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please ensure permissions are granted.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  return (
    <div className="live-container">
      <h2 className="section-title">Live Audio Recording</h2>
      <p className="section-subtitle">Record clinical notes directly from your microphone.</p>

      <div className="recording-area">
        <div className={`mic-button-wrapper ${isRecording ? 'pulse-anim' : ''}`}>
          <button 
            className={`mic-button ${isRecording ? 'recording' : ''} ${isLoading ? 'loading' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loading-spinner large"></span>
            ) : isRecording ? (
              <Square size={48} className="stop-icon" />
            ) : (
              <Mic size={48} />
            )}
          </button>
        </div>

        <div className="recording-status">
          {isRecording ? (
            <>
              <div className="recording-indicator">
                <span className="red-dot"></span>
                <span>Recording...</span>
              </div>
              <div className="recording-time">{formatTime(recordingTime)}</div>
              <Activity className="waveform-icon" size={24} />
            </>
          ) : isLoading ? (
            <div className="status-text">Processing audio...</div>
          ) : (
            <div className="status-text">Click the microphone to start</div>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={18} /> {error}
        </div>
      )}
    </div>
  );
};
export default LiveRecording;
