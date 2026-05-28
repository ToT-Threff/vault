// src/lib/hooks/useParticipants.ts
// Fetches all participant documents from /participants/{id}
// Returns real-time updates via onSnapshot.

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
import type { HookListResult, Participant } from '@/lib/types';

export function useParticipants(): HookListResult<Participant> {
  const [data, setData] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'participants'),
      orderBy('name', 'asc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const participants = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Participant[];
        setData(participants);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        console.error('[useParticipants] Firestore error:', err);
        setError(new Error(err.message));
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  return { data, loading, error };
}
