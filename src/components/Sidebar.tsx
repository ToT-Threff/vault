'use client';

import { useState, useEffect } from 'react';
import type { Page } from '@/app/page';
import { WARDENS } from '@/lib/constants';
import { checkOllamaHealth } from '@/lib/embedding';



const NAV_ITEMS = [
  { id: 'dashboard', label: 'Kingdom Dashboard', icon: '▦' },
  { id: 'wiki',      label: 'Archival Wiki',      icon: '◫' },
  { id: 'memories',  label: 'Memory Browser',     icon: '◉' },
  { id: 'files',     label: 'File Vault',          icon: '⬡' },
  { id: 'analytics', label: 'Analytics',           icon: '◈' },
  { id: 'tokens',    label: 'Token Monitor',       icon: '⬡' },
  { id: 'benchmark',  label: 'Benchmarks',         icon: '⚡' },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page, warden?: string) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [workerStatus, setWorkerStatus] = useState<{
    status: string; uptime_seconds: number; total_embedded: number; total_errors: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAll() {
      // Check Ollama
      const healthy = await checkOllamaHealth();
      if (!cancelled) setOllamaOnline(healthy);

      // Check embedding worker
      try {
        const resp = await fetch('http://localhost:4002', { signal: AbortSignal.timeout(3000) });
        if (resp.ok && !cancelled) {
          setWorkerStatus(await resp.json());
        } else if (!cancelled) {
          setWorkerStatus(null);
        }
      } catch {
        if (!cancelled) setWorkerStatus(null);
      }
    }

    checkAll();
    const interval = setInterval(checkAll, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const ollamaColor = ollamaOnline === null ? '#95a5a6' : ollamaOnline ? '#1abc9c' : '#e74c3c';
  const ollamaLabel = ollamaOnline === null ? 'Checking...' : ollamaOnline ? 'Ollama Online' : 'Ollama Offline';
  const workerColor = workerStatus ? '#1abc9c' : '#e74c3c';
  const workerLabel = workerStatus ? 'Embed Worker Online' : 'Embed Worker Offline';

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <aside className="vault-sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">V</div>
        <div className="sidebar-logo-text">
          <div className="sidebar-logo-title">Kingdom Vault</div>
          <div className="sidebar-logo-sub">vault.ptolemy.live</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {/* Main nav */}
        <div className="sidebar-section-label">Navigation</div>
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id as Page)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigate(item.id as Page)}
          >
            <span style={{ fontSize: '14px', width: 18, textAlign: 'center', flexShrink: 0 }}>
              {item.icon}
            </span>
            {item.label}
          </div>
        ))}

        {/* Warden list */}
        <div className="sidebar-section-label" style={{ marginTop: 16 }}>
          SPECTRE Council
        </div>
        <div className="warden-list">
          {WARDENS.map((w) => (
            <div
              key={w.id}
              className="warden-item"
              onClick={() => onNavigate('memories', w.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onNavigate('memories', w.id)}
              title={w.title}
            >
              <div className="warden-dot" style={{ background: w.color }} />
              <span className="warden-name">{w.name}</span>
              <span style={{ fontSize: '11px' }}>{w.emoji}</span>
            </div>
          ))}
        </div>

        {/* Kingdom system status */}
        <div style={{ marginTop: 'auto', padding: '16px 0 8px' }}>
          <div className="sidebar-section-label">System</div>

          {/* Ollama status */}
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: `${ollamaColor}15`, border: `1px solid ${ollamaColor}33`,
            marginTop: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: ollamaColor, display: 'inline-block',
                boxShadow: `0 0 6px ${ollamaColor}`,
              }} />
              <span style={{ fontSize: '0.75rem', color: ollamaColor, fontWeight: 600 }}>{ollamaLabel}</span>
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              nomic-embed-text:v1.5 · 768d
            </div>
          </div>

          {/* Embedding worker status */}
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: `${workerColor}15`, border: `1px solid ${workerColor}33`,
            marginTop: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: workerColor, display: 'inline-block',
                boxShadow: `0 0 6px ${workerColor}`,
              }} />
              <span style={{ fontSize: '0.75rem', color: workerColor, fontWeight: 600 }}>{workerLabel}</span>
            </div>
            {workerStatus && (
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                <span>⏱ {formatUptime(workerStatus.uptime_seconds)}</span>
                <span>✓ {workerStatus.total_embedded}</span>
                {workerStatus.total_errors > 0 && (
                  <span style={{ color: '#e74c3c' }}>✗ {workerStatus.total_errors}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </aside>
  );
}

