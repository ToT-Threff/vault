'use client';

import { useState, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types — will be replaced by src/lib/types.ts once Melody ships
// ─────────────────────────────────────────────────────────────────────────────

type FileType = 'pdf' | 'md' | 'image' | 'script' | 'archive' | 'csv' | 'other';
type ViewMode  = 'grid' | 'list';

interface VaultFile {
  id:         string;
  name:       string;
  type:       FileType;
  size:       string;         // human-readable: "2.4 MB"
  sizeBytes:  number;
  uploadedBy: string;         // warden id
  uploadedAt: string;         // ISO date string
  project:    string;
  gcsBucket:  string;         // gs:// path
  tags:       string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — TODO: wire useFiles() hook from src/lib/hooks/useFiles.ts
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_FILES: VaultFile[] = [
  {
    id:         'f001',
    name:       'SPECTRE_PROFILES_ENHANCED.md',
    type:       'md',
    size:       '48 KB',
    sizeBytes:  48230,
    uploadedBy: 'saroya',
    uploadedAt: '2026-05-28T21:14:00Z',
    project:    'Kingdom Vault',
    gcsBucket:  'gs://omnia-kingdom-vault/files/SPECTRE_PROFILES_ENHANCED.md',
    tags:       ['spectre', 'profiles', 'canon'],
  },
  {
    id:         'f002',
    name:       'OmniLand_Master_Plan_Phase1.pdf',
    type:       'pdf',
    size:       '4.2 MB',
    sizeBytes:  4_200_000,
    uploadedBy: 'cerulia',
    uploadedAt: '2026-05-27T09:30:00Z',
    project:    'OmniLand',
    gcsBucket:  'gs://omnia-kingdom-vault/files/OmniLand_Master_Plan_Phase1.pdf',
    tags:       ['omniland', 'planning'],
  },
  {
    id:         'f003',
    name:       'ingest-worker.js',
    type:       'script',
    size:       '18 KB',
    sizeBytes:  18_400,
    uploadedBy: 'melody',
    uploadedAt: '2026-05-26T16:00:00Z',
    project:    'Kingdom Vault',
    gcsBucket:  'gs://omnia-kingdom-vault/files/ingest-worker.js',
    tags:       ['backend', 'ingest', 'embeddings'],
  },
  {
    id:         'f004',
    name:       'vault_schema_v2.csv',
    type:       'csv',
    size:       '88 KB',
    sizeBytes:  88_000,
    uploadedBy: 'melody',
    uploadedAt: '2026-05-25T11:20:00Z',
    project:    'Kingdom Vault',
    gcsBucket:  'gs://omnia-kingdom-vault/exports/vault_schema_v2.csv',
    tags:       ['schema', 'firestore'],
  },
  {
    id:         'f005',
    name:       'omnia_theatre_logo_v3.png',
    type:       'image',
    size:       '320 KB',
    sizeBytes:  320_000,
    uploadedBy: 'cerulia',
    uploadedAt: '2026-05-24T14:55:00Z',
    project:    'Omnia Theatre',
    gcsBucket:  'gs://omnia-kingdom-vault/files/omnia_theatre_logo_v3.png',
    tags:       ['branding', 'omnia'],
  },
  {
    id:         'f006',
    name:       'traid_backtest_results.csv',
    type:       'csv',
    size:       '1.1 MB',
    sizeBytes:  1_100_000,
    uploadedBy: 'melody',
    uploadedAt: '2026-05-23T08:00:00Z',
    project:    'TRaiD-ngen',
    gcsBucket:  'gs://omnia-kingdom-vault/files/traid_backtest_results.csv',
    tags:       ['traid', 'trading', 'data'],
  },
  {
    id:         'f007',
    name:       'without_equal_draft_ch1-3.md',
    type:       'md',
    size:       '62 KB',
    sizeBytes:  62_000,
    uploadedBy: 'ryan',
    uploadedAt: '2026-05-20T20:00:00Z',
    project:    'Without Equal',
    gcsBucket:  'gs://omnia-kingdom-vault/files/without_equal_draft_ch1-3.md',
    tags:       ['w/o=', 'lore', 'literary'],
  },
  {
    id:         'f008',
    name:       'chefs_kiss_card_assets.zip',
    type:       'archive',
    size:       '24 MB',
    sizeBytes:  24_000_000,
    uploadedBy: 'cerulia',
    uploadedAt: '2026-05-19T13:30:00Z',
    project:    "Chef's Kiss TCG",
    gcsBucket:  "gs://omnia-kingdom-vault/files/chefs_kiss_card_assets.zip",
    tags:       ['tcg', 'assets', 'design'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FILE_TYPE_META: Record<FileType, { icon: string; bg: string; label: string }> = {
  pdf:     { icon: '📄', bg: 'rgba(231,76,60,0.15)',   label: 'PDF'      },
  md:      { icon: '📝', bg: 'rgba(120,80,255,0.15)',  label: 'Markdown' },
  image:   { icon: '🖼️', bg: 'rgba(52,152,219,0.15)',  label: 'Image'    },
  script:  { icon: '⚙️', bg: 'rgba(26,188,156,0.15)',  label: 'Script'   },
  archive: { icon: '📦', bg: 'rgba(243,156,18,0.15)',  label: 'Archive'  },
  csv:     { icon: '📊', bg: 'rgba(46,204,113,0.15)',  label: 'CSV'      },
  other:   { icon: '📁', bg: 'rgba(144,144,192,0.15)', label: 'File'     },
};

const WARDEN_COLORS: Record<string, string> = {
  ryan: '#FFD700', ptolemy: '#9B59B6', saroya: '#E74C3C',
  melody: '#3498DB', cerulia: '#1ABC9C', affin: '#F39C12',
  jewel: '#2ECC71', krishe: '#95A5A6', astyr: '#C0392B',
  hurrian: '#2980B9', jovin: '#F1C40F', herus: '#7F8C8D',
};

const ALL_TYPES: (FileType | 'all')[] = ['all', 'md', 'pdf', 'image', 'script', 'csv', 'archive', 'other'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface FileIconProps {
  type:    FileType;
  variant: 'card' | 'row';
}

function FileIcon({ type, variant }: FileIconProps) {
  const meta   = FILE_TYPE_META[type];
  const size   = variant === 'card' ? 'file-card-icon' : 'file-row-icon';
  return (
    <div className={size} style={{ background: meta.bg }}>
      {meta.icon}
    </div>
  );
}

interface FileCardProps {
  file: VaultFile;
}

function FileCardGrid({ file }: FileCardProps) {
  const wColor = WARDEN_COLORS[file.uploadedBy] ?? '#9090c0';
  return (
    <div className="file-card" role="button" tabIndex={0}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <FileIcon type={file.type} variant="card" />
        <span className="file-card-size">{file.size}</span>
      </div>
      <div>
        <div className="file-card-name" title={file.name}>{file.name}</div>
        <div className="file-card-meta">
          <span
            style={{
              color: wColor,
              fontWeight: 600,
              fontSize: '0.75rem',
              textTransform: 'capitalize',
            }}
          >
            {file.uploadedBy}
          </span>
          <span>·</span>
          <span>{formatDate(file.uploadedAt)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {file.tags.slice(0, 3).map((t) => (
          <span key={t} className="tag tag-purple" style={{ fontSize: '0.625rem', padding: '1px 7px' }}>
            {t}
          </span>
        ))}
      </div>
      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
        {file.project}
      </div>
    </div>
  );
}

function FileCardRow({ file }: FileCardProps) {
  const wColor = WARDEN_COLORS[file.uploadedBy] ?? '#9090c0';
  return (
    <div className="file-row" role="button" tabIndex={0}>
      <FileIcon type={file.type} variant="row" />
      <div className="file-row-name" title={file.name}>{file.name}</div>
      <div className="file-row-meta">
        <span
          style={{
            color: wColor,
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'capitalize',
            minWidth: 60,
          }}
        >
          {file.uploadedBy}
        </span>
        <span style={{ minWidth: 80, textAlign: 'right' }}>{formatDate(file.uploadedAt)}</span>
        <span
          className="file-card-size"
          style={{ minWidth: 56, textAlign: 'center' }}
        >
          {file.size}
        </span>
        <span style={{ minWidth: 90, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          {file.project}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drop zone
// ─────────────────────────────────────────────────────────────────────────────

interface DropZoneProps {
  onFileDrop: (files: File[]) => void;
}

function DropZone({ onFileDrop }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length > 0) onFileDrop(dropped);
    },
    [onFileDrop],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      if (selected.length > 0) onFileDrop(selected);
    },
    [onFileDrop],
  );

  return (
    <div
      className={`drop-zone${dragging ? ' dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      aria-label="Drop files to upload or click to browse"
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <span className="drop-zone-icon">⬡</span>
      <div className="drop-zone-title">
        {dragging ? 'Release to upload' : 'Drop files here or click to browse'}
      </div>
      <div className="drop-zone-sub">
        Scripts · PDFs · Images · Markdown · Archives<br />
        Stored in{' '}
        <code style={{ color: 'var(--gold)', fontSize: '0.8125rem' }}>
          gs://omnia-kingdom-vault/files/
        </code>
        {/* TODO: wire upload to useUploadFile() hook — calls GCS signed URL endpoint */}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function Files() {
  // TODO: replace MOCK_FILES with useFiles() hook from src/lib/hooks/useFiles.ts
  const files = MOCK_FILES;

  // Filter state
  const [typeFilter,   setTypeFilter]   = useState<FileType | 'all'>('all');
  const [wardenFilter, setWardenFilter] = useState<string>('all');
  const [sortBy,       setSortBy]       = useState<'date' | 'size' | 'name'>('date');
  const [viewMode,     setViewMode]     = useState<ViewMode>('grid');

  // Upload handler — TODO: wire to useUploadFile() hook
  const handleFileDrop = useCallback((dropped: File[]) => {
    // TODO: wire to upload hook — show toast, progress bar, then refresh list
    // eslint-disable-next-line no-console
    console.info('[Files] Drop received:', dropped.map((f) => f.name));
  }, []);

  // Derived warden list from current file set
  const wardens = Array.from(new Set(files.map((f) => f.uploadedBy))).sort();

  // Apply filters + sort
  const visible = files
    .filter((f) => typeFilter   === 'all' || f.type       === typeFilter)
    .filter((f) => wardenFilter === 'all' || f.uploadedBy === wardenFilter)
    .sort((a, b) => {
      if (sortBy === 'date')  return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      if (sortBy === 'size')  return b.sizeBytes - a.sizeBytes;
      /* name */              return a.name.localeCompare(b.name);
    });

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 className="page-title">⬡ File Vault</h1>
          <p className="page-subtitle">
            Browse, search, and preview files stored in GCS. Upload new files and associate them with projects and wardens.
          </p>
        </div>
        {/* TODO: wire useAuth() to show upload permissions based on role */}
        <button className="btn btn-primary">
          ↑ Upload File
        </button>
      </div>

      {/* Drop zone */}
      <div style={{ marginBottom: 28 }}>
        <DropZone onFileDrop={handleFileDrop} />
      </div>

      {/* Toolbar: filters + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>

        {/* Type filters */}
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>
            Type
          </span>
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              className={`filter-chip${typeFilter === t ? ' active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === 'all' ? 'All' : FILE_TYPE_META[t as FileType].label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Warden filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              By
            </span>
            <select
              value={wardenFilter}
              onChange={(e) => setWardenFilter(e.target.value)}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 100,
                padding: '5px 12px',
                color: 'var(--text-secondary)',
                fontSize: '0.8125rem',
                fontFamily: 'Inter, sans-serif',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="all">All wardens</option>
              {wardens.map((w) => (
                <option key={w} value={w} style={{ textTransform: 'capitalize' }}>
                  {w.charAt(0).toUpperCase() + w.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Sort
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'size' | 'name')}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 100,
                padding: '5px 12px',
                color: 'var(--text-secondary)',
                fontSize: '0.8125rem',
                fontFamily: 'Inter, sans-serif',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="date">Newest first</option>
              <option value="size">Largest first</option>
              <option value="name">A → Z</option>
            </select>
          </div>

          {/* View toggle */}
          <div className="view-toggle">
            <button
              className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              title="Grid view"
            >
              ▦
            </button>
            <button
              className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-label="List view"
              title="List view"
            >
              ≡
            </button>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 14 }}>
        {visible.length} file{visible.length !== 1 ? 's' : ''} · {/* TODO: replace count from useFiles() */}
        <span style={{ color: 'var(--text-secondary)' }}>
          {files.length} total in vault
        </span>
      </div>

      {/* File grid / list */}
      {visible.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="files-grid">
            {visible.map((file) => (
              <FileCardGrid key={file.id} file={file} />
            ))}
          </div>
        ) : (
          <>
            {/* List header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '6px 16px',
                fontSize: '0.6875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                marginBottom: 4,
              }}
            >
              <div style={{ width: 36 }} />
              <div style={{ flex: 1 }}>Name</div>
              <div style={{ display: 'flex', gap: 16, minWidth: 320 }}>
                <span style={{ minWidth: 60 }}>By</span>
                <span style={{ minWidth: 80, textAlign: 'right' }}>Date</span>
                <span style={{ minWidth: 56, textAlign: 'center' }}>Size</span>
                <span style={{ minWidth: 90 }}>Project</span>
              </div>
            </div>
            <div className="files-list">
              {visible.map((file) => (
                <FileCardRow key={file.id} file={file} />
              ))}
            </div>
          </>
        )
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">⬡</div>
          <div className="empty-state-title">The vault holds nothing that matches.</div>
          <div className="empty-state-sub">Adjust your eye.</div>
        </div>
      )}

      {/* GCS bucket reference */}
      <div className="divider" />
      <div className="card" style={{ marginTop: 0 }}>
        <h2 className="section-title" style={{ marginBottom: 16 }}>Bucket Structure</h2>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.8125rem',
            lineHeight: 2,
            color: 'var(--text-secondary)',
            padding: '12px 16px',
            background: 'var(--surface-2)',
            borderRadius: 8,
          }}
        >
          {[
            { path: 'gs://omnia-kingdom-vault/',  desc: 'Root bucket' },
            { path: '  /files/',                  desc: 'Uploaded scripts, PDFs, images' },
            { path: '  /exports/',                desc: 'BigQuery export snapshots' },
            { path: '  /backups/',                desc: 'Nightly Firestore export' },
            { path: '  /warden-logs/',            desc: 'Raw session transcript files' },
          ].map((item) => (
            <div key={item.path} style={{ display: 'flex', gap: 24 }}>
              <span style={{ color: 'var(--gold)', minWidth: 280 }}>{item.path}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', alignSelf: 'center' }}>
                {item.desc}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {/* TODO: replace bucket path from useVaultConfig() hook once live */}
          * GCS bucket path configurable via NEXT_PUBLIC_GCS_BUCKET env var
        </div>
      </div>
    </div>
  );
}
