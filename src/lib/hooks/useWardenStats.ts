// src/lib/hooks/useWardenStats.ts
// Per-warden statistics for Analytics page.
// Queries each participant's memories subcollection for counts.

'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, type FirestoreError } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ALL_WARDEN_IDS } from '@/lib/constants';
import type { Participant } from '@/lib/types';

export interface WardenStat {
  wardenId: string;
  name: string;
  memoryCount: number;
  color: string;
}

interface UseWardenStatsReturn {
  data: WardenStat[];
  loading: boolean;
  error: Error | null;
  maxMemories: number;
}

export function useWardenStats(): UseWardenStatsReturn {
  const [data, setData] = useState<WardenStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [maxMemories, setMaxMemories] = useState(1);

  useEffect(() => {
    // Step 1: Get participants to know names and colors
    const unsub = onSnapshot(
      query(collection(db, 'participants')),
      async (snap) => {
        const participants = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Participant[];

        // Step 2: Count memories per participant by subscribing to subcollections
        const stats: WardenStat[] = [];
        const memoryCounts = new Map<string, number>();
        let completed = 0;

        // Set up snapshot listeners for each participant's memories
        const unsubMemories: (() => void)[] = [];

        for (const p of participants) {
          const memRef = collection(db, 'participants', p.id, 'memories');
          const unsub = onSnapshot(
            query(memRef),
            (memSnap) => {
              memoryCounts.set(p.id, memSnap.size);
              completed++;
              
              // When all participants have reported, publish stats
              if (completed >= participants.length) {
                const newStats = participants.map((pp) => ({
                  wardenId: pp.id,
                  name: pp.name,
                  memoryCount: memoryCounts.get(pp.id) ?? 0,
                  color: pp.color,
                }));
                
                const max = Math.max(...newStats.map((s) => s.memoryCount), 1);
                setData(newStats.sort((a, b) => b.memoryCount - a.memoryCount));
                setMaxMemories(max);
                setLoading(false);
              }
            },
            (err: FirestoreError) => {
              console.warn(`[useWardenStats] Failed to read memories for ${p.id}:`, err.message);
              memoryCounts.set(p.id, 0);
              completed++;
            },
          );
          unsubMemories.push(unsub);
        }

        // Return cleanup for memory listeners
        return () => unsubMemories.forEach((u) => u());
      },
      (err: FirestoreError) => {
        setError(new Error(err.message));
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  return { data, loading, error, maxMemories };
}
