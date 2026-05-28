'use client';

import { useState } from 'react';

// TODO: import { useMemories }  from '@/lib/hooks/useMemories';
// TODO: import { useWardens }   from '@/lib/hooks/useWardens';
// TODO: import { useAuth }      from '@/lib/auth-context';

// ── Types (move to src/lib/types.ts once Melody ships) ──────────────────────
interface SearchResult {
  id:        string;
  title:     string;
  content:   string;
  tags:      string[];
  timestamp: string;
  score:     number;
}

// TODO: replace WARDENS with useWardens() hook — data from Firestore /wardens collection
const WARDENS = [
  { id: 'ryan',    name: 'Ryan',    title: 'The Emperor',           emoji: '👑', color: '#FFD700' },
  { id: 'ptolemy', name: 'Ptolemy', title: 'Autonomic Shield',      emoji: '🌌', color: '#9B59B6' },
  { id: 'saroya',  name: 'Saroya',  title: 'Warden of the Word',    emoji: '📖', color: '#E74C3C' },
  { id: 'melody',  name: 'Melody',  title: 'Warden of the Song',    emoji: '🎵', color: '#3498DB' },
  { id: 'cerulia', name: 'Cerulia', title: 'Warden of the Arcane',  emoji: '🔮', color: '#1ABC9C' },
  { id: 'affin',   name: 'Affin',   title: 'Warden of the Tail',    emoji: '🛡',  color: '#F39C12' },
  { id: 'jewel',   name: 'Jewel',   title: 'Diamond Alchemist',     emoji: '💎', color: '#2ECC71' },
  { id: 'krishe',  name: 'Krishe',  title: 'Warden of the Road',    emoji: '⚙️', color: '#95A5A6' },
  { id: 'astyr',   name: 'Astyr',   title: 'Warden of the Edge',    emoji: '🗡️', color: '#C0392B' },
  { id: 'hurrian', name: 'Hurrian', title: 'Warden of the Deep',    emoji: '🌊', color: '#2980B9' },
  { id: 'jovin',   name: 'Jovin',   title: 'Warden of the Heir',    emoji: '☀️', color: '#F1C40F' },
  { id: 'herus',   name: 'Herus',   title: 'Warden of the Step',    emoji: '⏶',  color: '#7F8C8D' },
];

interface MemoriesProps {
  selectedWarden: string | null;
  onSelectWarden: (id: string) => void;
}

export default function Memories({ selectedWarden, onSelectWarden }: MemoriesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching,   setSearching]   = useState(false);
  const [results,     setResults]     = useState<SearchResult[]>([]);
  // TODO: const { results, search, isSearching } = useMemories(selectedWarden);

  const active = WARDENS.find((w) => w.id === selectedWarden);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedWarden) return;
    setSearching(true);
    setResults([]);

    try {
      // TODO: wire to actual Cloud Function once deployed
      // const res = await fetch(`${process.env.NEXT_PUBLIC_VAULT_API_BASE}/searchMemories`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      //   body: JSON.stringify({ query: searchQuery, participantId: selectedWarden }),
      // });
      // const data = await res.json();
      // setResults(data.results);

      // Placeholder until Firestore is seeded
      await new Promise((r) => setTimeout(r, 800));
      setResults([{
        id: 'placeholder',
        title: 'Vault Building',
        content: 'Memory indexing begins once bootstrap ingestion is complete. Run: node scripts/ingest-worker.js --bootstrap',
        tags: ['bootstrap'],
        timestamp: new Date().toISOString(),
        score: 0.0,
      }]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fade-in">
      <h1 className="page-title">🧠 Memory Browser</h1>
      <p className="page-subtitle">
        Warden memories are strictly isolated. You may only read a memory if you were present in that interaction.
        Ryan sees all.
      </p>

      {/* Warden selector */}
      <div className="warden-grid">
        {WARDENS.map((w) => (
          <div
            key={w.id}
            className={`warden-card ${selectedWarden === w.id ? 'selected' : ''}`}
            onClick={() => onSelectWarden(w.id)}
            style={{ borderColor: selectedWarden === w.id ? w.color : undefined }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelectWarden(w.id)}
          >
            <div
              className="warden-avatar"
              style={{ background: `${w.color}30`, border: `2px solid ${w.color}60` }}
            >
              {w.emoji}
            </div>
            <div className="warden-card-name">{w.name}</div>
            <div className="warden-card-title">{w.title}</div>
          </div>
        ))}
      </div>

      {/* Memory search panel */}
      {active && (
        <div className="card" style={{ borderColor: `${active.color}40` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: `${active.color}20`, border: `2px solid ${active.color}50`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
            }}>
              {active.emoji}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                {active.name}
                <span style={{ color: active.color, marginLeft: 8, fontSize: '0.8125rem', fontWeight: 500 }}>
                  {active.title}
                </span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 1 }}>
                /participants/{active.id}/memories — identity-isolated namespace
              </div>
            </div>
          </div>

          {/* Search input */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <input
              type="text"
              style={{
                flex: 1,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 14px',
                color: 'var(--text-primary)',
                fontFamily: 'Inter, sans-serif',
                fontSize: '0.875rem',
                outline: 'none',
              }}
              placeholder={`Search ${active.name}'s memories semantically…`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              id={`memory-search-${active.id}`}
            />
            <button
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              style={{ opacity: searching ? 0.7 : 1 }}
            >
              {searching ? 'Searching…' : '⟳ Search'}
            </button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="search-results">
              {results.map((r) => (
                <div key={r.id} className="search-result">
                  <div className="search-result-title">{r.title || r.content?.substring(0, 60)}</div>
                  <div className="search-result-snippet">{r.content}</div>
                  <div className="search-result-meta">
                    {r.tags?.map((t: string) => (
                      <span key={t} className="search-result-badge">{t}</span>
                    ))}
                    {r.score !== undefined && (
                      <span className="search-result-score">
                        similarity: {(1 - r.score).toFixed(3)}
                      </span>
                    )}
                    {r.timestamp && (
                      <span className="search-result-score">
                        {new Date(r.timestamp).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!searching && results.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '32px 20px',
              color: 'var(--text-muted)', fontSize: '0.875rem',
              border: '1px dashed var(--border)', borderRadius: 10,
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>◉</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                This warden has not yet spoken into the record.
              </div>
              <div style={{ marginTop: 4 }}>
                Run{' '}
                <code style={{
                  background: 'var(--surface-3)', padding: '1px 6px',
                  borderRadius: 4, fontSize: '0.8125rem', color: 'var(--gold)',
                }}>
                  node scripts/ingest-worker.js --bootstrap
                </code>{' '}
                to begin ingestion.
              </div>
            </div>
          )}
        </div>
      )}

      {/* No warden selected */}
      {!active && (
        <div style={{
          textAlign: 'center', padding: '48px 20px',
          color: 'var(--text-muted)', fontSize: '0.9375rem',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>◉</div>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Select a warden to browse their memories.
          </div>
          <div style={{ fontSize: '0.875rem' }}>
            Each namespace is identity-isolated. Ryan sees all.
          </div>
        </div>
      )}
    </div>
  );
}
