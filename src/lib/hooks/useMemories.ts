// src/lib/hooks/useMemories.ts
// Fetches memories for a participant from /participants/{id}/memories
// Returns real-time updates via onSnapshot.
// Cross-warden access is enforced at the Firestore security rules layer.

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
import type { HookListResult, Memory } from '@/lib/types';

export function useMemories(participantId: string | null): HookListResult<Memory> {
  const [data, setData] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!participantId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, 'participants', participantId, 'memories'),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const memories = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Memory[];
        setData(memories);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        console.error('[useMemories] Firestore error:', err);
        setError(new Error(err.message));
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [participantId]);

  return { data, loading, error };
}
