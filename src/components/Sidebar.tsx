'use client';

import type { Page } from '@/app/page';

const WARDENS = [
  { id: 'ryan',    name: 'Ryan',    title: 'The Emperor',        emoji: '👑', color: '#FFD700' },
  { id: 'ptolemy', name: 'Ptolemy', title: 'Autonomic Shield',   emoji: '🌌', color: '#9B59B6' },
  { id: 'saroya',  name: 'Saroya',  title: 'Warden of the Word', emoji: '📖', color: '#E74C3C' },
  { id: 'melody',  name: 'Melody',  title: 'Warden of the Song', emoji: '🎵', color: '#3498DB' },
  { id: 'cerulia', name: 'Cerulia', title: 'Warden of the Arcane',emoji: '🔮', color: '#1ABC9C' },
  { id: 'affin',   name: 'Affin',   title: 'Warden of the Tail', emoji: '🛡',  color: '#F39C12' },
  { id: 'jewel',   name: 'Jewel',   title: 'Diamond Alchemist',  emoji: '💎', color: '#2ECC71' },
  { id: 'krishe',  name: 'Krishe',  title: 'Warden of the Road', emoji: '⚙️', color: '#95A5A6' },
  { id: 'astyr',   name: 'Astyr',   title: 'Warden of the Edge', emoji: '🗡️', color: '#C0392B' },
  { id: 'hurrian', name: 'Hurrian', title: 'Warden of the Deep', emoji: '🌊', color: '#2980B9' },
  { id: 'jovin',   name: 'Jovin',   title: 'Warden of the Heir', emoji: '☀️', color: '#F1C40F' },
  { id: 'herus',   name: 'Herus',   title: 'Warden of the Step', emoji: '⏶',  color: '#7F8C8D' },
];

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Kingdom Dashboard', icon: '▦' },
  { id: 'wiki',      label: 'Archival Wiki',      icon: '◫' },
  { id: 'memories',  label: 'Memory Browser',     icon: '◉' },
  { id: 'files',     label: 'File Vault',          icon: '⬡' },
  { id: 'analytics', label: 'Analytics',           icon: '◈' },
  { id: 'tokens',    label: 'Token Monitor',       icon: '⬡' },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page, warden?: string) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
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

        {/* Kingdom status */}
        <div style={{ marginTop: 'auto', padding: '16px 0 8px' }}>
          <div className="sidebar-section-label">System</div>
          <div style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(26,188,156,0.1)',
            border: '1px solid rgba(26,188,156,0.2)',
            marginTop: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#1abc9c', display: 'inline-block',
                boxShadow: '0 0 6px #1abc9c',
              }} />
              <span style={{ fontSize: '0.75rem', color: '#1abc9c', fontWeight: 600 }}>Ollama Online</span>
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              nomic-embed-text:v1.5 · 768d
            </div>
          </div>
        </div>
      </nav>
    </aside>
  );
}
