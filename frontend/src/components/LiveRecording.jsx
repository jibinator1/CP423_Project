import React, { useState, useEffect, useRef } from 'react';
import { 
  LiveKitRoom, 
  RoomAudioRenderer, 
  StartAudio, 
  TrackToggle,
  useConnectionState,
  useTracks,
  useRoomContext
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Mic } from 'lucide-react';
import { RoomEvent } from 'livekit-client';
import './LiveRecording.css';

// Listen directly to room transcription events — more reliable than useTrackTranscription
const TranscriptionView = ({ patientName }) => {
  const room = useRoomContext();
  const [segments, setSegments] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!room) return;

    const handler = (segments, participant) => {
      console.log('transcriptionReceived event!', segments, participant?.identity);
      setSegments(prev => {
        const updated = [...prev];
        for (const seg of segments) {
          const idx = updated.findIndex(s => s.id === seg.id);
          if (idx >= 0) {
            updated[idx] = { ...seg, speaker: participant?.identity || 'Speaker' };
          } else {
            updated.push({ ...seg, speaker: participant?.identity || 'Speaker' });
          }
        }
        // Keep only last 50
        return updated.slice(-50);
      });
    };

    room.on(RoomEvent.TranscriptionReceived, handler);
    return () => room.off(RoomEvent.TranscriptionReceived, handler);
  }, [room]);

  // Polling fallback to ensure database records always show up in the UI
  useEffect(() => {
    if (!room) return;
    let isActive = true;

    const poll = async () => {
      try {
        const params = new URLSearchParams({ session_id: 'clinical-room', limit: 50 });
        if (patientName) params.append('patient_name', patientName);
        
        const res = await fetch(`/api/livekit/segments?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isActive) return;
        
        if (data.segments && data.segments.length > 0) {
          setSegments(prev => {
            const nonFinalLive = prev.filter(s => !s.final);
            const polled = data.segments.map(seg => ({
              id: seg.id.toString(),
              text: seg.content,
              final: true,
              speaker: seg.speaker_role === "CLINICIAN" ? "🎙️ Room Mic" : seg.speaker_role
            }));
            
            // Deduplicate if needed, but since we overwrite all finals with polled, it's clean
            return [...polled, ...nonFinalLive];
          });
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    const intervalId = setInterval(poll, 2000);
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [room, patientName]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [segments]);

  // Also expose a test injection
  window.injectTestTranscript = () => {
    setSegments(prev => [...prev, {
      id: Math.random().toString(),
      text: 'Test transcription bubble! UI is working.',
      final: true,
      speaker: 'Test Bot'
    }]);
  };

  const finalSegments = segments.filter(s => s.final);

  return (
    <div className="transcription-container" style={{ width: '100%', padding: '15px', maxHeight: '300px', overflowY: 'auto' }}>
      {finalSegments.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: '13px', marginTop: '10px' }}>
          Transcription will appear here when you speak...
        </div>
      )}
      {finalSegments.map((s) => (
        <div key={s.id} className="transcript-bubble final">
          <span className="speaker-name">{s.speaker}: </span>
          {s.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

const DebugTrackInfo = () => {
  const tracks = useTracks();
  const room = useRoomContext();
  
  return (
    <div className="debug-panel" style={{
      fontSize: '10px', 
      textAlign: 'left', 
      background: 'rgba(0,0,0,0.5)', 
      padding: '10px', 
      borderRadius: '8px',
      marginTop: '20px',
      fontFamily: 'monospace'
    }}>
      <div><strong>Debug Room:</strong> {room.name}</div>
      <div><strong>Active Tracks ({tracks.length}):</strong></div>
      {tracks.map(t => (
        <div key={t.publication.trackSid}>
          - {t.participant.identity}: {t.publication.kind} ({t.publication.source}) | {t.publication.trackSid}
        </div>
      ))}
    </div>
  );
};

const ConnectionStatus = () => {
  const state = useConnectionState();
  const room = useRoomContext();
  return <div className="status-text" style={{marginTop: '20px'}}>Status: {state} | Room: {room.name}</div>;
};

// Native microphone selector using the browser MediaDevices API
const MicSelector = ({ onDeviceChange }) => {
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    // Must call getUserMedia first to unlock real device labels
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getTracks().forEach(t => t.stop());
        return navigator.mediaDevices.enumerateDevices();
      })
      .then(devs => {
        const mics = devs.filter(d => d.kind === 'audioinput');
        setDevices(mics);
        if (mics.length > 0) setSelected(mics[0].deviceId);
      })
      .catch(err => console.warn('Mic enum error:', err));
  }, []);

  const handleChange = (e) => {
    setSelected(e.target.value);
    if (onDeviceChange) onDeviceChange(e.target.value);
  };

  return (
    <select
      value={selected}
      onChange={handleChange}
      style={{ width: '100%', padding: '6px', borderRadius: '4px', background: '#1a1a2e', color: '#fff', border: '1px solid #7c3aed', fontSize: '12px' }}
    >
      {devices.map(d => (
        <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 6)}`}</option>
      ))}
    </select>
  );
};

