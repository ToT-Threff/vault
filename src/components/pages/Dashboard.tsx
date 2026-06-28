'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Page } from '@/app/page';
import { WARDEN_COLORS, ALL_WARDEN_IDS } from '@/lib/constants';
import { useProjects }     from '@/lib/hooks';
import { useKingdomStats } from '@/lib/hooks';
import { useActivity }     from '@/lib/hooks';
import { useWorkspaces }   from '@/lib/hooks';
import { useTokenUsage }   from '@/lib/hooks';
import type { Project, KingdomStats, ProjectStatus } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Static data that doesn't come from Firestore
// ─────────────────────────────────────────────────────────────────────────────

// ── Activity feed helpers ──────────────────────────────────────────────────────

const ACTION_VERB: Record<string, string> = {
  created:  'Created',
  updated:  'Updated',
  uploaded: 'Uploaded',
};

const TYPE_ICON: Record<string, string> = {
  wiki:    '📄',
  file:    '📎',
  project: '🏛️',
};

/** Convert a Firestore Timestamp to a human-readable relative string */
function timeAgo(ts: { seconds: number } | null | undefined): string {
  if (!ts) return '';
  const now   = Date.now() / 1000;
  const delta = Math.max(0, now - ts.seconds);
  if (delta < 60)   return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} hrs ago`;
  return `${Math.floor(delta / 86400)} days ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Project status → tag class mapping
// Firestore ProjectStatus: 'active' | 'backlog' | 'paused' | 'complete'
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Project['status'], { label: string; tagClass: string }> = {
  active:   { label: 'Active',    tagClass: 'tag-teal'   },
  backlog:  { label: 'Backlog',   tagClass: 'tag-gold'   },
  paused:   { label: 'Paused',    tagClass: 'tag-purple' },
  complete: { label: 'Complete',  tagClass: 'tag-purple' },
};



