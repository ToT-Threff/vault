'use client';

import type { Page } from '@/app/page';

// TODO: import { useAuth } from '@/lib/auth-context' — wire when Melody ships auth
// TODO: import { useVaultStats } from '@/lib/hooks/useVaultStats' — for live search hint

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
  // TODO: const { user, signOut } = useAuth();
  // Placeholder until Melody's auth context is live:
  const userEmail = 'ryan@omniatheatre.com'; // TODO: replace with user?.email

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
        {/* TODO: wire to useAuth() — replace static pill with real user + sign-out */}
        <div
          className="header-user"
          role="button"
          tabIndex={0}
          title="Signed in — click to sign out"
          // onClick={signOut}  ← uncomment when Melody ships auth
        >
          <span className="header-user-dot" />
          {userEmail}
        </div>
      </div>
    </header>
  );
}

