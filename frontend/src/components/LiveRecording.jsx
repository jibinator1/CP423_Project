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
      console.log('[Live] Transcription received:', segments.map(s => s.text).join(' '), 'from:', participant?.identity);
      
      // Improved role detection: Check identity case-insensitively
      const identity = (participant?.identity || "").toLowerCase();
      const role = identity.includes('clinician') ? 'CLINICIAN' : (identity.includes('patient') ? 'PATIENT' : 'PATIENT');
      const label = role === 'CLINICIAN' ? "👨‍⚕️ Clinician" : "👤 Patient";

      setSegments(prev => {
        const updated = [...prev];
        for (const seg of segments) {
          // Check for duplication/update by ID
          const idx = updated.findIndex(s => s.id === seg.id);
          if (idx >= 0) {
            updated[idx] = { ...seg, speaker: label, role };
          } else {
            // Check for text-based duplication (especially for late-arriving finalized segments)
            const textDup = updated.find(s => s.final && s.text.trim() === seg.text.trim());
            if (!textDup) {
              updated.push({ ...seg, speaker: label, role });
            }
          }
        }
        return updated.slice(-100);
      });
    };

    room.on(RoomEvent.TranscriptionReceived, handler);
    return () => room.off(RoomEvent.TranscriptionReceived, handler);
  }, [room]);

  // Polling fallback to ensure database records always show up Corrected/Finalized
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
        
        if (data.segments) {
          setSegments(prev => {
            const currentNonFinal = prev.filter(s => !s.final);
            const currentFinal = prev.filter(s => s.final);
            
            const polled = data.segments.map(seg => ({
              id: seg.id.toString(), // Database ID
              text: seg.content,
              final: true,
              role: seg.speaker_role,
              speaker: seg.speaker_role === "CLINICIAN" ? "👨‍⚕️ Clinician" : "👤 Patient"
            }));
            
            // Merge: Keep all polled segments, and add any live segments that aren't represented in the poll yet
            const mergedFinal = [...polled];
            for (const live of currentFinal) {
              // If this live segment isn't already in the poll (by ID or exact text)
              const exists = polled.find(p => p.id === live.id || p.text.trim() === live.text.trim());
              if (!exists) {
                mergedFinal.push(live);
              }
            }

            // Sort by ID/Order if possible, otherwise just append
            return [...mergedFinal.slice(-100), ...currentNonFinal];
          });
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    const intervalId = setInterval(poll, 1500); // Slightly slower poll to reduce terminal noise
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [room, patientName]);

  // Auto-scroll to bottom only when NEW segments are added (not on every poll refresh)
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (segments.length > prevCountRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = segments.length;
  }, [segments]);

  const finalSegments = segments.filter(s => s.final);
  const interimSegments = segments.filter(s => !s.final);

  return (
    <div className="transcription-view" style={{ width: '100%', padding: '5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div className="transcription-container" style={{ width: '100%', padding: '15px', maxHeight: '400px', overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '12px' }}>
        {finalSegments.length === 0 && interimSegments.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: '13px', marginTop: '10px' }}>
            Transcription will appear here when you speak...
          </div>
        )}
        {finalSegments.map((s) => (
          <div key={s.id} className={`transcript-bubble final ${s.role?.toLowerCase()}`}>
            <span className="speaker-name">{s.speaker}: </span>
            {s.text}
          </div>
        ))}
        {interimSegments.map((s) => (
          <div key={s.id} className="transcript-bubble interim" style={{ fontStyle: 'italic', opacity: 0.7 }}>
            <span className="speaker-name">{s.speaker}: </span>
            {s.text}...
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
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
  const [selectedRole, setSelectedRole] = useState("Clinician");

  const startLive = () => {
    setIsConnecting(true);
    setError(null);
    const params = new URLSearchParams({ participant_name: selectedRole });
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
        <p>Choose your role and connect to the room.</p>
        
        <div className="role-selection" style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginBottom: '20px' }}>
          <button 
            className={`secondary-button ${selectedRole === 'Clinician' ? 'active' : ''}`}
            onClick={() => setSelectedRole('Clinician')}
            style={{ 
              borderColor: selectedRole === 'Clinician' ? '#a78bfa' : 'rgba(255,255,255,0.1)',
              backgroundColor: selectedRole === 'Clinician' ? 'rgba(167, 139, 250, 0.1)' : 'transparent',
              color: selectedRole === 'Clinician' ? '#a78bfa' : 'white'
            }}
          >
            👨‍⚕️ Clinician
          </button>
          <button 
            className={`secondary-button ${selectedRole === 'Patient' ? 'active' : ''}`}
            onClick={() => setSelectedRole('Patient')}
            style={{ 
              borderColor: selectedRole === 'Patient' ? '#67e8f9' : 'rgba(255,255,255,0.1)',
              backgroundColor: selectedRole === 'Patient' ? 'rgba(103, 232, 249, 0.1)' : 'transparent',
              color: selectedRole === 'Patient' ? '#67e8f9' : 'white'
            }}
          >
            👤 Patient
          </button>
        </div>

        <button className="primary-button" onClick={startLive} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : `Join Room as ${selectedRole}`}
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
