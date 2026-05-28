'use client';
// src/components/AuthGate.tsx
// Guards all app content behind Firebase Auth.
// Shows a loading spinner while auth state is resolving,
// then renders LoginScreen or children depending on auth state.

import { useAuth } from '@/lib/auth-context';
import LoginScreen from '@/components/LoginScreen';
import type { ReactNode } from 'react';

interface AuthGateProps {
  children: ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'var(--obsidian)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 20,
      }}>
        {/* Logo mark */}
        <div style={{
          width: 48,
          height: 48,
          background: 'linear-gradient(135deg, var(--purple), var(--gold))',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          animation: 'pulse-glow 2s ease-in-out infinite',
        }}>
          ⚡
        </div>
        <p style={{
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Initialising Kingdom Vault…
        </p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}
