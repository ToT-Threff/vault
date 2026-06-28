// src/lib/hooks/useKingdomStats.ts
// Aggregates counts for the Dashboard stat cards.
// Uses onSnapshot on all relevant collections.
// NOTE: For scale, replace with server-side aggregation or cached counters in a
// /kingdom/stats document. This client-side approach is fine for the current
// single-user Vault scope.

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { HookResult, KingdomStats } from '@/lib/types';

export function useKingdomStats(): HookResult<KingdomStats> {
  const [data, setData] = useState<KingdomStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Use a ref to accumulate counts across multiple snapshot callbacks
  // without causing stale closure issues
  const countsRef = useRef<KingdomStats>({
    totalMemories: 0,
    totalParticipants: 0,
    totalWikiArticles: 0,
    totalFiles: 0,
    totalProjects: 0,
    totalSessions: 0,
  });

  useEffect(() => {
    // Track which collections have reported in for initial loading state
    const reported = new Set<string>();
    const TOTAL_SOURCES = 6;
    let hasError = false;

    function update(field: keyof KingdomStats, value: number, source: string) {
      countsRef.current[field] = value;
      reported.add(source);
      // Always publish the latest counts
      setData({ ...countsRef.current });
      // Clear loading once all sources have reported at least once
      if (reported.size >= TOTAL_SOURCES) {
        setLoading(false);
      }
    }

    function onError(err: FirestoreError) {
      if (!hasError) {
        hasError = true;
        setError(new Error(err.message));
        setLoading(false);
      }
    }

    // 1. Participants
    const unsub1 = onSnapshot(
      query(collection(db, 'participants')),
      (snap) => update('totalParticipants', snap.size, 'participants'),
      onError,
    );

    // 2. Files
    const unsub2 = onSnapshot(
      query(collection(db, 'files')),
      (snap) => update('totalFiles', snap.size, 'files'),
      onError,
    );

    // 3. Wiki articles
    const unsub3 = onSnapshot(
      query(collection(db, 'kingdom', 'wiki', 'items')),
      (snap) => update('totalWikiArticles', snap.size, 'wiki'),
      onError,
    );

    // 4. Projects
    const unsub4 = onSnapshot(
      query(collection(db, 'kingdom', 'projects', 'items')),
      (snap) => update('totalProjects', snap.size, 'projects'),
      onError,
    );

    // 5. Memories — collectionGroup query across all participants
    const unsub5 = onSnapshot(
      query(collectionGroup(db, 'memories')),
      (snap) => update('totalMemories', snap.size, 'memories'),
      onError,
    );

    // 6. Sessions — collectionGroup query across all participants
    const unsub6 = onSnapshot(
      query(collectionGroup(db, 'sessions')),
      (snap) => update('totalSessions', snap.size, 'sessions'),
      onError,
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
    };
  }, []);

  return { data, loading, error };
}

