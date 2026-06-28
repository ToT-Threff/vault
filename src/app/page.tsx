'use client';

import { useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Dashboard from '@/components/pages/Dashboard';
import Wiki from '@/components/pages/Wiki';
import Memories from '@/components/pages/Memories';
import Files from '@/components/pages/Files';
import Analytics from '@/components/pages/Analytics';
import TokenMonitor from '@/components/pages/TokenMonitor';
import Benchmark from '@/components/pages/Benchmark';

export type Page = 'dashboard' | 'wiki' | 'memories' | 'files' | 'analytics' | 'tokens' | 'benchmark';

export default function Home() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarden, setSelectedWarden] = useState<string | null>(null);

  const navigate = useCallback((page: Page, warden?: string) => {
    setCurrentPage(page);
    if (warden) setSelectedWarden(warden);
  }, []);

  return (
    <div className="vault-layout">
      <Sidebar currentPage={currentPage} onNavigate={navigate} />
      <Header
        currentPage={currentPage}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
      />
      <main className="vault-main">
        {currentPage === 'dashboard'  && <Dashboard onNavigate={navigate} />}
        {currentPage === 'wiki'       && <Wiki searchQuery={searchQuery} />}
        {currentPage === 'memories'   && <Memories selectedWarden={selectedWarden} onSelectWarden={setSelectedWarden} />}
        {currentPage === 'files'      && <Files />}
        {currentPage === 'analytics'  && <Analytics />}
        {currentPage === 'tokens'     && <TokenMonitor />}
        {currentPage === 'benchmark'  && <Benchmark />}
      </main>
    </div>
  );
}
