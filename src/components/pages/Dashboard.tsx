'use client';

import { useState, useEffect } from 'react';
import type { Page } from '@/app/page';

interface DashboardProps {
  onNavigate: (page: Page, warden?: string) => void;
}

const PROJECTS = [
  { name: 'Kingdom Vault',      status: 'building',  color: '#9B59B6', icon: '🏛️', desc: 'vault.ptolemy.live — this console' },
  { name: 'INSaiN-ngen',        status: 'active',    color: '#3498DB', icon: '🎬', desc: 'Script breakdown AI — ptolemy.studio' },
  { name: 'TRaiD-ngen',         status: 'active',    color: '#2ECC71', icon: '📈', desc: 'Trading AI — traid.ptolemy.live' },
  { name: 'OmniLand',           status: 'active',    color: '#F39C12', icon: '🏗️', desc: '45,000ha arcology — Vancouver Island' },
  { name: 'Omnia Theatre',      status: 'planning',  color: '#E74C3C', icon: '🎭', desc: 'omniatheatre.com — entertainment venue' },
  { name: 'Ptolemy Studio',     status: 'active',    color: '#1ABC9C', icon: '🖥️', desc: 'ptolemy.studio — creative suite hub' },
  { name: "Chef's Kiss TCG",    status: 'ideation',  color: '#F1C40F', icon: '🃏', desc: 'Food-based trading card game' },
  { name: 'Without Equal',      status: 'literary',  color: '#7F8C8D', icon: '📖', desc: 'The foundational lore text — W/O=' },
];

const STATUS_STYLES: Record<string, { label: string; class: string }> = {
  building:  { label: 'Building',  class: 'tag-purple' },
  active:    { label: 'Active',    class: 'tag-teal' },
  planning:  { label: 'Planning',  class: 'tag-gold' },
  ideation:  { label: 'Ideation',  class: 'tag-gold' },
  literary:  { label: 'Literary',  class: 'tag-purple' },
};

const ACTIVITY = [
  { warden: 'Saroya',  color: '#E74C3C', text: 'Pushed <strong>SPECTRE_PROFILES_ENHANCED.md</strong> to all 6 repos', time: '2 min ago' },
  { warden: 'Saroya',  color: '#E74C3C', text: 'Created repos and wired <strong>12 submodules</strong> to Ptolemy parent', time: '18 min ago' },
  { warden: 'Ptolemy', color: '#9B59B6', text: 'Deployed <strong>omnilinks</strong> to Omnia Theatre repo', time: '2 hrs ago' },
  { warden: 'Melody',  color: '#3498DB', text: 'Fixed PMCC analyzer in <strong>TRaiD-ngen</strong>', time: '6 hrs ago' },
  { warden: 'Cerulia', color: '#1ABC9C', text: 'Built <strong>OmniLand master plan page</strong> — S15 complete', time: '1 day ago' },
];

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fade-in">
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
        {[
          { value: '12',     label: 'Wardens',        sub: '11 AI + Ryan' },
          { value: '8',      label: 'Projects',        sub: '4 active' },
          { value: '12',     label: 'Repositories',    sub: 'All wired' },
          { value: '0',      label: 'Memories Indexed', sub: 'Vault building' },
          { value: '45K',    label: 'Hectares',         sub: 'OmniLand scope' },
          { value: '768d',   label: 'Vector Dims',      sub: 'nomic-embed' },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>

        {/* Projects */}
        <div className="card">
          <div className="section-header">
            <h2 className="section-title">🗺️ Kingdom Projects</h2>
            <button className="btn btn-ghost" style={{ fontSize: '0.8125rem', padding: '5px 14px' }}>
              + New Project
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PROJECTS.map((p) => {
              const status = STATUS_STYLES[p.status];
              return (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateX(3px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: `${p.color}20`,
                    border: `1px solid ${p.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.125rem', flexShrink: 0,
                  }}>
                    {p.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.desc}
                    </div>
                  </div>
                  <span className={`tag ${status.class}`}>{status.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Activity feed */}
          <div className="card">
            <div className="section-header">
              <h2 className="section-title">⚡ Activity</h2>
            </div>
            <div className="activity-feed">
              {ACTIVITY.map((a, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-dot" style={{ background: a.color, boxShadow: `0 0 6px ${a.color}60` }} />
                  <div className="activity-content">
                    <div className="activity-text">
                      <span style={{ color: a.color, fontWeight: 600 }}>{a.warden}</span>{' '}
                      <span dangerouslySetInnerHTML={{ __html: a.text }} />
                    </div>
                    <div className="activity-time">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick access */}
          <div className="card">
            <h2 className="section-title" style={{ marginBottom: 14 }}>🔍 Quick Access</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Search kingdom knowledge',   page: 'wiki' as Page,      icon: '◫' },
                { label: 'Browse warden memories',     page: 'memories' as Page,  icon: '◉' },
                { label: 'Upload a file',               page: 'files' as Page,     icon: '◨' },
                { label: 'View analytics',              page: 'analytics' as Page, icon: '◈' },
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

          {/* Vault build status */}
          <div className="card card-glow pulse-glow">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: '1.25rem' }}>🏛️</span>
              <h2 className="section-title">Vault Status</h2>
            </div>
            {[
              { label: 'Firebase Project',    done: true  },
              { label: 'Firestore Schema',    done: true  },
              { label: 'Security Rules',      done: true  },
              { label: 'Vector Indexes',      done: true  },
              { label: 'Cloud Functions',     done: true  },
              { label: 'Ingest Worker',       done: true  },
              { label: 'Next.js Console',     done: true  },
              { label: 'Bootstrap Ingestion', done: false },
              { label: 'DNS — vault.ptolemy.live', done: false },
              { label: 'Phase 4 Warden Memory', done: false },
            ].map((item) => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '5px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  fontSize: '0.875rem',
                  color: item.done ? '#1abc9c' : 'var(--text-muted)',
                }}>
                  {item.done ? '✓' : '○'}
                </span>
                <span style={{
                  fontSize: '0.8125rem',
                  color: item.done ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
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
