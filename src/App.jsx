import { useState, useRef, useEffect, useCallback } from 'react';
import { extractAllTracks } from 'm4a-stems/extractor';
import './App.css';

// Track mapping: display index -> m4a-stems track index
// m4a-stems: 0=master, 1=drums, 2=bass, 3=other, 4=vocals
const TRACK_MAP = [1, 2, 3, 4, 0]; // drums, bass, other, vocals, master
const TRACK_NAMES = ['Drums', 'Bass', 'Other', 'Vocals', 'Master'];
const TRACK_EMOJIS = ['🥁', '🎸', '🎹', '🎤', '🎵'];

function WaveformCanvas({ waveform, playheadPosition, duration, muted, onSeek }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0a0a15');
    bgGradient.addColorStop(0.5, '#12121f');
    bgGradient.addColorStop(1, '#0a0a15');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    if (!waveform) {
      // Draw center line only
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    const centerY = height / 2;
    const scale = height / 256;

    // Create gradient for waveform
    const waveGradient = ctx.createLinearGradient(0, 0, 0, height);
    if (muted) {
      waveGradient.addColorStop(0, '#664400');
      waveGradient.addColorStop(0.5, '#553300');
      waveGradient.addColorStop(1, '#664400');
    } else {
      waveGradient.addColorStop(0, '#FFD700');
      waveGradient.addColorStop(0.5, '#FFA500');
      waveGradient.addColorStop(1, '#FFD700');
    }

    // Draw waveform (top half)
    ctx.strokeStyle = waveGradient;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * width;
      const y = centerY - waveform[i] * scale;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Mirror for bottom half
    ctx.beginPath();
    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * width;
      const y = centerY + waveform[i] * scale;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Draw playhead with glow effect
    if (playheadPosition >= 0 && duration > 0) {
      const playheadX = (playheadPosition / duration) * width;

      // Glow
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Muted overlay
    if (muted) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, width, height);
    }
  }, [waveform, playheadPosition, duration, muted]);

  const handleClick = (e) => {
    if (duration === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    onSeek(ratio * duration);
  };

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={70}
      className="waveform-canvas"
      onClick={handleClick}
    />
  );
}

