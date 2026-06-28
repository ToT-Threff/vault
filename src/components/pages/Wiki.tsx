'use client';

import { useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { useWikiArticles } from '@/lib/hooks';
import { cfUrl } from '@/lib/config';
import type { WikiArticle } from '@/lib/types';
import MarkdownModal from '@/components/MarkdownModal';
import { WARDEN_COLORS } from '@/lib/constants';



// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ArticleCard({ article, onClick }: { article: WikiArticle; onClick: () => void }) {
  const authorColor = WARDEN_COLORS[article.author] ?? 'var(--text-muted)';
  const date = article.updatedAt?.toDate?.()
    ? article.updatedAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  // Preview: first non-empty line of content, capped at 200 chars
  const preview = article.content
    .split('\n')
    .find((l) => l.trim() && !l.startsWith('#'))
    ?.trim()
    .substring(0, 200) ?? '';

  return (
    <div
      className="search-result"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="search-result-title">{article.title}</div>
      {preview && <div className="search-result-snippet">{preview}</div>}
      <div className="search-result-meta">
        {article.tags.slice(0, 4).map((t) => (
          <span key={t} className="search-result-badge">{t}</span>
        ))}
        <span className="search-result-score" style={{ color: authorColor }}>
          {article.author}
        </span>
        <span className="search-result-score">{date}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function Wiki({ searchQuery }: { searchQuery: string }) {
  const [view,   setView]   = useState<'browse' | 'new'>('browse');
  const [title,  setTitle]  = useState('');
  const [body,   setBody]   = useState('');
  const [tags,   setTags]   = useState('');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [selectedArticle, setSelectedArticle] = useState<WikiArticle | null>(null);

  // ── Edit state ──────────────────────────────────────────────────────────
  const [editingArticle, setEditingArticle] = useState<WikiArticle | null>(null);
  const [editTitle,  setEditTitle]  = useState('');
  const [editBody,   setEditBody]   = useState('');
  const [editTags,   setEditTags]   = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved,  setEditSaved]  = useState(false);
  const [editError,  setEditError]  = useState<string | null>(null);

  const { data: articles, loading, error } = useWikiArticles(searchQuery);

  // ── handleSave — calls real wikiCreate Cloud Function ───────────────────
  const handleSave = useCallback(async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        cfUrl('wikiCreate'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: title.trim(),
            content: body.trim(),
            tags: tags.split(',').map((t: string) => t.trim()).filter(Boolean),
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save article');
      }

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setView('browse');
        setTitle('');
        setBody('');
        setTags('');
      }, 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, [title, body, tags]);

  // ── openEdit — populate edit form from article ─────────────────────────
  const openEdit = useCallback((article: WikiArticle) => {
    setEditingArticle(article);
    setEditTitle(article.title);
    setEditBody(article.content);
    setEditTags(article.tags.join(', '));
    setEditSaved(false);
    setEditError(null);
    setSelectedArticle(null);  // close the view modal
  }, []);

  // ── handleEditSave — calls wikiUpdate Cloud Function ───────────────────
  const handleEditSave = useCallback(async () => {
    if (!editingArticle || !editTitle.trim() || !editBody.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        cfUrl('wikiUpdate'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            articleId: editingArticle.id,
            title: editTitle.trim(),
            content: editBody.trim(),
            tags: editTags.split(',').map((t: string) => t.trim()).filter(Boolean),
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update article');
      }

      setEditSaved(true);
      setTimeout(() => {
        setEditSaved(false);
        setEditingArticle(null);
      }, 1500);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setEditSaving(false);
    }
  }, [editingArticle, editTitle, editBody, editTags]);

  // ── Wiki modal meta row ──────────────────────────────────────────────────
  const buildArticleMeta = (article: WikiArticle) => {
    const authorColor = WARDEN_COLORS[article.author] ?? 'var(--text-muted)';
    const date = article.updatedAt?.toDate?.()
      ? article.updatedAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

    return (
      <>
        {/* Author warden dot + name */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: authorColor, flexShrink: 0,
            boxShadow: `0 0 6px ${authorColor}`,
          }} />
          <span style={{ fontSize: '0.8125rem', color: authorColor, fontWeight: 600 }}>
            {article.author}
          </span>
        </span>
        {/* Updated date */}
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{date}</span>
        {/* Tags */}
        {article.tags.map((t) => (
          <span key={t} className="tag tag-purple">{t}</span>
        ))}
        {/* Edit button */}
        <button
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '0.8125rem' }}
          onClick={() => openEdit(article)}
        >
          ✏️ Edit
        </button>
      </>
    );
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
        /* ── Article editor ──────────────────────────────────────────────────── */
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
                  fontFamily: 'Inter, sans-serif', fontSize: '0.9375rem', outline: 'none',
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
                  fontFamily: 'Inter, sans-serif', fontSize: '0.875rem', outline: 'none',
                }}
              />
            </div>

            {saveError && (
              <div className="auth-error">{saveError}</div>
            )}

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
        /* ── Browse mode ─────────────────────────────────────────────────────── */
        <div>
          {/* Inline search bar — value controlled by parent Header */}
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
              value={searchQuery}
              onChange={() => {/* Global search is managed by parent Header */}}
              readOnly
              placeholder="Semantic search the wiki…"
              style={{
                width: '100%', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 10,
                padding: '11px 14px 11px 42px', color: 'var(--text-primary)',
                fontFamily: 'Inter, sans-serif', fontSize: '0.9375rem', outline: 'none',
              }}
            />
          </div>

          {/* Error state */}
          {error && (
            <div className="auth-error" style={{ marginBottom: 16 }}>
              Failed to load wiki: {error.message}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 88, borderRadius: 12 }} />
              ))}
            </div>
          )}

          {/* Article list */}
          {!loading && articles.length > 0 && (
            <>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                {articles.length} article{articles.length !== 1 ? 's' : ''}
                {searchQuery.trim() && ` matching "${searchQuery}"`}
              </div>
              <div className="search-results">
                {articles.map((a) => (
                  <ArticleCard key={a.id} article={a} onClick={() => setSelectedArticle(a)} />
                ))}
              </div>
            </>
          )}

          {/* Empty state */}
          {!loading && articles.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '64px 20px',
              border: '1px dashed var(--border)', borderRadius: 14,
              color: 'var(--text-muted)',
            }}>
              <div style={{ fontSize: '3.5rem', marginBottom: 12, opacity: 0.6 }}>📚</div>
              <div style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {searchQuery.trim()
                  ? 'The index finds nothing. The word may not exist yet.'
                  : 'Nothing has been written here yet. The page waits.'}
              </div>
              {!searchQuery.trim() && (
                <div style={{ fontSize: '0.875rem', marginBottom: 20 }}>
                  Bootstrap ingestion will populate it with all existing kingdom markdown files.
                </div>
              )}
              {!searchQuery.trim() && (
                <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 16px', display: 'inline-block', textAlign: 'left' }}>
                  <code style={{ fontSize: '0.8125rem', color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace" }}>
                    node scripts/ingest-worker.js --bootstrap
                  </code>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Wiki article detail modal */}
      {selectedArticle && (
        <MarkdownModal
          title={selectedArticle.title}
          content={selectedArticle.content}
          meta={buildArticleMeta(selectedArticle)}
          onClose={() => setSelectedArticle(null)}
        />
      )}

      {/* Wiki article edit modal */}
      {editingArticle && (
        <div
          onClick={() => setEditingArticle(null)}
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
              borderRadius: 20, maxWidth: 760, width: '95%',
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
                ✏️ Edit Article
              </h2>
              <button
                onClick={() => setEditingArticle(null)}
                aria-label="Close edit modal"
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable edit form */}
            <div style={{ overflowY: 'auto', padding: '24px 28px', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{
                      width: '100%', background: 'var(--surface-2)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      padding: '10px 14px', color: 'var(--text-primary)',
                      fontFamily: 'Inter, sans-serif', fontSize: '0.9375rem', outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    Content * (Markdown supported)
                  </label>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
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
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    style={{
                      width: '100%', background: 'var(--surface-2)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      padding: '10px 14px', color: 'var(--text-primary)',
                      fontFamily: 'Inter, sans-serif', fontSize: '0.875rem', outline: 'none',
                    }}
                  />
                </div>

                {editError && (
                  <div className="auth-error">{editError}</div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className={`btn ${editSaved ? 'btn-gold' : 'btn-primary'}`}
                    onClick={handleEditSave}
                    disabled={editSaving || !editTitle.trim() || !editBody.trim()}
                    style={{ opacity: editSaving ? 0.7 : 1 }}
                  >
                    {editSaving ? 'Saving…' : editSaved ? '✓ Updated!' : 'Save Changes'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setEditingArticle(null)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