// ─────────────────────────────────────────────────────────────────────────────
// Stat display helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Render a stat value — returns '—' for 0 when that field is known-broken (totalMemories) */
function renderStat(value: number | undefined, suppressZero = false): string {
  if (value === undefined || value === null) return '—';
  if (suppressZero && value === 0) return '—';
  return String(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton card
// ─────────────────────────────────────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="stat-card">
      <div className="skeleton" style={{ height: 32, width: 60, marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 12, width: 100, marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 10, width: 70 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading spinner (inline SVG, no deps)
// ─────────────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16"
      style={{ animation: 'spin 0.75s linear infinite', display: 'block' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="8" cy="8" r="6"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeDasharray="24" strokeDashoffset="8"
        strokeLinecap="round" opacity="0.8"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New Project Modal
// ─────────────────────────────────────────────────────────────────────────────

interface NewProjectModalProps {
  onClose: () => void;
}

function NewProjectModal({ onClose }: NewProjectModalProps) {
  const [name, setName]                         = useState('');
  const [description, setDesc]                  = useState('');
  const [status, setStatus]                     = useState<ProjectStatus>('active');
  const [wardens, setWardens]                   = useState<string[]>([]);
  const [submitting, setSubmitting]             = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [nameError, setNameError]               = useState(false);
  const [workspaceMode, setWorkspaceMode]       = useState<'new' | 'existing'>('new');
  const [selectedWorkspaceId, setSelectedWsId] = useState<string>('');
  const { data: workspaces, loading: workspacesLoading } = useWorkspaces();

  // Live slug preview derived from project name
  const repoSlug = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') || 'my-project';

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const toggleWarden = (w: string) => {
    setWardens((prev) =>
      prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setError(null);
    setSubmitting(true);

    try {
      await addDoc(collection(db, 'kingdom', 'projects', 'items'), {
        name:        name.trim(),
        description: description.trim(),
        status,
        wardens,
        workspace:   workspaceMode,
        ...(workspaceMode === 'existing' && { workspaceId: selectedWorkspaceId }),
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Firestore write failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-3, #12101a)',
    border: `1px solid var(--border)`,
    borderRadius: 8,
    padding: '10px 13px',
    color: 'var(--text-primary)',
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.9375rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 7,
  };

  return (
    /* Backdrop */
    <div
      className="backdrop-enter"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* Modal card — stop propagation so clicking inside doesn't close */}
      <div
        className="modal-enter"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border-bright)',
          borderRadius: 16,
          padding: 32,
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 0 60px rgba(120,80,255,0.2), 0 24px 64px rgba(0,0,0,0.6)',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            New Project
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '1.25rem', lineHeight: 1,
              padding: '4px 8px', borderRadius: 6,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Name */}
          <div>
            <label style={labelStyle} htmlFor="proj-name">Project Name *</label>
            <input
              id="proj-name"
              type="text"
              value={name}
              placeholder="e.g. Kingdom Vault"
              onChange={(e) => { setName(e.target.value); setNameError(false); }}
              style={{
                ...inputStyle,
                borderColor: nameError ? 'var(--crimson, #e74c3c)' : 'var(--border)',
                boxShadow: nameError ? '0 0 0 3px rgba(231,76,60,0.15)' : 'none',
              }}
              autoFocus
            />
            {nameError && (
              <div style={{ marginTop: 5, fontSize: '0.75rem', color: 'var(--crimson, #e74c3c)' }}>
                Project name is required.
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle} htmlFor="proj-desc">Description</label>
            <textarea
              id="proj-desc"
              value={description}
              placeholder="What is this project about?"
              rows={3}
              onChange={(e) => setDesc(e.target.value)}
              style={{
                ...inputStyle,
                resize: 'vertical',
                lineHeight: 1.6,
                minHeight: 80,
              }}
            />
          </div>

          {/* Workspace */}
          <div>
            <label style={labelStyle}>Workspace</label>

            {/* Segmented control */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['new', 'existing'] as const).map((mode) => {
                const isActive = workspaceMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setWorkspaceMode(mode)}
                    style={{
                      flex: 1,
                      padding: '7px 12px',
                      borderRadius: 20,
                      border: `1.5px solid ${isActive ? 'var(--border-bright)' : 'var(--border)'}`,
                      background: isActive ? 'var(--surface-3, #12101a)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: '0.8125rem',
                      fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      userSelect: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                      }
                    }}
                  >
                    {mode === 'new' ? '+ Create New Workspace' : 'Attach to Existing'}
                  </button>
                );
              })}
            </div>

            {/* Create New mode */}
            {workspaceMode === 'new' && (
              <>
                <div style={{
                  fontSize: '0.8rem',
                  fontStyle: 'italic',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  marginBottom: 8,
                }}>
                  A new GitHub repo and Mac Mini workspace will be created automatically.
                </div>
                {name.trim() && (
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    padding: '6px 10px',
                    background: 'var(--surface-3, #12101a)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                  }}>
                    🔗 github.com/ToT-Threff/{repoSlug}
                  </div>
                )}
              </>
            )}

            {/* Attach to Existing mode */}
            {workspaceMode === 'existing' && (
              <select
                id="proj-workspace"
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWsId(e.target.value)}
                disabled={workspacesLoading || workspaces.length === 0}
                style={{ ...inputStyle, cursor: workspaces.length === 0 ? 'default' : 'pointer', appearance: 'auto' }}
              >
                {workspacesLoading ? (
                  <option value="" disabled>Loading workspaces…</option>
                ) : workspaces.length === 0 ? (
                  <option value="" disabled>No workspaces registered yet</option>
                ) : (
                  workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} — {ws.repoName}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Status */}
          <div>
            <label style={labelStyle} htmlFor="proj-status">Status</label>
            <select
              id="proj-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
            >
              <option value="active">Active</option>
              <option value="backlog">Backlog</option>
              <option value="paused">Paused</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          {/* Wardens multi-chip */}
          <div>
            <label style={labelStyle}>Wardens</label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))',
              gap: 8,
            }}>
              {ALL_WARDEN_IDS.map((w) => {
                const color   = WARDEN_COLORS[w];
                const selected = wardens.includes(w);
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => toggleWarden(w)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      padding: '6px 10px',
                      borderRadius: 100,
                      border: `1.5px solid ${selected ? color : 'var(--border)'}`,
                      background: selected ? `${color}22` : 'transparent',
                      color: selected ? color : 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      userSelect: 'none',
                      textTransform: 'capitalize',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        (e.currentTarget as HTMLElement).style.borderColor = color;
                        (e.currentTarget as HTMLElement).style.color = color;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                      }
                    }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: color, flexShrink: 0,
                      boxShadow: selected ? `0 0 6px ${color}80` : 'none',
                    }} />
                    {w}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            marginTop: 20,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(231,76,60,0.1)',
            border: '1px solid rgba(231,76,60,0.3)',
            fontSize: '0.8125rem',
            color: '#e74c3c',
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* Footer buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 28 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              background: submitting
                ? 'var(--surface-3, #12101a)'
                : 'linear-gradient(135deg, var(--gold, #d4a843), #b8902a)',
              color: submitting ? 'var(--text-muted)' : 'var(--obsidian, #0a0812)',
              boxShadow: submitting ? 'none' : '0 2px 12px rgba(212,168,67,0.4)',
              minWidth: 140,
              justifyContent: 'center',
            }}
          >
            {submitting ? (
              <>
                <Spinner />
                Creating…
              </>
            ) : (
              'Create Project'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardProps {
  onNavigate: (page: Page, warden?: string) => void;
}

// ── Embedding Worker Status shape ───────────────────────────────────────────

interface EmbeddingWorkerStatus {
  uptime: string;
  totalEmbedded: number;
  totalErrors: number;
  status: string;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [time, setTime]               = useState('');
  const [expandedVec, setExpandedVec] = useState(false);
  const [showModal, setShowModal]     = useState(false);

  const { data: projects, loading: projectsLoading }  = useProjects();
  const { data: stats,    loading: statsLoading }     = useKingdomStats();
  const { data: activity, loading: activityLoading }  = useActivity();
  const { data: tokenStats, loading: tokenLoading }   = useTokenUsage();

  // Embedding worker status (localhost:4002)
  const [embedStatus, setEmbedStatus] = useState<EmbeddingWorkerStatus | null>(null);
  const [embedError, setEmbedError]   = useState(false);

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Poll embedding worker every 30 seconds
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch('http://localhost:4002', { signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setEmbedStatus({
            uptime: data.uptime ?? data.uptimeHuman ?? '—',
            totalEmbedded: data.totalEmbedded ?? data.total_embedded ?? 0,
            totalErrors: data.totalErrors ?? data.total_errors ?? 0,
            status: data.status ?? 'online',
          });
          setEmbedError(false);
        }
      } catch {
        if (!cancelled) {
          setEmbedStatus(null);
          setEmbedError(true);
        }
      }
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const openModal  = useCallback(() => setShowModal(true),  []);
  const closeModal = useCallback(() => setShowModal(false), []);

  // ── Derived stat rows ──────────────────────────────────────────────────────
  const statRows = buildStatRows(stats);

  return (
    <div className="fade-in">
      {/* New Project Modal */}
      {showModal && <NewProjectModal onClose={closeModal} />}

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Kingdom Dashboard</h1>
            <p className="page-subtitle">The sovereign view of the Ptolemy empire.</p>
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '1.25rem',
            color: 'var(--gold)',
            opacity: 0.8,
            letterSpacing: '0.05em',
            paddingTop: 6,
          }}>
            {time}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {statsLoading
          ? Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
          : statRows.map((s) => {
            const isVec      = s.page === 'expand';
            const isExpanded = isVec && expandedVec;

            return (
              <div
                key={s.label}
                className="stat-card"
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer', userSelect: 'none', position: 'relative' }}
                onClick={() => {
                  if (isVec) {
                    setExpandedVec((v) => !v);
                  } else if (s.page) {
                    onNavigate(s.page as Page);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (isVec) {
                      setExpandedVec((v) => !v);
                    } else if (s.page) {
                      onNavigate(s.page as Page);
                    }
                  }
                }}
                onMouseEnter={(e) => {
                  const chevron = e.currentTarget.querySelector<HTMLElement>('.stat-chevron');
                  if (chevron) chevron.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  const chevron = e.currentTarget.querySelector<HTMLElement>('.stat-chevron');
                  if (chevron) chevron.style.opacity = '0';
                }}
              >
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{s.sub}</div>
                {s.trend === 'up' && (
                  <div className="stat-change up" style={{ marginTop: 8 }}>↑ Growing</div>
                )}

                {/* Hover chevron indicator */}
                <div
                  className="stat-chevron"
                  style={{
                    position: 'absolute',
                    bottom: 14,
                    right: 16,
                    fontSize: '0.875rem',
                    color: 'var(--border-bright)',
                    opacity: 0,
                    transition: 'opacity 0.15s',
                    pointerEvents: 'none',
                  }}
                >
                  {isVec ? (isExpanded ? '↑' : '↓') : '→'}
                </div>

                {/* Vector Dims expand panel */}
                {isVec && isExpanded && (
                  <div
                    className="expand-down"
                    style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    768-dimensional vectors generated by{' '}
                    <span style={{ color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem' }}>
                      nomic-embed-text:v1.5
                    </span>{' '}
                    running locally on the Mac Mini via Ollama. Enables semantic similarity search across all kingdom memories.
                  </div>
                )}
              </div>
            );
          })
        }
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>

        {/* Projects — live from Firestore */}
        <div className="card">
          <div className="section-header">
            <h2 className="section-title">🗺️ Kingdom Projects</h2>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.8125rem', padding: '5px 14px' }}
              onClick={openModal}
            >
              + New Project
            </button>
          </div>

          {projectsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 20px' }}>
              <div className="empty-state-icon">🗺️</div>
              <div className="empty-state-title">No projects in the vault yet.</div>
              <div className="empty-state-sub">Run seed script or add a project to Firestore.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projects.map((p) => {
                const status    = STATUS_STYLES[p.status];
                // Pick a color from the first assigned warden, or fallback to purple
                const iconColor = (p.wardens?.[0] && WARDEN_COLORS[p.wardens[0]]) ?? '#7850ff';
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 14px', borderRadius: 10,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      cursor: 'pointer', transition: 'all 150ms',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)';
                      (e.currentTarget as HTMLElement).style.transform    = 'translateX(3px)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                      (e.currentTarget as HTMLElement).style.transform    = 'translateX(0)';
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: `${iconColor}20`, border: `1px solid ${iconColor}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.125rem', flexShrink: 0,
                    }}>
                      🏛️
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.description}
                      </div>
                    </div>
                    <span className={`tag ${status.tagClass}`}>{status.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Activity feed — live from Firestore */}
          <div className="card">
            <div className="section-header">
              <h2 className="section-title">⚡ Activity</h2>
            </div>

            {activityLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 40, borderRadius: 8 }} />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 16px' }}>
                <div className="empty-state-icon">⚡</div>
                <div className="empty-state-title">No activity yet.</div>
                <div className="empty-state-sub">Recent wiki edits, file uploads, and project changes will appear here.</div>
              </div>
            ) : (
              <div className="activity-feed">
                {activity.map((a) => {
                  const color = WARDEN_COLORS[a.warden] ?? 'var(--text-muted)';
                  return (
                    <div key={`${a.type}-${a.id}`} className="activity-item">
                      <div className="activity-dot" style={{ background: color, boxShadow: `0 0 6px ${color}60` }} />
                      <div className="activity-content">
                        <div className="activity-text">
                          <span style={{ color, fontWeight: 600, textTransform: 'capitalize' }}>{a.warden}</span>{' '}
                          {ACTION_VERB[a.action] ?? a.action}{' '}
                          {TYPE_ICON[a.type] ?? ''}{' '}
                          <strong>{a.title}</strong>
                        </div>
                        <div className="activity-time">{timeAgo(a.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick access */}
          <div className="card">
            <h2 className="section-title" style={{ marginBottom: 14 }}>🔍 Quick Access</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Search kingdom knowledge', page: 'wiki'      as Page, icon: '◫' },
                { label: 'Browse warden memories',   page: 'memories'  as Page, icon: '◉' },
                { label: 'Upload a file',             page: 'files'     as Page, icon: '⬡' },
                { label: 'View analytics',            page: 'analytics' as Page, icon: '◈' },
                { label: 'Token & cost monitor',      page: 'tokens'    as Page, icon: '⬡' },
              ].map((item) => (
                <button
                  key={item.label}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', width: '100%', borderRadius: 8 }}
                  onClick={() => onNavigate(item.page)}
                >
                  <span style={{ color: 'var(--purple)', fontWeight: 700 }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Token Usage widget */}
          <div className="card">
            <div className="section-header">
              <h2 className="section-title">💰 Token Usage</h2>
            </div>

            {tokenLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 28, borderRadius: 6 }} />
                ))}
              </div>
            ) : !tokenStats || tokenStats.records.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 16px' }}>
                <div className="empty-state-icon">💰</div>
                <div className="empty-state-title">No usage data yet.</div>
                <div className="empty-state-sub">Token logging activates with MCP</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Total cost */}
                <div style={{
                  padding: '14px 16px', borderRadius: 10,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '1.75rem', fontWeight: 700,
                    color: 'var(--gold)',
                    letterSpacing: '-0.02em',
                  }}>
                    ${tokenStats.totalCost.toFixed(4)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Estimated cost · {tokenStats.records.length} records ·{' '}
                    {((tokenStats.totalInput + tokenStats.totalOutput) / 1000).toFixed(1)}K tokens
                  </div>
                </div>

                {/* Cost by model tier bars */}
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                    By Model
                  </div>
                  {Object.entries(tokenStats.byModel)
                    .sort(([, a], [, b]) => b.cost - a.cost)
                    .slice(0, 5)
                    .map(([model, stats]) => {
                      const pct = tokenStats.totalCost > 0
                        ? (stats.cost / tokenStats.totalCost) * 100
                        : 0;
                      // Color by tier-ish heuristic
                      const barColor = model.includes('flash') ? '#1abc9c'
                        : model.includes('claude') || model.includes('sonnet') ? '#9B59B6'
                        : model.includes('gemini') ? '#3498DB'
                        : 'var(--gold)';
                      return (
                        <div key={model} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 3 }}>
                            <span style={{ color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem' }}>
                              {model}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              ${stats.cost.toFixed(4)}
                            </span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-3, #12101a)', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.max(2, pct)}%`, height: '100%',
                              borderRadius: 2, background: barColor,
                              transition: 'width 0.3s ease',
                            }} />
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Top wardens by token count */}
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Top Wardens
                  </div>
                  {Object.entries(tokenStats.byWarden)
                    .sort(([, a], [, b]) => (b.input + b.output) - (a.input + a.output))
                    .slice(0, 3)
                    .map(([warden, ws]) => {
                      const color = WARDEN_COLORS[warden] ?? 'var(--text-muted)';
                      return (
                        <div key={warden} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '5px 0', borderBottom: '1px solid var(--border)',
                        }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: color, flexShrink: 0,
                            boxShadow: `0 0 6px ${color}60`,
                          }} />
                          <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                            {warden}
                          </span>
                          <span style={{ fontSize: '0.6875rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                            {((ws.input + ws.output) / 1000).toFixed(1)}K
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Embedding Worker Status widget */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: '1rem' }}>🧬</span>
              <h2 className="section-title">Embedding Worker</h2>
              <span style={{
                marginLeft: 'auto',
                width: 8, height: 8, borderRadius: '50%',
                background: embedError ? '#e74c3c' : '#1abc9c',
                boxShadow: embedError ? '0 0 6px #e74c3c80' : '0 0 6px #1abc9c80',
              }} />
            </div>

            {embedError ? (
              <div style={{
                padding: '12px 14px', borderRadius: 8,
                background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)',
                fontSize: '0.8125rem', color: '#e74c3c', lineHeight: 1.5,
              }}>
                Worker offline — embedding will resume when <code style={{ fontSize: '0.75rem' }}>localhost:4002</code> is reachable.
              </div>
            ) : embedStatus ? (
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { label: 'Uptime', value: embedStatus.uptime },
                  { label: 'Embedded', value: String(embedStatus.totalEmbedded) },
                  { label: 'Errors', value: String(embedStatus.totalErrors) },
                ].map((s) => (
                  <div key={s.label} style={{
                    flex: 1, textAlign: 'center',
                    padding: '10px 8px', borderRadius: 8,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                  }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '1rem', fontWeight: 700,
                      color: s.label === 'Errors' && Number(s.value) > 0 ? '#e74c3c' : 'var(--text-primary)',
                    }}>
                      {s.value}
                    </div>
                    <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="skeleton" style={{ height: 52, borderRadius: 8 }} />
            )}
          </div>

          {/* Vault build status */}
          <div className="card card-glow pulse-glow">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: '1.25rem' }}>🏛️</span>
              <h2 className="section-title">Vault Status</h2>
            </div>
            {[
              { label: 'Firebase Project',         done: true  },
              { label: 'Firestore Schema',         done: true  },
              { label: 'Security Rules',           done: true  },
              { label: 'Vector Indexes',           done: true  },
              { label: 'Cloud Functions',          done: true  },
              { label: 'Ingest Worker',            done: true  },
              { label: 'Next.js Console',          done: true  },
              { label: 'Auth + Data Layer',        done: true  },
              { label: 'Bootstrap Ingestion',      done: false },
              { label: 'DNS — vault.ptolemy.live', done: false },
              { label: 'Phase 4 Warden Memory',   done: false },
            ].map((item) => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '5px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '0.875rem', color: item.done ? '#1abc9c' : 'var(--text-muted)' }}>
                  {item.done ? '✓' : '○'}
                </span>
                <span style={{ fontSize: '0.8125rem', color: item.done ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat row builder — isolated so it's easy to extend
// ─────────────────────────────────────────────────────────────────────────────

interface StatRow {
  value: string;
  label: string;
  sub:   string;
  trend: 'up' | null;
  page?: Page | 'expand';
  expandContent?: string;
}

function buildStatRows(stats: KingdomStats | null): StatRow[] {
  return [
    {
      value: renderStat(stats?.totalParticipants),
      label: 'Wardens',
      sub:   '11 AI + Ryan',
      trend: null,
      page:  'memories',
    },
    {
      value: renderStat(stats?.totalProjects),
      label: 'Projects',
      sub:   'In the vault',
      trend: stats?.totalProjects ? 'up' : null,
      page:  'dashboard',
    },
    {
      value: renderStat(stats?.totalWikiArticles),
      label: 'Wiki Articles',
      sub:   'Semantically indexed',
      trend: null,
      page:  'wiki',
    },
    {
      // totalMemories is known-0 until Jewel's denormalized counter is live — render '—'
      value: renderStat(stats?.totalMemories, /* suppressZero */ true),
      label: 'Memories Indexed',
      sub:   'Vault building',
      trend: null,
      page:  'memories',
    },
    {
      value: renderStat(stats?.totalFiles),
      label: 'Files in Vault',
      sub:   `gs://${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'omnia-kingdom-vault-storage'}`,
      trend: null,
      page:  'files',
    },
    {
      value: '768d',
      label: 'Vector Dims',
      sub:   'nomic-embed-text:v1.5',
      trend: null,
      page:  'expand',
      expandContent: '768-dimensional vectors generated by nomic-embed-text:v1.5 running locally on the Mac Mini via Ollama. Enables semantic similarity search across all kingdom memories.',
    },
  ];
}
