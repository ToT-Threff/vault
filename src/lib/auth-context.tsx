'use client';
// src/lib/auth-context.tsx
// Kingdom Vault — Firebase Auth context
// Google Sign-In only. Ryan (ryan@omniatheatre.com) is the sole authorized user.
// Uses signInWithPopup — simpler and reliable now that vault.ptolemy.live is in Firebase authorized domains.
// Falls back to signInWithRedirect if popup is blocked.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ── Auth user shape ────────────────────────────────────────────────────────────

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

// ── Context type ───────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

// No hd restriction — access control enforced at Firestore rules layer via custom claims.
const googleProvider = new GoogleAuthProvider();

function mapFirebaseUser(firebaseUser: User): AuthUser {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    displayName: firebaseUser.displayName ?? '',
    photoURL: firebaseUser.photoURL,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChanged is the single source of truth for auth state.
    // With popup auth, no redirect result processing needed — Firebase updates
    // auth state directly when the popup completes.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    try {
      // Popup auth: opens a Google sign-in window. Works reliably on authorized domains.
      // vault.ptolemy.live must be in Firebase Console → Authentication → Authorized domains.
      const result = await signInWithPopup(auth, googleProvider);
      // Force token refresh so custom claims (emperor, warden) are immediately available.
      await result.user.getIdToken(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      // If popup is blocked, fall back to redirect
      if (code === 'auth/popup-blocked' || code === 'auth/popup-cancelled-before-signin') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      // Re-throw so LoginScreen can display the error
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.error('[AuthProvider] signOut failed:', err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be used inside <AuthProvider>');
  }
  return ctx;
}
