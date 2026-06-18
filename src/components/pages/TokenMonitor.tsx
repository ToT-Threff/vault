'use client';

/**
 * TokenMonitor.tsx — Kingdom Token Usage Dashboard
 * Reads from Firestore `token_usage` collection.
 * Shows spend by source, workspace, model, and per-run log.
 */

import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageRecord {
  id: string;
  timestamp: string;
  source: 'api' | 'local' | 'antigravity';
  workspace: string;
  model: string;
  session_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  trigger: string;
  status: string;
}

interface AuditReport {
  audit_date: string;
  files_scanned: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: string;
  summary: string;
  findings: Array<{
    id: string;
    severity: string;
    type: string;
    file: string;
    description: string;
    action_type: string;
    assigned_to: string;
  }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────
// Match token_logger.py: KINGDOM_DAILY_BUDGET_USD=50, KINGDOM_MONTHLY_BUDGET_USD=500
const MONTHLY_BUDGET = 500.00;
const DAILY_BUDGET   = 50.00;

const SOURCE_COLORS: Record<string, string> = {
  api:          '#E74C3C',
  local:        '#3498DB',
  antigravity:  '#9B59B6',
};

const SOURCE_LABELS: Record<string, string> = {
  api:          'External API (Opus 4.8)',
  local:        'Local Ollama',
  antigravity:  'Antigravity AGY',
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#E74C3C',
  HIGH:     '#E67E22',
  MEDIUM:   '#F1C40F',
  LOW:      '#3498DB',
  INFO:     '#95A5A6',
};

const WORKSPACE_COLORS = [
  '#9B59B6', '#3498DB', '#1ABC9C', '#E74C3C',
  '#F39C12', '#2ECC71', '#E91E63', '#00BCD4',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18"
      style={{ animation: 'spin 0.8s linear infinite', display: 'block' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor"
        strokeWidth="2" strokeDasharray="28" strokeDashoffset="10"
        strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function GaugeMeter({ value, max, label, color }: {
  value: number; max: number; label: string; color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const danger = pct > 80;
  const barColor = danger ? '#E74C3C' : color;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {label}
        </span>
        <span style={{ fontSize: '0.8125rem', fontFamily: "'JetBrains Mono', monospace", color: danger ? '#E74C3C' : 'var(--text-primary)' }}>
          {fmt$(value)} / {fmt$(max)}
        </span>
      </div>
      <div style={{
        height: 6, borderRadius: 99,
        background: 'var(--surface-3, #12101a)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barColor,
          borderRadius: 99,
          boxShadow: `0 0 8px ${barColor}60`,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
        {pct.toFixed(1)}% of budget
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TokenMonitor() {
  const [records, setRecords]       = useState<UsageRecord[]>([]);
  const [audits, setAudits]         = useState<AuditReport[]>([]);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab]   = useState<'overview' | 'runs' | 'audits'>('overview');
  const unsubRefs = useRef<Array<() => void>>([]);

  useEffect(() => {
    // ── Real-time listener: token_usage ──────────────────────────────────────
    // onSnapshot fires immediately with current data, then on every write.
    // Zero cost per update — a single persistent WebSocket, not polling.
    const usageQ = query(
      collection(db, 'token_usage'),
      orderBy('timestamp', 'desc'),
      limit(200),
    );

    const unsubUsage = onSnapshot(usageQ, (snap) => {
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as UsageRecord));
      setRecords(recs);
      setLastUpdated(new Date());
      setLoading(false);
    }, (err) => {
      console.error('TokenMonitor usage stream error:', err);
      setLoading(false);
    });

    // ── Real-time listener: audits ────────────────────────────────────────────
    const auditsQ = query(
      collection(db, 'audits'),
      orderBy('audit_date', 'desc'),
      limit(14),
    );

    const unsubAudits = onSnapshot(auditsQ, (snap) => {
      setAudits(snap.docs.map(d => d.data() as AuditReport));
      setLastUpdated(new Date());
    }, (err) => {
      console.error('TokenMonitor audits stream error:', err);
    });

    // Store unsubscribe refs for cleanup
    unsubRefs.current = [unsubUsage, unsubAudits];

    return () => {
      unsubRefs.current.forEach(u => u());
    };
  }, []);

  // ── Derived Stats ───────────────────────────────────────────────────────────

  const today   = currentDate();
  const month   = currentMonth();

  const todayRecs  = records.filter(r => r.timestamp?.slice(0, 10) === today);
  const monthRecs  = records.filter(r => r.timestamp?.slice(0, 7) === month);

  const todayApiSpend  = todayRecs.filter(r => r.source === 'api').reduce((s, r) => s + (r.cost_usd || 0), 0);
  const monthApiSpend  = monthRecs.filter(r => r.source === 'api').reduce((s, r) => s + (r.cost_usd || 0), 0);

  const todayTotalIn   = todayRecs.reduce((s, r) => s + (r.input_tokens || 0), 0);
  const todayTotalOut  = todayRecs.reduce((s, r) => s + (r.output_tokens || 0), 0);

  // By source (this month)
  const bySource = (['api', 'local', 'antigravity'] as const).map(src => ({
    src,
    cost:   monthRecs.filter(r => r.source === src).reduce((s, r) => s + (r.cost_usd || 0), 0),
    tokens: monthRecs.filter(r => r.source === src).reduce((s, r) => s + (r.total_tokens || 0), 0),
    runs:   monthRecs.filter(r => r.source === src).length,
  }));

  // By workspace (this month, API only)
  const workspaceMap: Record<string, { cost: number; tokens: number; runs: number }> = {};
  monthRecs.filter(r => r.source === 'api').forEach(r => {
    const ws = r.workspace || 'unknown';
    if (!workspaceMap[ws]) workspaceMap[ws] = { cost: 0, tokens: 0, runs: 0 };
    workspaceMap[ws].cost   += r.cost_usd || 0;
    workspaceMap[ws].tokens += r.total_tokens || 0;
    workspaceMap[ws].runs   += 1;
  });
  const byWorkspace = Object.entries(workspaceMap)
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 8);

  // By model (this month)
  const modelMap: Record<string, { cost: number; tokens: number }> = {};
  monthRecs.forEach(r => {
    const m = r.model || 'unknown';
    if (!modelMap[m]) modelMap[m] = { cost: 0, tokens: 0 };
    modelMap[m].cost   += r.cost_usd || 0;
    modelMap[m].tokens += r.total_tokens || 0;
  });
  const byModel = Object.entries(modelMap).sort((a, b) => b[1].cost - a[1].cost);

  // ── Render ──────────────────────────────────────────────────────────────────

  const tabs = [
    { id: 'overview' as const, label: '📊 Overview' },
    { id: 'runs'     as const, label: '📋 Run Log' },
    { id: 'audits'   as const, label: '🔍 Audit Reports' },
  ];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Token Monitor</h1>
            <p className="page-subtitle">AI usage tracking across all Kingdom workspaces.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {/* Live indicator */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.6875rem', color: 'var(--text-muted)',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#1ABC9C',
                boxShadow: '0 0 6px #1ABC9C',
                animation: 'pulse 2s ease-in-out infinite',
                display: 'inline-block',
              }} />
              LIVE
            </span>
            {lastUpdated && (
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', padding: 40 }}>
          <Spinner /> Loading usage data…
        </div>
      ) : (
        <>
          {/* Budget Gauges */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 className="section-title" style={{ marginBottom: 18 }}>💰 Budget Status</h2>
            <GaugeMeter value={todayApiSpend}  max={DAILY_BUDGET}   label="Today's API Spend"   color="#E74C3C" />
            <GaugeMeter value={monthApiSpend}  max={MONTHLY_BUDGET} label="Month-to-Date (API)" color="#9B59B6" />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 8 }}>
              {[
                { label: 'Today tokens in',  value: fmtK(todayTotalIn),  color: '#3498DB' },
                { label: 'Today tokens out', value: fmtK(todayTotalOut), color: '#1ABC9C' },
                { label: 'Today API cost',   value: fmt$(todayApiSpend), color: '#E74C3C' },
              ].map(item => (
                <div key={item.label} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: item.color }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 16px', borderRadius: 8,
                  border: `1.5px solid ${activeTab === tab.id ? 'var(--border-bright)' : 'var(--border)'}`,
                  background: activeTab === tab.id ? 'var(--surface-3, #12101a)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '0.8125rem', fontWeight: activeTab === tab.id ? 600 : 400,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Overview Tab ──────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* By Source */}
              <div className="card">
                <h2 className="section-title" style={{ marginBottom: 16 }}>By Source — This Month</h2>
                {bySource.map(({ src, cost, tokens, runs }) => (
                  <div key={src} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: SOURCE_COLORS[src],
                      boxShadow: `0 0 6px ${SOURCE_COLORS[src]}60`,
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {SOURCE_LABELS[src]}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {fmtK(tokens)} tokens · {runs} runs
                      </div>
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.875rem',
                      color: cost > 0 ? '#E74C3C' : 'var(--text-muted)',
                      fontWeight: 600,
                    }}>
                      {cost > 0 ? fmt$(cost) : 'free'}
                    </div>
                  </div>
                ))}
              </div>

              {/* By Workspace */}
              <div className="card">
                <h2 className="section-title" style={{ marginBottom: 16 }}>By Workspace — API Cost</h2>
                {byWorkspace.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '20px 0', textAlign: 'center' }}>
                    No API usage recorded yet.
                  </div>
                ) : byWorkspace.map(([ws, data], i) => (
                  <div key={ws} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                      background: WORKSPACE_COLORS[i % WORKSPACE_COLORS.length],
                    }} />
                    <div style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {ws}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                      {fmtK(data.tokens)} tok
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.8125rem',
                      color: '#E74C3C', fontWeight: 600, minWidth: 60, textAlign: 'right',
                    }}>
                      {fmt$(data.cost)}
                    </div>
                  </div>
                ))}
              </div>

              {/* By Model */}
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <h2 className="section-title" style={{ marginBottom: 16 }}>By Model — This Month</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                  {byModel.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No model data yet.</div>
                  ) : byModel.map(([model, data]) => (
                    <div key={model} style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.75rem', color: 'var(--text-primary)',
                        fontWeight: 600, marginBottom: 6,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {model}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          {fmtK(data.tokens)} tokens
                        </span>
                        <span style={{
                          fontSize: '0.8125rem',
                          fontFamily: "'JetBrains Mono', monospace",
                          color: data.cost > 0 ? '#E74C3C' : '#3498DB',
                          fontWeight: 700,
                        }}>
                          {data.cost > 0 ? fmt$(data.cost) : 'local'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Run Log Tab ───────────────────────────────────────────────────── */}
          {activeTab === 'runs' && (
            <div className="card">
              <h2 className="section-title" style={{ marginBottom: 16 }}>Recent Runs (last 200)</h2>
              {records.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '20px 0', textAlign: 'center' }}>
                  No usage records yet. Runs will appear here after the first nightly audit.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Timestamp', 'Source', 'Workspace', 'Model', 'Tokens In', 'Tokens Out', 'Cost', 'Trigger', 'Status'].map(h => (
                          <th key={h} style={{
                            padding: '8px 10px', textAlign: 'left',
                            fontSize: '0.6875rem', letterSpacing: '0.06em',
                            textTransform: 'uppercase', color: 'var(--text-muted)',
                            fontWeight: 600, whiteSpace: 'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {records.slice(0, 50).map((r, i) => (
                        <tr key={r.id} style={{
                          borderBottom: '1px solid var(--border)',
                          background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent',
                        }}>
                          <td style={{ padding: '7px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {r.timestamp?.slice(0, 19).replace('T', ' ')}
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                              fontSize: '0.6875rem', fontWeight: 600,
                              background: `${SOURCE_COLORS[r.source]}20`,
                              color: SOURCE_COLORS[r.source] || 'var(--text-muted)',
                              border: `1px solid ${SOURCE_COLORS[r.source]}40`,
                            }}>
                              {r.source}
                            </span>
                          </td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.workspace}
                          </td>
                          <td style={{ padding: '7px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            {r.model}
                          </td>
                          <td style={{ padding: '7px 10px', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', color: '#3498DB' }}>
                            {fmtK(r.input_tokens || 0)}
                          </td>
                          <td style={{ padding: '7px 10px', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', color: '#1ABC9C' }}>
                            {fmtK(r.output_tokens || 0)}
                          </td>
                          <td style={{ padding: '7px 10px', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', fontWeight: 700, color: (r.cost_usd || 0) > 0 ? '#E74C3C' : 'var(--text-muted)' }}>
                            {(r.cost_usd || 0) > 0 ? fmt$(r.cost_usd) : '—'}
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            {r.trigger}
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{
                              fontSize: '0.6875rem', fontWeight: 600,
                              color: r.status === 'complete' ? '#1ABC9C' : r.status === 'failed' ? '#E74C3C' : 'var(--text-muted)',
                            }}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Audit Reports Tab ─────────────────────────────────────────────── */}
          {activeTab === 'audits' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {audits.length === 0 ? (
                <div className="card" style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '40px 20px', textAlign: 'center' }}>
                  No audit reports yet. The first report will appear after tonight's nightly run.
                </div>
              ) : audits.map(audit => {
                const critical = audit.findings?.filter(f => f.severity === 'CRITICAL') ?? [];
                const high     = audit.findings?.filter(f => f.severity === 'HIGH') ?? [];
                const autoFix  = audit.findings?.filter(f => f.action_type === 'AUTO_FIXABLE') ?? [];

                return (
                  <div key={audit.audit_date} className="card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <div style={{
                          fontFamily: "'Space Grotesk', sans-serif",
                          fontSize: '1rem', fontWeight: 700,
                          color: 'var(--text-primary)', marginBottom: 4,
                        }}>
                          🔍 Audit — {audit.audit_date}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {audit.summary}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: '1rem', fontWeight: 700,
                          color: (audit.cost_usd || 0) > 5 ? '#E74C3C' : '#1ABC9C',
                        }}>
                          {fmt$(audit.cost_usd || 0)}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {fmtK(audit.input_tokens || 0)} in · {fmtK(audit.output_tokens || 0)} out
                        </div>
                      </div>
                    </div>

                    {/* Summary chips */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: audit.findings?.length ? 12 : 0 }}>
                      {[
                        { label: `${audit.files_scanned} files`, color: '#9B59B6' },
                        { label: `${audit.findings?.length ?? 0} findings`, color: 'var(--text-muted)' },
                        ...(critical.length ? [{ label: `${critical.length} CRITICAL`, color: '#E74C3C' }] : []),
                        ...(high.length     ? [{ label: `${high.length} HIGH`,     color: '#E67E22' }] : []),
                        ...(autoFix.length  ? [{ label: `${autoFix.length} auto-fixable`, color: '#3498DB' }] : []),
                      ].map(chip => (
                        <span key={chip.label} style={{
                          padding: '2px 10px', borderRadius: 99,
                          fontSize: '0.6875rem', fontWeight: 600,
                          background: `${chip.color}20`,
                          color: chip.color,
                          border: `1px solid ${chip.color}40`,
                        }}>
                          {chip.label}
                        </span>
                      ))}
                    </div>

                    {/* Top findings */}
                    {(critical.concat(high)).slice(0, 3).map(f => (
                      <div key={f.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '8px 10px', borderRadius: 8, marginBottom: 6,
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                      }}>
                        <span style={{
                          fontSize: '0.6875rem', fontWeight: 700,
                          color: SEVERITY_COLORS[f.severity] || 'var(--text-muted)',
                          flexShrink: 0, paddingTop: 1,
                        }}>
                          [{f.severity}]
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', marginBottom: 2 }}>
                            {f.file}
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {f.description}
                          </div>
                        </div>
                        <span style={{
                          fontSize: '0.6875rem', fontWeight: 600, flexShrink: 0,
                          color: f.action_type === 'AUTO_FIXABLE' ? '#3498DB' : 'var(--text-muted)',
                        }}>
                          {f.action_type === 'AUTO_FIXABLE' ? '⚡ auto' : f.assigned_to}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
