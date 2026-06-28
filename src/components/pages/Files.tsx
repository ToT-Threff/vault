'use client';

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useFiles, useUploadFile } from '@/lib/hooks';
import MarkdownModal from '@/components/MarkdownModal';
import type { KingdomFile } from '@/lib/types';
import { doc, deleteDoc } from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { WARDEN_COLORS } from '@/lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0)       return '0 B';
  if (bytes < 1_024)     return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Returns the file extension (lowercase), e.g. "tsx", "md", "pdf" */
function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/** Icon for the file — more granular than just KingdomFile.type */
function fileIcon(file: KingdomFile): string {
  const ext = getExt(file.name);
  if (['md', 'txt'].includes(ext))                         return '📝';
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext))           return '🕸️';
  if (ext === 'py')                                        return '🐍';
  if (['sh', 'bash', 'zsh'].includes(ext))                 return '🖥️';
  if (['json', 'yaml', 'yml', 'toml'].includes(ext))      return '⚙️';
  if (ext === 'pdf')                                       return '📄';
  if (file.type === 'image')                               return '🖼️';
  if (file.type === 'archive')                             return '📦';
  if (file.type === 'video')                               return '🎬';
  if (file.type === 'audio')                               return '🎵';
  if (file.type === 'document')                            return '📄';
  return '📁';
}

/** Whether a file can be previewed as text/code */
function isTextPreviewable(file: KingdomFile): boolean {
  const ext = getExt(file.name);
  return ['md', 'txt', 'ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'bash',
          'json', 'yaml', 'yml', 'toml', 'css', 'html', 'sql', 'csv'].includes(ext);
}

function isMarkdown(file: KingdomFile): boolean {
  return getExt(file.name) === 'md';
}

function isImage(file: KingdomFile): boolean {
  return file.type === 'image';
}



// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SortField = 'name' | 'size' | 'uploadedAt' | 'embeddingStatus';
type SortDir   = 'asc' | 'desc';
type ViewMode  = 'grid' | 'list';

type FolderKey =
  | 'root'
  | 'by-project'
  | 'by-warden'
  | 'documents'
  | 'images'
  | 'archives'
  | 'gdrive';

interface VirtualFolder {
  key: FolderKey;
  label: string;
  icon: string;
  disabled?: boolean;
  parent?: FolderKey;
}

const FOLDERS: VirtualFolder[] = [
  { key: 'root',       label: 'Kingdom Root', icon: '🗳️' },
  { key: 'by-project', label: 'By Project',   icon: '📂', parent: 'root' },
  { key: 'by-warden',  label: 'By Warden',    icon: '👤', parent: 'root' },
  { key: 'documents',  label: 'Documents',    icon: '📎', parent: 'root' },
  { key: 'images',     label: 'Images',       icon: '🖼️', parent: 'root' },
  { key: 'archives',   label: 'Archives',     icon: '📦', parent: 'root' },
  { key: 'gdrive',     label: 'Google Drive', icon: '☁️', parent: 'root', disabled: true },
];

