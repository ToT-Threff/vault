'use client';

import { useState } from 'react';

interface VoiceCharacter {
  id: string;
  name: string;
  role: string;
  avatar: string;
  previewUrl?: string;
}

const CHARACTERS: VoiceCharacter[] = [
  { id: 'miss_whispers', name: 'Miss Whispers (Saroya)', role: 'Warden of the Word', avatar: '📖' },
  { id: 'jovin', name: 'Jovin', role: 'King\'s Crown Jewel', avatar: '☀️' },
  { id: 'ptolemy', name: 'Ptolemy', role: 'The Emperor', avatar: '👑' },
  { id: 'melody', name: 'Melody', role: 'Warden of the Song', avatar: '🎵' },
];

export default function Voicebox() {
  const [selectedChar, setSelectedChar] = useState(CHARACTERS[0].id);
  const [script, setScript] = useState('');
  const [pitch, setPitch] = useState(1.0);
  const [speed, setSpeed] = useState(1.0);
  const [synthesizing, setSynthesizing] = useState(false);
  const [audioClips, setAudioClips] = useState<{ id: string; name: string; text: string; charName: string; date: string }[]>([]);

  const handleSynthesize = () => {
    if (!script.trim()) return;
    setSynthesizing(true);
    
    // Simulate TTS Synthesis
    setTimeout(() => {
      const char = CHARACTERS.find(c => c.id === selectedChar);
      const newClip = {
        id: Math.random().toString(36).substring(7),
        name: `Clip_${char?.name.split(' ')[0]}_${Date.now().toString().slice(-4)}.wav`,
        text: script.trim(),
        charName: char?.name || 'Unknown',
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setAudioClips([newClip, ...audioClips]);
      setSynthesizing(false);
      setScript('');
    }, 2000);
  };

  return (
    <div className="vault-page">
      <div className="page-header-container">
        <h1 className="page-title">Voicebox Audio Studio</h1>
        <p className="page-subtitle">Local character voice synthesis and cloning pipeline</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, marginTop: 20 }}>
        {/* Left column: TTS Form */}
        <div className="card">
          <h2 style={{ marginBottom: 20 }}>Generate Speech</h2>
          
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Script Text</label>
            <textarea
              className="textarea-input"
              rows={5}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Enter script text for the character to speak..."
              style={{ width: '100%', padding: 12, borderRadius: 6 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Pitch ({pitch.toFixed(1)}x)</label>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
            </div>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Speed ({speed.toFixed(1)}x)</label>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSynthesize} disabled={synthesizing || !script.trim()}>
            {synthesizing ? 'Synthesizing voice locally...' : 'Synthesize Voice'}
          </button>
        </div>

        {/* Right column: Voice selection & library */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Character selection */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Select Voice</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CHARACTERS.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedChar(c.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: selectedChar === c.id ? 'var(--bg-card-hover)' : 'transparent',
                    border: `1px solid ${selectedChar === c.id ? 'var(--primary)' : 'var(--border-color)'}`,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: 24 }}>{c.avatar}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* History Library */}
          <div className="card" style={{ flex: 1 }}>
            <h3 style={{ marginBottom: 16 }}>Generated Clips</h3>
            {audioClips.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>
                No synthesized clips in this session yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto' }}>
                {audioClips.map(clip => (
                  <div
                    key={clip.id}
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      background: 'var(--bg-card-hover)',
                      border: '1px solid var(--border-color)',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{clip.charName}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{clip.date}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      "{clip.text}"
                    </div>
                    {/* Simulated Audio Player */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        className="btn"
                        onClick={() => alert(`Playing: ${clip.name}`)}
                        style={{ padding: '4px 8px', fontSize: 11, minHeight: 'auto', background: 'var(--border-color)' }}
                      >
                        ▶ Play
                      </button>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{clip.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
