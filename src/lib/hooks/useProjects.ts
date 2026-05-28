// src/lib/hooks/useProjects.ts
// Fetches all projects from /kingdom/projects/{projectId}
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
import type { HookListResult, Project } from '@/lib/types';

export function useProjects(): HookListResult<Project> {
  const [data, setData] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Path: /kingdom (collection) → projects (document) → items (subcollection)
    // Consistent with the Cloud Functions kingdom document pattern.
    const q = query(
      collection(db, 'kingdom', 'projects', 'items'),
      orderBy('updatedAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const projects = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Project[];
        setData(projects);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        console.error('[useProjects] Firestore error:', err);
        setError(new Error(err.message));
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  return { data, loading, error };
}
