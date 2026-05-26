'use client';

const WARDEN_COLORS: Record<string, string> = {
  ryan: '#FFD700', ptolemy: '#9B59B6', saroya: '#E74C3C',
  melody: '#3498DB', cerulia: '#1ABC9C', affin: '#F39C12',
  jewel: '#2ECC71', krishe: '#95A5A6', astyr: '#C0392B',
  hurrian: '#2980B9', jovin: '#F1C40F', herus: '#7F8C8D',
};

const WARDENS = Object.keys(WARDEN_COLORS);

export default function Analytics() {
  return (
    <div className="fade-in">
      <h1 className="page-title">📈 Analytics</h1>
      <p className="page-subtitle">Kingdom-wide intelligence — powered by BigQuery. Warden activity, memory growth, token usage, and more.</p>

      {/* Phase notice */}
      <div style={{
        background: 'rgba(120,80,255,0.08)',
        border: '1px solid rgba(120,80,255,0.25)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 28,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <span style={{ fontSize: '1.25rem' }}>◈</span>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            Analytics coming in Phase 2
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            BigQuery streaming pipeline activates after bootstrap ingestion is complete.
            The ingest worker writes JSONL logs nightly to GCS, which sync into BigQuery.
            Token drain alerts, interaction volume, memory accumulation curves — all here.
          </div>
        </div>
      </div>

      {/* Preview: warden participation bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 20 }}>Warden Council — Memory Allocation Preview</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {WARDENS.map((w) => {
            const pct = Math.floor(Math.random() * 60) + 5; // placeholder
            return (
              <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{
                  width: 70, fontSize: '0.8125rem', fontWeight: 600,
                  color: WARDEN_COLORS[w], textTransform: 'capitalize', flexShrink: 0,
                }}>
                  {w}
                </span>
                <div style={{
                  flex: 1, height: 8, borderRadius: 4,
                  background: 'var(--surface-3)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 4,
                    background: `linear-gradient(90deg, ${WARDEN_COLORS[w]}aa, ${WARDEN_COLORS[w]})`,
                    transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 36, textAlign: 'right', flexShrink: 0 }}>
                  —
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          * Placeholder — live data pending bootstrap ingestion
        </div>
      </div>

      {/* Pipeline overview */}
      <div className="card">
        <h2 className="section-title" style={{ marginBottom: 16 }}>Analytics Pipeline</h2>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.8125rem', lineHeight: 2,
          color: 'var(--text-secondary)',
          padding: '12px 16px',
          background: 'var(--surface-2)',
          borderRadius: 8,
        }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
            {`// Phase 1 — Local pipeline`}
          </div>
          <div>Firestore Write</div>
          <div style={{ paddingLeft: 20, color: 'var(--gold)' }}>└─► ingest-worker.js (Mac Mini)</div>
          <div style={{ paddingLeft: 40, color: 'var(--teal)' }}>└─► ./logs/embeddings.jsonl</div>
          <div style={{ paddingLeft: 60 }}>└─► GCS /exports/ (nightly)</div>
          <div style={{ paddingLeft: 80, color: 'var(--purple)' }}>└─► BigQuery (streaming)</div>
          <div style={{ paddingLeft: 100 }}>└─► Analytics Dashboard ◈</div>
        </div>
      </div>
    </div>
  );
}
