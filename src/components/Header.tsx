'use client';

import type { Page } from '@/app/page';

const PAGE_LABELS: Record<Page, string> = {
  dashboard:  'Kingdom Dashboard',
  wiki:       'Archival Wiki',
  memories:   'Memory Browser',
  files:      'File Vault',
  analytics:  'Analytics',
};

interface HeaderProps {
  currentPage: Page;
  searchQuery: string;
  onSearch: (q: string) => void;
}

export default function Header({ currentPage, searchQuery, onSearch }: HeaderProps) {
  return (
    <header className="vault-header">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ptolemy Kingdom</span>
        <span style={{ color: 'var(--border-bright)' }}>›</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {PAGE_LABELS[currentPage]}
        </span>
      </div>

      {/* Search */}
      <div className="header-search">
        <svg className="header-search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          className="header-search-input"
          placeholder="Search the kingdom semantically…"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          id="vault-global-search"
          autoComplete="off"
        />
      </div>

      {/* Actions */}
      <div className="header-actions">
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '100px',
          padding: '4px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1abc9c', display: 'inline-block' }} />
          ryan@omniatheatre.com
        </div>
      </div>
    </header>
  );
}
