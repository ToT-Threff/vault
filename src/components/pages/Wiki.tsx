'use client';

import { useState } from 'react';

export default function Wiki({ searchQuery }: { searchQuery: string }) {
  const [view, setView] = useState<'browse' | 'new'>('browse');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    // TODO: wire to wikiCreate Cloud Function
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); setView('browse'); setTitle(''); setBody(''); setTags(''); }, 1500);
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 className="page-title">📚 Archival Wiki</h1>
          <p className="page-subtitle">Living knowledge base for the entire kingdom. Every article is semantically indexed.</p>
        </div>
        <button className="btn btn-gold" onClick={() => setView(view === 'new' ? 'browse' : 'new')}>
          {view === 'new' ? '← Browse' : '+ New Article'}
        </button>
      </div>

      {view === 'new' ? (
        /* ── Article editor ─────────────────────────────────────────────────── */
        <div className="card" style={{ maxWidth: 780 }}>
          <h2 className="section-title" style={{ marginBottom: 20 }}>New Wiki Article</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Title *
              </label>
              <input
                id="wiki-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Article title…"
                style={{
                  width: '100%', background: 'var(--surface-2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 14px', color: 'var(--text-primary)',
                  fontFamily: 'Inter, sans-serif', fontSize: '0.9375rem',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Body * (Markdown supported)
              </label>
              <textarea
                id="wiki-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the article content in markdown…"
                rows={16}
                style={{
                  width: '100%', background: 'var(--surface-2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '12px 14px', color: 'var(--text-primary)',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.875rem',
                  outline: 'none', resize: 'vertical', lineHeight: 1.6,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Tags (comma-separated)
              </label>
              <input
                id="wiki-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="omniland, strategy, phase-1"
                style={{
                  width: '100%', background: 'var(--surface-2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 14px', color: 'var(--text-primary)',
                  fontFamily: 'Inter, sans-serif', fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className={`btn ${saved ? 'btn-gold' : 'btn-primary'}`}
                onClick={handleSave}
                disabled={saving || !title.trim() || !body.trim()}
                style={{ opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save & Index'}
              </button>
              <button className="btn btn-ghost" onClick={() => setView('browse')}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Browse mode ──────────────────────────────────────────────────────── */
        <div>
          {/* Search bar */}
          <div style={{ marginBottom: 24, position: 'relative' }}>
            <svg style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              width: 16, height: 16, color: 'var(--text-muted)',
            }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              id="wiki-search"
              defaultValue={searchQuery}
              placeholder="Semantic search the wiki…"
              style={{
                width: '100%', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 10,
                padding: '11px 14px 11px 42px', color: 'var(--text-primary)',
                fontFamily: 'Inter, sans-serif', fontSize: '0.9375rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Empty state */}
          <div style={{
            textAlign: 'center', padding: '64px 20px',
            border: '1px dashed var(--border)', borderRadius: 14,
            color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 12, opacity: 0.6 }}>📚</div>
            <div style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              The wiki is empty — for now.
            </div>
            <div style={{ fontSize: '0.875rem', marginBottom: 20 }}>
              Bootstrap ingestion will populate it with all existing kingdom markdown files.
            </div>
            <div style={{
              background: 'var(--surface)', borderRadius: 8,
              padding: '10px 16px', display: 'inline-block', textAlign: 'left',
            }}>
              <code style={{ fontSize: '0.8125rem', color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace" }}>
                node scripts/ingest-worker.js --bootstrap
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