function Track({ emoji, name, waveform, playheadPosition, duration, muted, onToggleMute, onSeek }) {
  return (
    <div className={`track ${muted ? 'muted' : ''}`}>
      <span className="track-emoji" title={name}>{emoji}</span>
      <WaveformCanvas
        waveform={waveform}
        playheadPosition={playheadPosition}
        duration={duration}
        muted={muted}
        onSeek={onSeek}
      />
      <button
        className={`mute-btn ${muted ? 'muted' : ''}`}
        onClick={onToggleMute}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function generateWaveform(audioBuffer, targetSamples) {
  const channelData = audioBuffer.getChannelData(0);
  const downsampleFactor = Math.floor(channelData.length / targetSamples);
  const waveform = new Int8Array(targetSamples);

  for (let i = 0; i < targetSamples; i++) {
    const start = i * downsampleFactor;
    const end = Math.min(start + downsampleFactor, channelData.length);

    let max = 0;
    for (let j = start; j < end; j++) {
      max = Math.max(max, Math.abs(channelData[j]));
    }

    waveform[i] = Math.floor(max * 127);
  }

  return waveform;
}

function App() {
  const [fileName, setFileName] = useState('No file loaded');
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [duration, setDuration] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef(null);
  const gainNodesRef = useRef([]);
  const sourcesRef = useRef([]);
  const startTimeRef = useRef(0);
  const pausePositionRef = useRef(0);
  const animationFrameRef = useRef(null);

  const getCurrentPosition = useCallback(() => {
    if (isPlaying && audioContextRef.current) {
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
      return Math.min(pausePositionRef.current + elapsed, duration);
    }
    return pausePositionRef.current;
  }, [isPlaying, duration]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const animate = () => {
      const pos = getCurrentPosition();
      setCurrentPosition(pos);

      if (pos >= duration) {
        handleStop();
        return;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, duration, getCurrentPosition]);

  const loadFile = async (file) => {
    setLoading(true);
    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(arrayBuffer);

      // Extract all tracks
      const allTracks = extractAllTracks(fileData);

      // Initialize AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      const newTracks = [];
      const newGainNodes = [];

      // Check if this is a stems file (5 tracks) or regular m4a (1 track)
      const isStemsFile = allTracks.length >= 5;

      if (isStemsFile) {
        // Decode each stem track
        for (let i = 0; i < 5; i++) {
          const m4aIndex = TRACK_MAP[i];
          const trackData = allTracks[m4aIndex];

          const audioBuffer = await ctx.decodeAudioData(trackData.buffer.slice(0));
          const waveform = generateWaveform(audioBuffer, 1200);

          const gainNode = ctx.createGain();
          gainNode.connect(ctx.destination);
          const muted = i === 4; // Master muted by default
          gainNode.gain.value = muted ? 0 : 1;
          newGainNodes.push(gainNode);

          newTracks.push({
            name: TRACK_NAMES[i],
            emoji: TRACK_EMOJIS[i],
            audioBuffer,
            waveform,
            muted,
          });
        }
      } else {
        // Single track file - just show the one track
        const trackData = allTracks[0];
        const audioBuffer = await ctx.decodeAudioData(trackData.buffer.slice(0));
        const waveform = generateWaveform(audioBuffer, 1200);

        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        newGainNodes.push(gainNode);

        newTracks.push({
          name: 'Audio',
          emoji: '🎵',
          audioBuffer,
          waveform,
          muted: false,
        });
      }

      gainNodesRef.current = newGainNodes;

      // Set duration from longest track
      const maxDuration = Math.max(...newTracks.map(t => t.audioBuffer?.duration || 0));
      setDuration(maxDuration);
      setTracks(newTracks);
      setCurrentPosition(0);
      pausePositionRef.current = 0;

      console.log('Loaded successfully:', file.name, 'Duration:', maxDuration);
    } catch (error) {
      console.error('Failed to load file:', error);
      setFileName('Error loading file');
    }

    setLoading(false);
  };

  const handlePlay = () => {
    if (isPlaying) return;
    if (!tracks[0].audioBuffer) return;

    const ctx = audioContextRef.current;

    // Resume AudioContext if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Schedule start time
    const scheduleTime = ctx.currentTime + 0.05;
    startTimeRef.current = scheduleTime;

    // Create and start a source for each track
    const newSources = [];
    tracks.forEach((track, index) => {
      if (!track.audioBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = track.audioBuffer;
      source.connect(gainNodesRef.current[index]);
      source.start(scheduleTime, pausePositionRef.current);
      newSources.push(source);
    });

    sourcesRef.current = newSources;
    setIsPlaying(true);
  };

  const handlePause = () => {
    if (!isPlaying) return;

    pausePositionRef.current = getCurrentPosition();
    setCurrentPosition(pausePositionRef.current);

    // Stop all sources
    sourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) { /* Already stopped */ }
    });
    sourcesRef.current = [];

    setIsPlaying(false);
  };

  const handleStop = () => {
    handlePause();
    pausePositionRef.current = 0;
    setCurrentPosition(0);
  };

  const handleToggleMute = (index) => {
    setTracks(prev => {
      const newTracks = [...prev];
      newTracks[index] = { ...newTracks[index], muted: !newTracks[index].muted };

      // Update gain node
      if (gainNodesRef.current[index] && audioContextRef.current) {
        gainNodesRef.current[index].gain.setValueAtTime(
          newTracks[index].muted ? 0 : 1,
          audioContextRef.current.currentTime
        );
      }

      return newTracks;
    });
  };

  const handleSeek = (position) => {
    const wasPlaying = isPlaying;
    const newPosition = Math.max(0, Math.min(position, duration));

    // Stop current sources
    sourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) { /* Already stopped */ }
    });
    sourcesRef.current = [];

    pausePositionRef.current = newPosition;
    setCurrentPosition(newPosition);

    if (wasPlaying) {
      // Restart playback from new position
      const ctx = audioContextRef.current;
      const scheduleTime = ctx.currentTime + 0.05;
      startTimeRef.current = scheduleTime;

      const newSources = [];
      tracks.forEach((track, index) => {
        if (!track.audioBuffer) return;

        const source = ctx.createBufferSource();
        source.buffer = track.audioBuffer;
        source.connect(gainNodesRef.current[index]);
        source.start(scheduleTime, newPosition);
        newSources.push(source);
      });

      sourcesRef.current = newSources;
    } else {
      setIsPlaying(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      handleStop();
      await loadFile(file);
    }
  };

  const hasAudio = tracks.length > 0 && tracks[0].audioBuffer !== null;

  return (
    <div className="app">
      <h1>M4A Stem Player</h1>

      <div className="file-section">
        <label className="file-input-label">
          <input
            type="file"
            id="file-input"
            accept=".m4a,.mp4"
            onChange={handleFileChange}
          />
          Open File
        </label>
        <span className="file-name">{fileName}</span>
        {loading && <span className="loading">Loading...</span>}
      </div>

      <div className="transport">
        <button className="transport-btn" onClick={handlePlay} disabled={!hasAudio}>▶ Play</button>
        <button className="transport-btn" onClick={handlePause} disabled={!hasAudio}>❚❚ Pause</button>
        <button className="transport-btn" onClick={handleStop} disabled={!hasAudio}>■ Stop</button>
        <span className="time-display">
          {formatTime(currentPosition)} / {formatTime(duration)}
        </span>
      </div>

      <div className="tracks-container">
        {tracks.map((track, index) => (
          <Track
            key={index}
            emoji={track.emoji}
            name={track.name}
            waveform={track.waveform}
            playheadPosition={currentPosition}
            duration={duration}
            muted={track.muted}
            onToggleMute={() => handleToggleMute(index)}
            onSeek={handleSeek}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
