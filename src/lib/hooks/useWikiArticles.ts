// src/lib/hooks/useWikiArticles.ts
// Fetches wiki articles from /kingdom/wiki/{articleId}
// Supports optional client-side text filter via searchQuery.
// Real-time via onSnapshot.
//
// ⚠️  PATH NOTE FOR AFFIN: The existing firestore.rules uses
// `match /kingdom/wiki/{articleId}` which is a 3-segment path. In Firestore,
// a valid document path requires alternating collection/document segments. This
// hook uses the path: collection('kingdom') → doc('wiki') → collection('articles').
// If the rules intended a different structure, Affin should update the rules and
// Melody should update this path accordingly.

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { HookListResult, WikiArticle } from '@/lib/types';

export function useWikiArticles(searchQuery?: string): HookListResult<WikiArticle> {
  const [rawData, setRawData] = useState<WikiArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Path: /kingdom (collection) → wiki (document) → items (subcollection)
    // Matches the convention used by the wikiCreate Cloud Function (index.js:251)
    // The firestore.rules path /kingdom/wiki/{articleId} maps to this structure.
    const q = query(
      collection(db, 'kingdom', 'wiki', 'items'),
      orderBy('updatedAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const articles = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as WikiArticle[];
        setRawData(articles);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        console.error('[useWikiArticles] Firestore error:', err);
        setError(new Error(err.message));
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  // Client-side filter — Cerulia can replace with vector search later
  const data = useMemo(() => {
    if (!searchQuery?.trim()) return rawData;
    const q = searchQuery.toLowerCase();
    return rawData.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [rawData, searchQuery]);

  return { data, loading, error };
}

