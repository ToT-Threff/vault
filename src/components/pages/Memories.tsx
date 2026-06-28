'use client';

import { useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { useParticipants } from '@/lib/hooks';
import { useMemories }     from '@/lib/hooks';
import { cfUrl } from '@/lib/config';
import type { Participant, Memory } from '@/lib/types';
import MarkdownModal from '@/components/MarkdownModal';
import { WARDEN_COLORS } from '@/lib/constants';



// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface MemoriesProps {
  selectedWarden: string | null;
  onSelectWarden: (id: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface WardenCardProps {
  participant:    Participant;
  selected:       boolean;
  onSelect:       (id: string) => void;
}

function WardenCard({ participant: p, selected, onSelect }: WardenCardProps) {
  return (
    <div
      className={`warden-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(p.id)}
      style={{ borderColor: selected ? p.color : undefined }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(p.id)}
    >
      <div
        className="warden-avatar"
        style={{ background: `${p.color}30`, border: `2px solid ${p.color}60` }}
      >
        {p.emoji}
      </div>
      <div className="warden-card-name">{p.name}</div>
      <div className="warden-card-title">{p.title}</div>
      {(p.memoryCount ?? 0) > 0 && (
        <div style={{ marginTop: 4, fontSize: '0.6875rem', color: p.color, fontWeight: 600 }}>
          {p.memoryCount} mem
        </div>
      )}
    </div>
  );
}

interface MemoryResultProps {
  memory: Memory;
  onClick: () => void;
}

function MemoryResult({ memory: m, onClick }: MemoryResultProps) {
  const date = m.createdAt?.toDate?.()
    ? m.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div className="search-result" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="search-result-title">
        {m.summary || m.content.substring(0, 80)}
      </div>
      <div className="search-result-snippet">{m.content}</div>
      <div className="search-result-meta">
        {m.tags?.map((t) => (
          <span key={t} className="search-result-badge">{t}</span>
        ))}
        <span className="search-result-score">{date}</span>
        {m.projectId && (
          <span className="search-result-score">project: {m.projectId}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function Memories({ selectedWarden, onSelectWarden }: MemoriesProps) {
  const [localQuery, setLocalQuery] = useState('');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  // ── New memory modal state ──────────────────────────────────────────────
  const [showNewMemory, setShowNewMemory] = useState(false);
  const [newMemParticipant, setNewMemParticipant] = useState('');
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemTags, setNewMemTags] = useState('');
  const [newMemSaving, setNewMemSaving] = useState(false);
  const [newMemSaved, setNewMemSaved] = useState(false);
  const [newMemError, setNewMemError] = useState<string | null>(null);

  const { data: participants, loading: pLoading } = useParticipants();
  const { data: memories,     loading: mLoading } = useMemories(selectedWarden);

  const active = participants.find((p) => p.id === selectedWarden) ?? null;

  // Client-side text filter on top of real-time memory stream
  const filtered: Memory[] = localQuery.trim()
    ? memories.filter(
        (m) =>
          m.content.toLowerCase().includes(localQuery.toLowerCase()) ||
          m.summary?.toLowerCase().includes(localQuery.toLowerCase()) ||
          m.tags?.some((t) => t.toLowerCase().includes(localQuery.toLowerCase())),
      )
    : memories;

  // ── handleCreateMemory — calls ingestDocument Cloud Function ────────────
  const handleCreateMemory = useCallback(async () => {
    if (!newMemParticipant || !newMemContent.trim()) return;
    setNewMemSaving(true);
    setNewMemError(null);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const tags = newMemTags.split(',').map((t: string) => t.trim()).filter(Boolean);

      const res = await fetch(
        cfUrl('ingestDocument'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            collection: `participants/${newMemParticipant}/memories`,
            content: newMemContent.trim(),
            metadata: {
              tags,
              source: 'vault-ui',
              createdBy: 'ryan',
            },
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create memory');
      }

      setNewMemSaved(true);
      setTimeout(() => {
        setNewMemSaved(false);
        setShowNewMemory(false);
        setNewMemParticipant('');
        setNewMemContent('');
        setNewMemTags('');
      }, 1500);
    } catch (err) {
      setNewMemError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setNewMemSaving(false);
    }
  }, [newMemParticipant, newMemContent, newMemTags]);

  // ── Memory modal meta row ────────────────────────────────────────────────
  const buildMemoryMeta = (memory: Memory) => {
    // Determine participant name from sharedWith map (first non-ryan key, or ryan)
    const participants = Object.keys(memory.sharedWith ?? {});
    const primaryParticipant = participants.find((p) => p !== 'ryan') ?? participants[0] ?? 'unknown';
    const color = WARDEN_COLORS[primaryParticipant] ?? 'var(--text-muted)';
    const date = memory.createdAt?.toDate?.()
      ? memory.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

    return (
      <>
        {/* Warden dot + name */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color, flexShrink: 0,
            boxShadow: `0 0 6px ${color}`,
          }} />
          <span style={{ fontSize: '0.8125rem', color, fontWeight: 600 }}>
            {primaryParticipant}
          </span>
        </span>
        {/* Date */}
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{date}</span>
        {/* Tags */}
        {memory.tags?.map((t) => (
          <span key={t} className="tag tag-purple">{t}</span>
        ))}
        {/* Project badge */}
        {memory.projectId && (
          <span className="tag tag-gold">📁 {memory.projectId}</span>
        )}
      </>
    );
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 className="page-title">🧠 Memory Browser</h1>
          <p className="page-subtitle">
            Warden memories are strictly isolated. You may only read a memory if you were present in that interaction.
            Ryan sees all.
          </p>
        </div>
        <button className="btn btn-gold" onClick={() => {
          setShowNewMemory(!showNewMemory);
          if (!showNewMemory && selectedWarden) setNewMemParticipant(selectedWarden);
        }}>
          {showNewMemory ? '← Browse' : '+ New Memory'}
        </button>
      </div>

      {/* Warden selector */}
      {pLoading ? (
        <div className="warden-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 108, borderRadius: 12 }} />
          ))}
        </div>
      ) : (
        <div className="warden-grid">
          {participants.map((p) => (
            <WardenCard
              key={p.id}
              participant={p}
              selected={selectedWarden === p.id}
              onSelect={onSelectWarden}
            />
          ))}
        </div>
      )}

      {/* Memory search panel */}
      {active && (
        <div className="card" style={{ borderColor: `${active.color}40` }}>
          {/* Active warden header */}
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
                /participants/{active.id}/memories — identity-isolated namespace ·{' '}
                <span style={{ color: active.color }}>
                  {active.memoryCount} indexed
                </span>
              </div>
            </div>
          </div>

          {/* Search/filter input */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <input
              type="text"
              style={{
                flex: 1, background: 'var(--surface-2)',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '10px 14px', color: 'var(--text-primary)',
                fontFamily: 'Inter, sans-serif', fontSize: '0.875rem', outline: 'none',
              }}
              placeholder={`Filter ${active.name}'s memories…`}
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              id={`memory-search-${active.id}`}
            />
            {localQuery && (
              <button
                className="btn btn-ghost"
                onClick={() => setLocalQuery('')}
              >
                ✕ Clear
              </button>
            )}
          </div>

          {/* Loading state */}
          {mLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10 }} />
              ))}
            </div>
          )}

          {/* Results */}
          {!mLoading && filtered.length > 0 && (
            <>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                {filtered.length} memor{filtered.length !== 1 ? 'ies' : 'y'} found
                {localQuery && ` matching "${localQuery}"`}
              </div>
              <div className="search-results">
                {filtered.map((m) => (
                  <MemoryResult key={m.id} memory={m} onClick={() => setSelectedMemory(m)} />
                ))}
              </div>
            </>
          )}

          {/* Empty state */}
          {!mLoading && filtered.length === 0 && (
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
      {!pLoading && !active && (
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

      {/* Memory detail modal */}
      {selectedMemory && (
        <MarkdownModal
          title={selectedMemory.summary || selectedMemory.content.substring(0, 80)}
          content={selectedMemory.content}
          meta={buildMemoryMeta(selectedMemory)}
          onClose={() => setSelectedMemory(null)}
        />
      )}

      {/* New memory modal */}
      {showNewMemory && (
        <div
          onClick={() => setShowNewMemory(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 800,
            background: 'rgba(0,0,0,0.78)',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
          className="backdrop-enter"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-enter"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-bright)',
              borderRadius: 20, maxWidth: 640, width: '95%',
              maxHeight: '88vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 0 80px rgba(120,80,255,0.18), 0 32px 80px rgba(0,0,0,0.7)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '22px 28px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h2 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '1.25rem', fontWeight: 700,
                color: 'var(--text-primary)', margin: 0,
              }}>
                🧠 New Memory
              </h2>
              <button
                onClick={() => setShowNewMemory(false)}
                aria-label="Close new memory modal"
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div style={{ overflowY: 'auto', padding: '24px 28px', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Participant selector */}
                <div>
                  <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    Participant *
                  </label>
                  <select
                    value={newMemParticipant}
                    onChange={(e) => setNewMemParticipant(e.target.value)}
                    style={{
                      width: '100%', background: 'var(--surface-2)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      padding: '10px 14px', color: 'var(--text-primary)',
                      fontFamily: 'Inter, sans-serif', fontSize: '0.9375rem', outline: 'none',
                    }}
                  >
                    <option value="">Select a warden…</option>
                    {participants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.emoji} {p.name} — {p.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Content */}
                <div>
                  <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    Content * (Markdown supported)
                  </label>
                  <textarea
                    value={newMemContent}
                    onChange={(e) => setNewMemContent(e.target.value)}
                    placeholder="Write the memory content…"
                    rows={10}
                    style={{
                      width: '100%', background: 'var(--surface-2)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      padding: '12px 14px', color: 'var(--text-primary)',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: '0.875rem',
                      outline: 'none', resize: 'vertical', lineHeight: 1.6,
                    }}
                  />
                </div>

                {/* Tags */}
                <div>
                  <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newMemTags}
                    onChange={(e) => setNewMemTags(e.target.value)}
                    placeholder="decision, architecture, strategy"
                    style={{
                      width: '100%', background: 'var(--surface-2)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      padding: '10px 14px', color: 'var(--text-primary)',
                      fontFamily: 'Inter, sans-serif', fontSize: '0.875rem', outline: 'none',
                    }}
                  />
                </div>

                {newMemError && (
                  <div className="auth-error">{newMemError}</div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className={`btn ${newMemSaved ? 'btn-gold' : 'btn-primary'}`}
                    onClick={handleCreateMemory}
                    disabled={newMemSaving || !newMemParticipant || !newMemContent.trim()}
                    style={{ opacity: newMemSaving ? 0.7 : 1 }}
                  >
                    {newMemSaving ? 'Saving…' : newMemSaved ? '✓ Saved!' : 'Save Memory'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowNewMemory(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
