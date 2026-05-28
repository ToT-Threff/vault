// src/lib/hooks/useKingdomStats.ts
// Aggregates counts for the Dashboard stat cards.
// Uses onSnapshot on the collections with count aggregation.
// NOTE: For scale, replace with server-side aggregation or cached counters in a
// /kingdom/stats document. This client-side approach is fine for the current
// single-user Vault scope.

'use client';

import { useEffect, useState } from 'react';
import {
  collection,
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

  useEffect(() => {
    const counts: KingdomStats = {
      totalMemories: 0,
      totalParticipants: 0,
      totalWikiArticles: 0,
      totalFiles: 0,
      totalProjects: 0,
      totalSessions: 0,
    };

    let resolved = 0;
    const TOTAL = 4; // number of collections being watched
    let hasError = false;

    function trySetData(partial: Partial<KingdomStats>) {
      Object.assign(counts, partial);
      resolved++;
      if (resolved >= TOTAL && !hasError) {
        setData({ ...counts });
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

    const unsub1 = onSnapshot(
      query(collection(db, 'participants')),
      (snap) => trySetData({ totalParticipants: snap.size }),
      onError,
    );

    const unsub2 = onSnapshot(
      query(collection(db, 'files')),
      (snap) => {
        if (resolved === 0) resolved--; // allow re-update
        trySetData({ totalFiles: snap.size });
      },
      onError,
    );

    const unsub3 = onSnapshot(
      query(collection(db, 'kingdom', 'wiki', 'items')),
      (snap) => trySetData({ totalWikiArticles: snap.size }),
      onError,
    );

    const unsub4 = onSnapshot(
      query(collection(db, 'kingdom', 'projects', 'items')),
      (snap) => trySetData({ totalProjects: snap.size }),
      onError,
    );

    // Keep stats live even after initial load by re-publishing on any change
    // This is handled naturally by onSnapshot callbacks above.

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, []);

  return { data, loading, error };
}