const LiveRecording = ({ onResult, patientName }) => {
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const startLive = () => {
    setIsConnecting(true);
    setError(null);
    const params = new URLSearchParams({ participant_name: 'Clinician' });
    if (patientName) params.append('patient_name', patientName);
    
    fetch(`/api/livekit/token?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setToken(data.token);
        setUrl(data.url);
        setIsConnecting(false);
      })
      .catch(err => {
        setError(err.message);
        setIsConnecting(false);
      });
  };

  if (!token) {
    return (
      <div className="live-container">
        <h2>Live Recording</h2>
        <p>Connect to the LiveKit room to begin.</p>
        <button className="primary-button" onClick={startLive} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Enable Live Talk"}
        </button>
        {error && <div className="error-message">{error}</div>}
      </div>
    );
  }

  const handleGetSummary = async () => {
    setIsSummarizing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('session_id', 'clinical-room');
      formData.append('patient_name', patientName || '');

      const response = await fetch('/api/livekit/summary', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      setToken(""); // Disconnect LiveKit first
      setUrl("");
      onResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="live-container">
      <h2>Live Session Active</h2>
      <div className="recording-area" style={{minHeight: '200px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '12px'}}>
        <LiveKitRoom
          token={token}
          serverUrl={url}
          connect={true}
          audio={true}
          video={false}
        >
          <RoomAudioRenderer />
          <div style={{padding: '20px', textAlign: 'center'}}>
            <Mic size={48} />
            <p>Audio is streaming...</p>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', marginTop: '10px'}}>
              <div style={{background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '8px', width: '100%', maxWidth: '300px'}}>
                <label style={{fontSize: '12px', display: 'block', marginBottom: '5px'}}>🎤 Select Microphone:</label>
                <MicSelector />
              </div>
              
              <div style={{display: 'flex', gap: '10px'}}>
                <TrackToggle source="microphone" />
                <button 
                  className="secondary" 
                  style={{padding: '5px 15px', fontSize: '12px', border: '1px solid #7c3aed', color: '#7c3aed', background: 'transparent', borderRadius: '4px'}}
                  onClick={() => {
                    if (window.injectTestTranscript) window.injectTestTranscript();
                  }}
                >
                  Test UI Bubbles
                </button>
              </div>
            </div>
          </div>
          <TranscriptionView patientName={patientName} />
          <ConnectionStatus />
          <DebugTrackInfo />
          <StartAudio label="Start Audio" />
        </LiveKitRoom>
      </div>
      <div style={{ display: 'flex', gap: '15px', marginTop: '20px', justifyContent: 'center' }}>
        <button 
          className="primary-button" 
          onClick={handleGetSummary} 
          disabled={isSummarizing}
        >
          {isSummarizing ? "Generating Summary..." : "Get Summary"}
        </button>
        <button 
          className="secondary-button" 
          onClick={() => { setToken(""); setUrl(""); }} 
          disabled={isSummarizing}
        >
          Disconnect
        </button>
      </div>
      {error && <div className="error-message" style={{marginTop: '15px'}}>{error}</div>}
    </div>
  );
};

export default LiveRecording;
