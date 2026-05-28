// src/lib/hooks/useFiles.ts
// Fetches file metadata from /files/{fileId}
// Real-time via onSnapshot.

'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { HookListResult, KingdomFile } from '@/lib/types';

export function useFiles(): HookListResult<KingdomFile> {
  const [data, setData] = useState<KingdomFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'files'),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const files = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as KingdomFile[];
        setData(files);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        console.error('[useFiles] Firestore error:', err);
        setError(new Error(err.message));
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  return { data, loading, error };
}