interface ContextMenuState {
  x: number;
  y: number;
  file: KingdomFile;
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedding Status Badge
// ─────────────────────────────────────────────────────────────────────────────

function EmbeddingBadge({
  status,
  error,
  compact = false,
}: {
  status?: KingdomFile['embeddingStatus'];
  error?: string;
  compact?: boolean;
}) {
  if (status === 'indexing') {
    return (
      <span
        title="Indexing into vector search…"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: compact ? '0.6rem' : '0.65rem', fontWeight: 600,
          padding: compact ? '1px 5px' : '2px 6px',
          borderRadius: 6, background: 'rgba(52, 152, 219, 0.12)',
          border: '1px solid rgba(52, 152, 219, 0.3)',
          color: '#3498DB', whiteSpace: 'nowrap',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      >
        ⧡ Indexing
      </span>
    );
  }
  if (status === 'indexed') {
    return (
      <span
        title="Indexed — searchable via kingdom search"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: compact ? '0.6rem' : '0.65rem', fontWeight: 600,
          padding: compact ? '1px 5px' : '2px 6px',
          borderRadius: 6, background: 'rgba(26, 188, 156, 0.12)',
          border: '1px solid rgba(26, 188, 156, 0.3)',
          color: '#1ABC9C', whiteSpace: 'nowrap',
        }}
      >
        ✓ Indexed
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span
        title={error ?? 'Vector indexing failed — file is still accessible'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: compact ? '0.6rem' : '0.65rem', fontWeight: 600,
          padding: compact ? '1px 5px' : '2px 6px',
          borderRadius: 6, background: 'rgba(243, 156, 18, 0.12)',
          border: '1px solid rgba(243, 156, 18, 0.3)',
          color: '#F39C12', whiteSpace: 'nowrap', cursor: 'help',
        }}
      >
        ⚠ Failed
      </span>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Menu (portal-rendered)
// ─────────────────────────────────────────────────────────────────────────────

function ContextMenu({
  state,
  onClose,
  onPreview,
  onDownload,
  onCopyLink,
  onDelete,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onPreview: (file: KingdomFile) => void;
  onDownload: (file: KingdomFile) => void;
  onCopyLink: (file: KingdomFile) => void;
  onDelete: (file: KingdomFile) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Clamp to viewport
  const [pos, setPos] = useState({ x: state.x, y: state.y });
  useEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      x: Math.min(state.x, vw - width - 8),
      y: Math.min(state.y, vh - height - 8),
    });
  }, [state.x, state.y]);

  const item = (emoji: string, label: string, onClick: () => void, danger = false) => (
    <button
      key={label}
      onClick={() => { onClick(); onClose(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '8px 12px', borderRadius: 6,
        fontSize: '0.875rem', cursor: 'pointer', border: 'none',
        background: 'transparent',
        color: danger ? '#e74c3c' : 'var(--text-secondary)',
        transition: 'background 0.12s ease, color 0.12s ease',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface-3)';
        e.currentTarget.style.color = danger ? '#ff6b6b' : 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = danger ? '#e74c3c' : 'var(--text-secondary)';
      }}
    >
      <span style={{ width: 18, textAlign: 'center' }}>{emoji}</span>
      {label}
    </button>
  );

  const divider = (
    <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
  );

  const menu = (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        background: 'var(--surface-2)',
        border: '1px solid var(--border-bright)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        padding: 6,
        minWidth: 180,
        zIndex: 600,
        animation: 'contextMenuIn 0.12s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      }}
    >
      {item('👁️', 'Preview', () => onPreview(state.file))}
      {item('⬇️', 'Download', () => onDownload(state.file))}
      {item('🔗', 'Copy Link', () => onCopyLink(state.file))}
      {divider}
      {item('❌', 'Delete', () => onDelete(state.file), true)}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(menu, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// File Preview Modal
// ─────────────────────────────────────────────────────────────────────────────

function FilePreviewModal({
  file,
  onClose,
}: {
  file: KingdomFile;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  // Fetch text content for text/code files
  useEffect(() => {
    if (!isTextPreviewable(file)) return;
    fetch(file.url)
      .then((r) => r.text())
      .then(setContent)
      .catch(() => setLoadErr(true));
  }, [file]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Escape key
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  if (isMarkdown(file) && content !== null) {
    const meta = (
      <>
        <span className="tag tag-purple">{formatBytes(file.size)}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {file.uploadedBy}
        </span>
        <EmbeddingBadge status={file.embeddingStatus} error={file.embeddingError} />
      </>
    );
    return <MarkdownModal title={file.name} content={content} meta={meta} onClose={onClose} />;
  }

  const backdrop = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 800,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      className="backdrop-enter"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-enter"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-bright)',
          borderRadius: 20,
          maxWidth: 760, width: '95%', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 80px rgba(120,80,255,0.18), 0 32px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: '1.25rem' }}>{fileIcon(file)}</span>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
              fontSize: '1.0625rem', color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{file.name}</span>
            <span className="tag tag-purple" style={{ flexShrink: 0 }}>{formatBytes(file.size)}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 8, width: 32, height: 32, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 24 }}>
          {isImage(file) && (
            <div style={{ textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.url}
                alt={file.name}
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, objectFit: 'contain' }}
              />
            </div>
          )}
          {isTextPreviewable(file) && !isMarkdown(file) && (
            loadErr ? (
              <div style={{ color: 'var(--crimson)', fontSize: '0.875rem' }}>
                Failed to load file content.
              </div>
            ) : content === null ? (
              <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
            ) : (
              <pre style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '16px 20px', overflowX: 'auto',
                fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem',
                color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {content}
              </pre>
            )
          )}
          {!isImage(file) && !isTextPreviewable(file) && (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>{fileIcon(file)}</div>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.0625rem',
                fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8,
              }}>
                Preview not available
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 24 }}>
                This file type cannot be previewed in the browser.
              </div>
              <a
                href={file.url}
                download={file.name}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 100,
                  background: 'linear-gradient(135deg, var(--purple), #5030cc)',
                  color: 'white', fontWeight: 500, fontSize: '0.875rem',
                  textDecoration: 'none',
                }}
              >
                ⬇️ Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(backdrop, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete Confirmation Dialog
// ─────────────────────────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  files,
  onConfirm,
  onCancel,
}: {
  files: KingdomFile[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onCancel]);

  const dialog = (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      className="backdrop-enter"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-enter"
        style={{
          background: 'var(--surface)',
          border: '1px solid rgba(231, 76, 60, 0.4)',
          borderRadius: 16, maxWidth: 420, width: '95%',
          boxShadow: '0 0 60px rgba(231,76,60,0.15), 0 24px 64px rgba(0,0,0,0.7)',
          padding: '28px 32px',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 12, textAlign: 'center' }}>🗑️</div>
        <h3 style={{
          fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.125rem',
          fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 8,
        }}>
          {files.length === 1 ? 'Delete this file?' : `Delete ${files.length} files?`}
        </h3>
        <p style={{
          fontSize: '0.875rem', color: 'var(--text-muted)',
          textAlign: 'center', lineHeight: 1.6, marginBottom: 24,
        }}>
          {files.length === 1
            ? <><strong style={{ color: 'var(--text-secondary)' }}>{files[0].name}</strong> will be permanently removed from the vault.</>
            : 'These files will be permanently removed from the vault.'}
          {' '}This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            className="btn btn-ghost"
            style={{ fontSize: '0.875rem' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn"
            style={{
              background: '#e74c3c', color: 'white',
              boxShadow: '0 2px 12px rgba(231,76,60,0.4)',
              fontSize: '0.875rem',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload Progress Bar
// ─────────────────────────────────────────────────────────────────────────────

function UploadProgressBar({ percent, stage, filename }: { percent: number; stage: string; filename: string }) {
  const color = stage === 'error' ? '#e74c3c' : stage === 'indexing' ? '#3498DB' : '#1ABC9C';
  const label = stage === 'uploading'
    ? `Uploading ${filename}… ${percent}%`
    : stage === 'indexing'
    ? `⧡ Indexing ${filename}…`
    : stage === 'error'
    ? `✗ Failed: ${filename}`
    : `✓ Done: ${filename}`;

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color }}>{stage !== 'indexing' ? `${percent}%` : ''}</span>
      </div>
      <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4, background: color,
          width: stage === 'indexing' ? '100%' : `${percent}%`,
          transition: 'width 0.2s ease',
          animation: stage === 'indexing' ? 'pulse 1.5s ease-in-out infinite' : undefined,
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File Card (Grid View)
// ─────────────────────────────────────────────────────────────────────────────

function FileCard({
  file,
  selected,
  indexingStatus,
  onSelect,
  onContextMenu,
  onOpen,
  onMenuClick,
}: {
  file: KingdomFile;
  selected: boolean;
  indexingStatus?: KingdomFile['embeddingStatus'];
  onSelect: (id: string, e: React.MouseEvent) => void;
  onContextMenu: (file: KingdomFile, x: number, y: number) => void;
  onOpen: (file: KingdomFile) => void;
  onMenuClick: (file: KingdomFile, e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const icon = fileIcon(file);
  const displayStatus = indexingStatus ?? file.embeddingStatus;
  const date = file.createdAt?.toDate?.()
    ? file.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : '—';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={(e) => {
        if ((e.metaKey || e.ctrlKey || e.shiftKey)) {
          onSelect(file.id, e);
        } else {
          onOpen(file);
        }
      }}
      onDoubleClick={() => onOpen(file)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(file, e.clientX, e.clientY);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === 'Enter') onOpen(file);
        if (e.key === ' ') { e.preventDefault(); onSelect(file.id, e as unknown as React.MouseEvent); }
      }}
      style={{
        background: selected ? 'rgba(212, 168, 67, 0.08)' : hovered ? 'var(--surface-2)' : 'var(--surface)',
        border: selected
          ? '1px solid var(--gold)'
          : hovered
          ? '1px solid var(--border-bright)'
          : '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
        cursor: 'pointer',
        transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        display: 'flex', flexDirection: 'column', gap: 10,
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? 'var(--shadow-card)' : 'none',
        userSelect: 'none',
        outline: 'none',
      }}
    >
      {/* Checkbox (top-left, appears on hover/selected) */}
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(file.id, e); }}
        style={{
          position: 'absolute', top: 10, left: 10,
          width: 18, height: 18,
          borderRadius: 4,
          border: selected ? '2px solid var(--gold)' : '2px solid var(--border-bright)',
          background: selected ? 'var(--gold)' : 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hovered || selected ? 1 : 0,
          transition: 'opacity 0.15s ease',
          zIndex: 1,
          cursor: 'pointer',
          fontSize: '0.65rem', fontWeight: 700, color: 'var(--obsidian)',
        }}
      >
        {selected && '✓'}
      </div>

      {/* ⋮ menu button (top-right, on hover) */}
      {hovered && (
        <button
          aria-label="File options"
          onClick={(e) => { e.stopPropagation(); onMenuClick(file, e); }}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'var(--surface-3)', border: '1px solid var(--border-bright)',
            borderRadius: 6, width: 26, height: 26, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem',
            zIndex: 1,
          }}
        >
          ⋮
        </button>
      )}

      {/* Icon */}
      <div style={{
        width: 52, height: 52, borderRadius: 10,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.5rem', alignSelf: 'center',
        marginTop: 4,
      }}>
        {icon}
      </div>

      {/* Filename */}
      <div style={{
        fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-primary)',
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        lineHeight: 1.35, textAlign: 'center',
      }} title={file.name}>
        {file.name}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 'auto', paddingTop: 4,
        borderTop: '1px solid var(--border)',
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem',
          color: 'var(--gold)', background: 'var(--gold-dim)',
          padding: '2px 5px', borderRadius: 4,
        }}>
          {formatBytes(file.size)}
        </span>
        <EmbeddingBadge status={displayStatus} error={file.embeddingError} compact />
      </div>

      {/* Date & warden */}
      <div style={{
        fontSize: '0.68rem', color: 'var(--text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
      }}>
        <span style={{ color: WARDEN_COLORS[file.uploadedBy] ?? 'var(--text-muted)', fontWeight: 600 }}>
          {file.uploadedBy}
        </span>
        <span>{date}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File Row (List View)
