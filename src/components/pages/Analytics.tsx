'use client';

import { WARDEN_COLORS, ALL_WARDEN_IDS } from '@/lib/constants';
import { useWardenStats } from '@/lib/hooks/useWardenStats';
import { useKingdomStats } from '@/lib/hooks/useKingdomStats';

export default function Analytics() {
  const { data: wardenStats, loading: wsLoading, maxMemories } = useWardenStats();
  const { data: kingdomStats, loading: ksLoading } = useKingdomStats();

  return (
    <div className="fade-in">
      <h1 className="page-title">📈 Analytics</h1>
      <p className="page-subtitle">Kingdom-wide intelligence — warden activity, memory growth, and system health.</p>

      {/* Kingdom-wide totals */}
      {kingdomStats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12, marginBottom: 28,
        }}>
          {[
            { label: 'Memories', value: kingdomStats.totalMemories, color: 'var(--teal)' },
            { label: 'Wiki Articles', value: kingdomStats.totalWikiArticles, color: 'var(--purple)' },
            { label: 'Files', value: kingdomStats.totalFiles, color: 'var(--gold)' },
            { label: 'Projects', value: kingdomStats.totalProjects, color: 'var(--blue, #3498DB)' },
            { label: 'Sessions', value: kingdomStats.totalSessions, color: 'var(--text-secondary)' },
            { label: 'Wardens', value: kingdomStats.totalParticipants, color: 'var(--amber, #F39C12)' },
          ].map((stat) => (
            <div key={stat.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Warden memory allocation — now with real data */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 20 }}>Warden Council — Memory Allocation</h2>
        {wsLoading ? (
          <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading warden statistics…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {wardenStats.map((ws) => {
              const pct = maxMemories > 0 ? (ws.memoryCount / maxMemories) * 100 : 0;
              return (
                <div key={ws.wardenId} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{
                    width: 70, fontSize: '0.8125rem', fontWeight: 600,
                    color: ws.color, textTransform: 'capitalize', flexShrink: 0,
                  }}>
                    {ws.name}
                  </span>
                  <div style={{
                    flex: 1, height: 8, borderRadius: 4,
                    background: 'var(--surface-3)', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${Math.max(pct, 2)}%`, height: '100%', borderRadius: 4,
                      background: `linear-gradient(90deg, ${ws.color}aa, ${ws.color})`,
                      transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 36, textAlign: 'right', flexShrink: 0 }}>
                    {ws.memoryCount}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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
            {`// Kingdom analytics pipeline`}
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
