'use client';
// src/components/LoginScreen.tsx
// Kingdom Vault — Login screen
// Rendered when auth state is unauthenticated.
// Design: matches vault's dark obsidian/gold/purple aesthetic from globals.css.

import { useAuth } from '@/lib/auth-context';
import { useState } from 'react';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setSigning(true);
    setError(null);
    try {
      await signIn();
    } catch {
      setError('Sign-in failed. Ensure you are using an authorized account.');
      setSigning(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--obsidian)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow orbs */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 600,
        height: 600,
        background: 'radial-gradient(circle, rgba(120,80,255,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '10%',
        width: 400,
        height: 400,
        background: 'radial-gradient(circle, rgba(212,168,67,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Login card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-bright)',
        borderRadius: 'var(--radius-lg)',
        padding: '48px 40px',
        maxWidth: 420,
        width: '100%',
        boxShadow: 'var(--shadow-card), var(--glow-purple)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo mark */}
        <div style={{
          width: 56,
          height: 56,
          background: 'linear-gradient(135deg, var(--purple), var(--gold))',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          color: 'white',
          marginBottom: 24,
          boxShadow: '0 0 32px rgba(120,80,255,0.4)',
        }}>
          ⚡
        </div>

        {/* Wordmark */}
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '1.625rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          textAlign: 'center',
          marginBottom: 6,
        }}>
          Kingdom Vault
        </h1>

        <p style={{
          fontSize: '0.75rem',
          color: 'var(--gold)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 8,
        }}>
          vault.ptolemy.live
        </p>

        <p style={{
          fontSize: '0.875rem',
          color: 'var(--text-muted)',
          textAlign: 'center',
          marginBottom: 36,
          lineHeight: 1.6,
        }}>
          The sovereign nervous system of the Ptolemy Kingdom.
          Authorized access only.
        </p>

        {/* Divider */}
        <div style={{
          width: '100%',
          height: 1,
          background: 'var(--border)',
          marginBottom: 28,
        }} />

        {/* Sign-in button */}
        <button
          onClick={handleSignIn}
          disabled={signing}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '12px 24px',
            background: signing
              ? 'var(--surface-2)'
              : 'linear-gradient(135deg, var(--purple), #5030cc)',
            border: '1px solid',
            borderColor: signing ? 'var(--border)' : 'transparent',
            borderRadius: 100,
            color: 'white',
            fontFamily: "'Inter', sans-serif",
            fontSize: '0.9375rem',
            fontWeight: 600,
            cursor: signing ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-med)',
            boxShadow: signing ? 'none' : '0 4px 20px rgba(120,80,255,0.4)',
            opacity: signing ? 0.7 : 1,
          }}
          aria-busy={signing}
          aria-label="Sign in with Google"
        >
          {/* Google logo SVG */}
          {!signing && (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#ffffff"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="rgba(255,255,255,0.8)"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="rgba(255,255,255,0.6)"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="rgba(255,255,255,0.7)"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}

          {signing ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SpinnerIcon />
              Signing in…
            </span>
          ) : (
            'Sign in with Google'
          )}
        </button>

        {/* Error message */}
        {error && (
          <p style={{
            marginTop: 16,
            fontSize: '0.8125rem',
            color: 'var(--crimson)',
            textAlign: 'center',
            padding: '10px 16px',
            background: 'rgba(231,76,60,0.08)',
            border: '1px solid rgba(231,76,60,0.2)',
            borderRadius: 'var(--radius-sm)',
            width: '100%',
          }}>
            {error}
          </p>
        )}

        {/* Footer note */}
        <p style={{
          marginTop: 28,
          fontSize: '0.6875rem',
          color: 'var(--text-muted)',
          textAlign: 'center',
          letterSpacing: '0.04em',
        }}>
          SPECTRE · Ptolemy Kingdom · Authorized access only
        </p>
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      style={{
        animation: 'spin 0.8s linear infinite',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