// ─────────────────────────────────────────────────────────────────────────────

function FileRow({
  file,
  selected,
  indexingStatus,
  sortField,
  onSelect,
  onContextMenu,
  onOpen,
  onMenuClick,
}: {
  file: KingdomFile;
  selected: boolean;
  indexingStatus?: KingdomFile['embeddingStatus'];
  sortField: SortField;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onContextMenu: (file: KingdomFile, x: number, y: number) => void;
  onOpen: (file: KingdomFile) => void;
  onMenuClick: (file: KingdomFile, e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const icon = fileIcon(file);
  const displayStatus = indexingStatus ?? file.embeddingStatus;
  const wc = WARDEN_COLORS[file.uploadedBy] ?? 'var(--text-muted)';
  const date = file.createdAt?.toDate?.()
    ? file.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : '—';

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          onSelect(file.id, e);
        } else {
          onOpen(file);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(file, e.clientX, e.clientY);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === 'Enter') onOpen(file);
        if (e.key === ' ') { e.preventDefault(); onSelect(file.id, e as unknown as React.MouseEvent); }
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        background: selected ? 'rgba(212, 168, 67, 0.06)' : hovered ? 'var(--surface-2)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.12s ease',
        userSelect: 'none',
        outline: 'none',
        borderLeft: selected ? '3px solid var(--gold)' : '3px solid transparent',
      }}
    >
      {/* Checkbox */}
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(file.id, e); }}
        style={{
          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
          border: selected ? '2px solid var(--gold)' : '2px solid var(--border-bright)',
          background: selected ? 'var(--gold)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hovered || selected ? 1 : 0,
          transition: 'opacity 0.12s ease',
          fontSize: '0.6rem', fontWeight: 700, color: 'var(--obsidian)',
          cursor: 'pointer',
        }}
      >
        {selected && '✓'}
      </div>

      {/* Icon */}
      <span style={{ fontSize: '1.125rem', flexShrink: 0, width: 24, textAlign: 'center' }}>{icon}</span>

      {/* Name */}
      <div style={{
        flex: '0 0 30%', minWidth: 0,
        fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={file.name}>
        {file.name}
      </div>

      {/* Type */}
      <div style={{
        flex: '0 0 80px',
        fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize',
      }}>
        {file.type}
      </div>

      {/* Size */}
      <div style={{
        flex: '0 0 70px',
        fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: 'var(--gold)',
      }}>
        {formatBytes(file.size)}
      </div>

      {/* Warden */}
      <div style={{
        flex: '0 0 80px',
        fontSize: '0.75rem', color: wc, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {file.uploadedBy}
      </div>

      {/* Date */}
      <div style={{
        flex: '0 0 80px',
        fontSize: '0.75rem', color: 'var(--text-muted)',
      }}>
        {date}
      </div>

      {/* Embedding */}
      <div style={{ flex: '0 0 90px' }}>
        <EmbeddingBadge status={displayStatus} error={file.embeddingError} compact />
      </div>

      {/* Menu button */}
      <button
        aria-label="File options"
        onClick={(e) => { e.stopPropagation(); onMenuClick(file, e); }}
        style={{
          marginLeft: 'auto', flexShrink: 0,
          background: hovered ? 'var(--surface-3)' : 'transparent',
          border: hovered ? '1px solid var(--border-bright)' : '1px solid transparent',
          borderRadius: 6, width: 26, height: 26, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.875rem',
          opacity: hovered ? 1 : 0,
          transition: 'all 0.12s ease',
        }}
      >
        ⋮
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Folder Sidebar
// ─────────────────────────────────────────────────────────────────────────────

function FolderSidebar({
  activeFolder,
  fileCounts,
  onSelect,
  collapsed,
  onToggle,
}: {
  activeFolder: FolderKey;
  fileCounts: Record<FolderKey, number>;
  onSelect: (key: FolderKey) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexShrink: 0 }}>
      {/* Sidebar panel — collapses to zero width, overflow hidden so nothing bleeds out */}
      <div style={{
        width: collapsed ? 0 : 220,
        minWidth: collapsed ? 0 : 220,
        overflow: 'hidden',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        borderRight: collapsed ? 'none' : '1px solid var(--border)',
        background: 'var(--void)',
        display: 'flex', flexDirection: 'column',
      }}>
        {!collapsed && (
          <>
            <div style={{
              padding: '14px 16px 10px',
              fontSize: '0.6875rem', fontWeight: 600,
              letterSpacing: '0.09em', textTransform: 'uppercase',
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
            }}>
              Folders
            </div>
            <div style={{ padding: '8px 8px', overflowY: 'auto', flex: 1 }}>
              {FOLDERS.map((folder) => {
                const isActive  = activeFolder === folder.key;
                const isChild   = !!folder.parent;
                const count     = fileCounts[folder.key] ?? 0;

                return (
                  <button
                    key={folder.key}
                    onClick={() => !folder.disabled && onSelect(folder.key)}
                    disabled={folder.disabled}
                    title={folder.disabled ? 'Coming soon' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: `7px ${isChild ? 20 : 12}px`,
                      borderRadius: 6, border: 'none',
                      background: isActive ? 'var(--surface-2)' : 'transparent',
                      cursor: folder.disabled ? 'not-allowed' : 'pointer',
                      transition: 'all 0.12s ease',
                      borderLeft: isActive ? '2px solid var(--border-bright)' : '2px solid transparent',
                      opacity: folder.disabled ? 0.4 : 1,
                      marginBottom: 1,
                    } as React.CSSProperties}

                    onMouseEnter={(e) => {
                      if (!isActive && !folder.disabled)
                        e.currentTarget.style.background = 'rgba(120,80,255,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ fontSize: isChild ? '0.875rem' : '1rem', flexShrink: 0 }}>
                      {folder.icon}
                    </span>
                    <span style={{
                      flex: 1, textAlign: 'left',
                      fontSize: isChild ? '0.8125rem' : '0.875rem',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {folder.label}
                    </span>
                    {folder.disabled ? (
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>soon</span>
                    ) : (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 600,
                        background: isActive ? 'var(--border-bright)' : 'var(--surface-3)',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                        borderRadius: 100, padding: '1px 6px', minWidth: 18, textAlign: 'center',
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {/* Collapse toggle — only shown inside sidebar when expanded */}
        {!collapsed && (
          <button
            onClick={onToggle}
            title="Collapse folder panel"
            style={{
              alignSelf: 'flex-end',
              margin: '8px',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 6, width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem',
            }}
          >
            ◀
          </button>
        )}
      </div>

      {/* Expand toggle — shown as a thin strip at the left edge when sidebar is collapsed */}
      {collapsed && (
        <button
          onClick={onToggle}
          title="Expand folder panel"
          style={{
            alignSelf: 'flex-start',
            marginTop: 16,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: '0 6px 6px 0',
            width: 20, height: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.625rem',
            flexShrink: 0,
            borderLeft: 'none',
          }}
        >
          ▶
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Files() {
  // ── Persisted state ───────────────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('vault-file-view') as ViewMode) ?? 'grid';
    }
    return 'grid';
  });

  // ── UI State ──────────────────────────────────────────────────────────────
  const [activeFolder,  setActiveFolder]  = useState<FolderKey>('root');
  const [sidebarOpen,   setSidebarOpen]   = useState(true);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [sortField,     setSortField]     = useState<SortField>('uploadedAt');
  const [sortDir,       setSortDir]       = useState<SortDir>('desc');
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [dragOver,      setDragOver]      = useState(false);
  const [contextMenu,   setContextMenu]   = useState<ContextMenuState | null>(null);
  const [previewFile,   setPreviewFile]   = useState<KingdomFile | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<KingdomFile[] | null>(null);
  const [lastSelected,  setLastSelected]  = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: files, loading, error } = useFiles();
  const { upload, progress, clearProgress } = useUploadFile();
  const [liveStatus, setLiveStatus] = useState<Record<string, KingdomFile['embeddingStatus']>>({});

  // ── Persist view toggle ───────────────────────────────────────────────────
  const handleSetView = useCallback((v: ViewMode) => {
    setView(v);
    if (typeof window !== 'undefined') localStorage.setItem('vault-file-view', v);
  }, []);

  // ── Mobile: auto-close sidebar ────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    if (mq.matches) setSidebarOpen(false);
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Folder filtering ──────────────────────────────────────────────────────
  const folderFilter = useCallback((file: KingdomFile): boolean => {
    switch (activeFolder) {
      case 'root':       return true;
      case 'by-project': return !!file.projectId;
      case 'by-warden':  return !!file.uploadedBy;
      case 'documents':  {
        const ext = getExt(file.name);
        return file.type === 'document' || ['md','pdf','doc','docx','txt'].includes(ext);
      }
      case 'images':     return file.type === 'image';
      case 'archives':   return file.type === 'archive';
      case 'gdrive':     return false;
      default:           return true;
    }
  }, [activeFolder]);

  // ── File counts per folder ────────────────────────────────────────────────
  const fileCounts = useMemo((): Record<FolderKey, number> => {
    const count = (pred: (f: KingdomFile) => boolean) => files.filter(pred).length;
    return {
      root:       files.length,
      'by-project': count((f) => !!f.projectId),
      'by-warden':  count((f) => !!f.uploadedBy),
      documents:  count((f) => {
        const ext = getExt(f.name);
        return f.type === 'document' || ['md','pdf','doc','docx','txt'].includes(ext);
      }),
      images:     count((f) => f.type === 'image'),
      archives:   count((f) => f.type === 'archive'),
      gdrive:     0,
    };
  }, [files]);

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  const breadcrumb = useMemo(() => {
    const folder = FOLDERS.find((f) => f.key === activeFolder);
    if (!folder || folder.key === 'root') return [{ label: 'Kingdom Root', key: 'root' as FolderKey }];
    return [
      { label: 'Kingdom Root', key: 'root' as FolderKey },
      { label: folder.label,   key: folder.key },
    ];
  }, [activeFolder]);

  // ── Sort toggle ───────────────────────────────────────────────────────────
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
      else setSortDir('asc');
      return field;
    });
  }, []);

  // ── Visible files (filtered + sorted) ────────────────────────────────────
  const visible = useMemo(() => {
    let out = files.filter(folderFilter);

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      out = out.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.type.toLowerCase().includes(q) ||
          (f.projectId?.toLowerCase().includes(q) ?? false) ||
          f.uploadedBy.toLowerCase().includes(q),
      );
    }

    // Sort
    out = [...out].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
        case 'uploadedAt':
          cmp = (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
          break;
        case 'embeddingStatus': {
          const order: Record<string, number> = { indexed: 0, indexing: 1, failed: 2, pending: 3 };
          cmp = (order[a.embeddingStatus ?? 'pending'] ?? 3) - (order[b.embeddingStatus ?? 'pending'] ?? 3);
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return out;
  }, [files, folderFilter, searchQuery, sortField, sortDir]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const handleSelect = useCallback((id: string, e: React.MouseEvent) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelected) {
        // Range select
        const ids = visible.map((f) => f.id);
        const a = ids.indexOf(lastSelected);
        const b = ids.indexOf(id);
        const [from, to] = a < b ? [a, b] : [b, a];
        ids.slice(from, to + 1).forEach((fid) => next.add(fid));
      } else if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.has(id) && next.size === 1) next.delete(id);
        else { next.clear(); next.add(id); }
      }
      return next;
    });
    setLastSelected(id);
  }, [visible, lastSelected]);

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    for (const file of arr) {
      setLiveStatus((prev) => ({ ...prev, [file.name]: 'indexing' }));
      try {
        const result = await upload(file, { uploadedBy: 'ryan' });
        setLiveStatus((prev) => ({ ...prev, [file.name]: result.embeddingStatus }));
        setTimeout(() => {
          clearProgress(file.name);
          setTimeout(() => {
            setLiveStatus((prev) => {
              const next = { ...prev };
              delete next[file.name];
              return next;
            });
          }, 2000);
        }, 3000);
      } catch (err) {
        console.error('[Files] upload error:', err);
        setLiveStatus((prev) => { const n = { ...prev }; delete n[file.name]; return n; });
      }
    }
  }, [upload, clearProgress]);

  // ── Window-level drag & drop (fires overlay) ──────────────────────────────
  useEffect(() => {
    let enterCount = 0;
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        enterCount++;
        setDragOver(true);
      }
    };
    const onDragLeave = () => {
      enterCount--;
      if (enterCount <= 0) { enterCount = 0; setDragOver(false); }
    };
    const onDragOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      enterCount = 0;
      setDragOver(false);
      if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  // ── Context menu actions ──────────────────────────────────────────────────
  const openContextMenu = useCallback((file: KingdomFile, x: number, y: number) => {
    setContextMenu({ x, y, file });
  }, []);

  const handleMenuClick = useCallback((file: KingdomFile, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ x: rect.right, y: rect.bottom + 4, file });
  }, []);

  const handlePreview = useCallback((file: KingdomFile) => {
    setPreviewFile(file);
  }, []);

  const handleDownload = useCallback((file: KingdomFile) => {
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }, []);

  const handleCopyLink = useCallback((file: KingdomFile) => {
    navigator.clipboard.writeText(file.url).catch(() => null);
  }, []);

  const handleDeleteRequest = useCallback((file: KingdomFile) => {
    setDeleteTarget([file]);
  }, []);

  const handleDeleteBatch = useCallback(() => {
    const targets = files.filter((f) => selected.has(f.id));
    setDeleteTarget(targets);
  }, [files, selected]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget?.length) return;

    try {
      await Promise.all(
        deleteTarget.map(async (file) => {
          // Delete Firestore metadata document
          await deleteDoc(doc(db, 'files', file.id));
          // Delete from Firebase Storage if storagePath exists
          if (file.storagePath) {
            try {
              await deleteObject(storageRef(storage, file.storagePath));
            } catch (storageErr) {
              // File may already be deleted from storage — log and continue
              console.warn('[Files] Storage delete failed (may already be deleted):', file.id, storageErr);
            }
          }
        })
      );
    } catch (err) {
      console.error('[Files] Delete failed:', err);
    }

    setDeleteTarget(null);
    setSelected(new Set());
  }, [deleteTarget]);

  // ── Active uploads ────────────────────────────────────────────────────────
  const activeUploads = Object.entries(progress);

  // ── Sort indicator ────────────────────────────────────────────────────────
  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fade-in"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 0, paddingBottom: 16,
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="btn btn-ghost"
            style={{ padding: '6px 10px', fontSize: '1rem' }}
            aria-label="Toggle folder panel"
          >
            📂
          </button>
          <h1 className="page-title" style={{ margin: 0 }}>🗳️ File Vault</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary"
            style={{ fontSize: '0.8125rem', padding: '7px 16px' }}
          >
            + Upload
          </button>
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${view === 'grid' ? 'active' : ''}`}
              onClick={() => handleSetView('grid')}
              title="Grid view"
              id="btn-view-grid"
            >▦</button>
            <button
              className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => handleSetView('list')}
              title="List view"
              id="btn-view-list"
            >≡</button>
          </div>
        </div>
      </div>

      {/* ── Breadcrumb + Search ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          {breadcrumb.map((seg, i) => (
            <span key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>›</span>
              )}
              <button
                onClick={() => setActiveFolder(seg.key)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '0.8125rem',
                  color: i === breadcrumb.length - 1 ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                  padding: '2px 4px',
                  borderRadius: 4,
                  transition: 'color 0.12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = i === breadcrumb.length - 1 ? 'var(--text-secondary)' : 'var(--text-muted)'; }}
              >
                {seg.label}
              </button>
            </span>
          ))}
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>
            ({loading ? '…' : visible.length} file{visible.length !== 1 ? 's' : ''})
          </span>
        </nav>

        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', fontSize: '0.875rem', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="search"
            placeholder="Search files…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 100, padding: '6px 12px 6px 30px',
              color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif',
              fontSize: '0.8125rem', outline: 'none', width: 220,
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--purple)';
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--purple-dim)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      {/* ── Upload progress ─────────────────────────────────────────────── */}
      {activeUploads.length > 0 && (
        <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
          {activeUploads.map(([name, prog]) => (
            <UploadProgressBar key={name} filename={name} percent={prog.percent} stage={prog.stage} />
          ))}
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="auth-error" style={{ margin: '12px 0' }}>
          Failed to load files: {error.message}
        </div>
      )}

      {/* ── Main area: sidebar + content ──────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0, marginTop: 0, overflow: 'hidden' }}>

        {/* Folder Sidebar */}
        <FolderSidebar
          activeFolder={activeFolder}
          fileCounts={fileCounts}
          onSelect={(key) => { setActiveFolder(key); setSearchQuery(''); setSelected(new Set()); }}
          collapsed={!sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
        />

        {/* ── File content area ───────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', paddingTop: 16 }}>

          {/* Loading skeleton */}
          {loading && (
            view === 'grid' ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
              }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 180, borderRadius: 12 }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 44, borderRadius: 6 }} />
                ))}
              </div>
            )
          )}

          {/* Grid view */}
          {!loading && visible.length > 0 && view === 'grid' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
            }}>
              {visible.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  selected={selected.has(f.id)}
                  indexingStatus={liveStatus[f.name]}
                  onSelect={handleSelect}
                  onContextMenu={openContextMenu}
                  onOpen={handlePreview}
                  onMenuClick={handleMenuClick}
                />
              ))}
            </div>
          )}

          {/* List view */}
          {!loading && visible.length > 0 && view === 'list' && (
            <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 14px',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border)',
                fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                userSelect: 'none',
              }}>
                <div style={{ width: 16 }} />
                <div style={{ width: 24 }} />
                {(['name', 'type', 'size', 'uploadedBy', 'uploadedAt', 'embeddingStatus'] as const).map((field, i) => {
                  const labels: Record<string, string> = {
                    name: 'Name', type: 'Type', size: 'Size',
                    uploadedBy: 'Warden', uploadedAt: 'Uploaded', embeddingStatus: 'Indexed',
                  };
                  const widths: Record<string, string> = {
                    name: '30%', type: '80px', size: '70px',
                    uploadedBy: '80px', uploadedAt: '80px', embeddingStatus: '90px',
                  };
                  const sortable = ['name', 'size', 'uploadedAt', 'embeddingStatus'].includes(field);
                  const mappedField = field === 'uploadedAt' ? 'uploadedAt' : field as SortField;
                  return (
                    <button
                      key={field}
                      onClick={sortable ? () => handleSort(mappedField as SortField) : undefined}
                      style={{
                        flex: field === 'name' ? '0 0 30%' : `0 0 ${widths[field] ?? 'auto'}`,
                        background: 'none', border: 'none',
                        color: sortField === mappedField ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: sortable ? 'pointer' : 'default',
                        textAlign: 'left', padding: 0, fontSize: '0.7rem',
                        fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {labels[field]}{sortable ? sortIndicator(mappedField as SortField) : ''}
                    </button>
                  );
                })}
                <div style={{ marginLeft: 'auto', width: 26 }} />
              </div>

              {/* Rows */}
              {visible.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  selected={selected.has(f.id)}
                  indexingStatus={liveStatus[f.name]}
                  sortField={sortField}
                  onSelect={handleSelect}
                  onContextMenu={openContextMenu}
                  onOpen={handlePreview}
                  onMenuClick={handleMenuClick}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && visible.length === 0 && (
            <div className="empty-state" style={{ marginTop: 24 }}>
              <div className="empty-state-icon">⧡</div>
              <div className="empty-state-title">This folder holds nothing that matches.</div>
              <div className="empty-state-sub">Adjust your eye.</div>
            </div>
          )}

          {/* Storage details footer */}
          <div className="card" style={{ marginTop: 32, borderColor: 'var(--border)' }}>
            <h2 className="section-title" style={{ marginBottom: 14 }}>☁️ Storage Details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Primary Bucket',  value: `gs://${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'omnia-kingdom-vault-storage'}` },
                { label: 'Archive Bucket',  value: 'gs://omnia-kingdom-archive' },
                { label: 'Region',          value: 'us-central1 (Iowa)' },
                { label: 'Encryption',      value: 'Google-managed keys (CMEK ready)' },
              ].map((row) => (
                <div key={row.label}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 3 }}>{row.label}</div>
                  <code style={{ fontSize: '0.8125rem', color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {row.value}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Drag-over full-page overlay ─────────────────────────────────── */}
      {dragOver && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 700,
          background: 'rgba(7, 7, 20, 0.82)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
          animation: 'backdropIn 0.15s ease both',
        }}>
          <div style={{
            border: '2px solid var(--purple)',
            borderRadius: 24, padding: '56px 72px',
            textAlign: 'center',
            animation: 'dragPulse 1.2s ease-in-out infinite',
            background: 'rgba(120,80,255,0.06)',
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>⬆️</div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)',
              marginBottom: 8,
            }}>
              Drop files to upload to Kingdom Vault
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              All file types · max 100 MB
            </div>
          </div>
        </div>
      )}

      {/* ── Batch select action bar ─────────────────────────────────────── */}
      {selected.size > 1 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface-2)', border: '1px solid var(--border-bright)',
          borderRadius: 12, boxShadow: '0 -4px 24px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 20px', zIndex: 500,
          animation: 'slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {selected.size} files selected
          </span>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <button
            onClick={() => {
              const targets = files.filter((f) => selected.has(f.id));
              targets.forEach(handleDownload);
            }}
            className="btn btn-ghost"
            style={{ fontSize: '0.8125rem', padding: '5px 14px' }}
          >
            ⬇️ Download all
          </button>
          <button
            onClick={handleDeleteBatch}
            className="btn"
            style={{
              background: 'rgba(231,76,60,0.15)', color: '#e74c3c',
              border: '1px solid rgba(231,76,60,0.3)', fontSize: '0.8125rem', padding: '5px 14px',
            }}
          >
            ❌ Delete all
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="btn btn-ghost"
            style={{ fontSize: '0.8125rem', padding: '5px 10px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Hidden file input ────────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        id="file-input-hidden"
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files) { handleFiles(e.target.files); e.target.value = ''; } }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* ── Portals ──────────────────────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onPreview={handlePreview}
          onDownload={handleDownload}
          onCopyLink={handleCopyLink}
          onDelete={handleDeleteRequest}
        />
      )}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          files={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
