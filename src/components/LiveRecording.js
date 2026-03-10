import React, { useState, useRef, useEffect } from 'react';
import './LiveRecording.css'; // Assuming you'll create this CSS file

const LiveRecording = ({ onResult }) => {
  const [isRecording, setIsRecording] = useState(false);
  // const [mediaRecorder, setMediaRecorder] = useState(null);
  // const [stream, setStream] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const audioChunksRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  const startRecording = async () => {
    setError(null); // Clear previous errors
    onResult(null); // Clear previous results

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = audioStream;
      // setStream(audioStream);

      // --- ASSUMED BACKEND API / WEBSOCKET ---
      // For simplicity here, we'll simulate sending data in chunks.
      // A robust solution might use WebSockets for real-time streaming.
      // This example sends data when recording stops.

      // Create a MediaRecorder instance
      const recorder = new MediaRecorder(audioStream);
      mediaRecorderRef.current = recorder;
      // setMediaRecorder(recorder);

      recorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        // For this example, we'll send the entire recording when stopped.
        // For true real-time, you would send chunks as they become available.
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' }); // Or 'audio/webm' etc.
        audioChunksRef.current = []; // Clear chunks for next recording

        const formData = new FormData();
        formData.append('audio_chunk', audioBlob); // Sending the whole blob at the end for simplicity

        setIsLoading(true);
        setError(null);

        try {
          // --- ASSUMED BACKEND API ENDPOINT ---
          // Replace with your actual backend API URL and endpoint for live processing.
          const response = await fetch('/api/process_live_audio', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          onResult(data); // Pass results up to App.js
        } catch (err) {
          console.error('Live processing failed:', err);
          setError(`Live processing failed: ${err.message}`);
        } finally {
          setIsLoading(false);
        }
      };

      recorder.start(1000); // Record in 1-second chunks
      setIsRecording(true);
      console.log('Recording started...');

    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError(`Error accessing microphone: ${err.message}. Please grant microphone permissions.`);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log('Recording stopped.');
    }
    // Stop the audio stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      // setStream(null);
      streamRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isRecording]);

  return (
    <div className="live-recording-container">
      <button onClick={isRecording ? stopRecording : startRecording} disabled={isLoading}>
        {isLoading ? 'Processing...' : (isRecording ? 'Stop Recording' : 'Start Recording')}
      </button>
      {error && <p className="error-message">{error}</p>}
      {isRecording && <p>Recording...</p>}
      {!isRecording && !isLoading && <p>Click "Start Recording" to begin.</p>}
    </div>
  );
};

export default LiveRecording;
