'use client';

import type { Page } from '@/app/page';
import { useAuth } from '@/lib/auth-context';

const PAGE_LABELS: Record<Page, string> = {
  dashboard:  'Dashboard',
  wiki:       'Wiki',
  memories:   'Memories',
  files:      'Files',
  analytics:  'Analytics',
  tokens:     'Token Monitor',
  benchmark:  'Benchmarks',
};

interface HeaderProps {
  currentPage: Page;
  searchQuery: string;
  onSearch:    (q: string) => void;
}

export default function Header({ currentPage, searchQuery, onSearch }: HeaderProps) {
  const { user, signOut } = useAuth();

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
        <div
          className="header-user"
          role="button"
          tabIndex={0}
          title="Click to sign out"
          onClick={signOut}
          onKeyDown={(e) => e.key === 'Enter' && signOut()}
        >
          <span className="header-user-dot" />
          {user?.displayName || user?.email || '—'}
        </div>
      </div>
    </header>
  );
}
