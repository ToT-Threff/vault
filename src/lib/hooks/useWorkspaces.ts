// src/lib/hooks/useWorkspaces.ts
// Subscribes to kingdom/workspaces/items in Firestore.
// Handles missing collection gracefully (empty array, no error).

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface Workspace {
  id: string;
  name: string;
  repoName: string;
  repoUrl: string;
  localPath?: string;
  subdomain?: string;
  status: 'active' | 'archived' | 'paused';
  projectIds?: string[];
  wardens?: string[];
}

export function useWorkspaces() {
  const [data, setData]       = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<Error | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'kingdom', 'workspaces', 'items'),
      orderBy('name', 'asc'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace)));
        setLoading(false);
        setError(null);
      },
      (err) => {
        // Collection doesn't exist yet — not an error
        setData([]);
        setLoading(false);
        setError(err);
      },
    );

    return unsub;
  }, []);

  return { data, loading, error };
}
