'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface MarkdownModalProps {
  title: string;
  content: string;
  meta: React.ReactNode;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared inline styles
// ─────────────────────────────────────────────────────────────────────────────

const mdStyles = {
  h1: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--gold)',
    paddingBottom: '0.4em',
    marginTop: '1.5em',
    marginBottom: '0.6em',
  } as React.CSSProperties,
  h2: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '1.15rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginTop: '1.4em',
    marginBottom: '0.5em',
  } as React.CSSProperties,
  h3: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--gold)',
    marginTop: '1.2em',
    marginBottom: '0.4em',
  } as React.CSSProperties,
  p: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.9375rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.75,
    marginBottom: '0.85em',
  } as React.CSSProperties,
  inlineCode: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.85em',
    background: 'var(--surface-2)',
    color: 'var(--teal)',
    padding: '0.15em 0.4em',
    borderRadius: 4,
  } as React.CSSProperties,
  pre: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '14px 18px',
    overflowX: 'auto' as const,
    marginBottom: '1em',
  } as React.CSSProperties,
  preCode: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.8125rem',
    color: 'var(--text-secondary)',
    background: 'transparent',
    padding: 0,
  } as React.CSSProperties,
  blockquote: {
    borderLeft: '3px solid var(--gold)',
    marginLeft: 0,
    paddingLeft: '1em',
    color: 'var(--text-muted)',
    fontStyle: 'italic' as const,
    marginBottom: '0.85em',
  } as React.CSSProperties,
  a: {
    color: 'var(--purple)',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginBottom: '1em',
    fontSize: '0.875rem',
  } as React.CSSProperties,
  th: {
    background: 'var(--surface-2)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    padding: '8px 12px',
    border: '1px solid var(--border)',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  td: {
    padding: '7px 12px',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,
  tdEven: {
    padding: '7px 12px',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    background: 'var(--surface-2)',
  } as React.CSSProperties,
  strong: {
    color: 'var(--text-primary)',
    fontWeight: 600,
  } as React.CSSProperties,
  em: {
    color: 'var(--gold)',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  li: {
    color: 'var(--text-secondary)',
    fontSize: '0.9375rem',
    lineHeight: 1.7,
    marginBottom: '0.25em',
  } as React.CSSProperties,
  ul: {
    paddingLeft: '1.4em',
    marginBottom: '0.85em',
  } as React.CSSProperties,
  ol: {
    paddingLeft: '1.4em',
    marginBottom: '0.85em',
  } as React.CSSProperties,
  hr: {
    border: 'none',
    borderTop: '1px solid var(--border)',
    margin: '1.5em 0',
  } as React.CSSProperties,
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MarkdownModal({ title, content, meta, onClose }: MarkdownModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const modal = (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 800,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      className="backdrop-enter"
    >
      {/* Modal card — stopPropagation to prevent backdrop click closing */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-enter"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-bright)',
          borderRadius: 20,
          maxWidth: 760,
          width: '95%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 0 80px rgba(120,80,255,0.18), 0 32px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Sticky header */}
        <div style={{
          padding: '22px 28px 18px',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          background: 'var(--surface)',
          zIndex: 1,
          flexShrink: 0,
        }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1.3,
            }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '1rem',
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-bright)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              ✕
            </button>
          </div>

          {/* Meta row */}
          {meta && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginTop: 10,
            }}>
              {meta}
            </div>
          )}
        </div>

        {/* Scrollable content area */}
        <div style={{
          overflowY: 'auto',
          padding: '28px 32px',
          flex: 1,
        }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 style={mdStyles.h1}>{children}</h1>,
              h2: ({ children }) => <h2 style={mdStyles.h2}>{children}</h2>,
              h3: ({ children }) => <h3 style={mdStyles.h3}>{children}</h3>,
              p:  ({ children }) => <p  style={mdStyles.p}>{children}</p>,
              ul: ({ children }) => <ul style={mdStyles.ul}>{children}</ul>,
              ol: ({ children }) => <ol style={mdStyles.ol}>{children}</ol>,
              li: ({ children }) => <li style={mdStyles.li}>{children}</li>,
              hr: () => <hr style={mdStyles.hr} />,
              strong: ({ children }) => <strong style={mdStyles.strong}>{children}</strong>,
              em:     ({ children }) => <em     style={mdStyles.em}>{children}</em>,
              blockquote: ({ children }) => (
                <blockquote style={mdStyles.blockquote}>{children}</blockquote>
              ),
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" style={mdStyles.a}>
                  {children}
                </a>
              ),
              table: ({ children }) => <table style={mdStyles.table}>{children}</table>,
              th:    ({ children }) => <th    style={mdStyles.th}>{children}</th>,
              td:    ({ children }) => <td    style={mdStyles.td}>{children}</td>,
              code(props) {
                const { children, className, ...rest } = props;
                const isBlock = String(children).includes('\n');
                return isBlock ? (
                  <pre style={mdStyles.pre}>
                    <code className={className} style={mdStyles.preCode}>
                      {children}
                    </code>
                  </pre>
                ) : (
                  <code style={mdStyles.inlineCode} {...rest}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
