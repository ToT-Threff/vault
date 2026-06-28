// src/lib/hooks/useActivity.ts
// Subscribes to recent activity across multiple kingdom collections and
// merges them into a single sorted feed for the Dashboard activity panel.
// Real-time via onSnapshot — one listener per collection.

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { HookListResult } from '@/lib/types';

// ── Activity item shape ────────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  type: 'wiki' | 'file' | 'project';
  title: string;
  warden: string;
  timestamp: Timestamp;
  action: string; // e.g. 'created', 'updated', 'uploaded'
}

// ── Feed spec — which collections to monitor ──────────────────────────────────

interface FeedSource {
  path: string[];           // Firestore collection path segments
  type: ActivityItem['type'];
  sortField: string;
  maxItems: number;
  /** Map a raw Firestore doc into an ActivityItem */
  map: (id: string, data: Record<string, unknown>) => ActivityItem;
}

const FEED_SOURCES: FeedSource[] = [
  {
    path: ['kingdom', 'wiki', 'items'],
    type: 'wiki',
    sortField: 'updatedAt',
    maxItems: 5,
    map: (id, data) => ({
      id,
      type: 'wiki',
      title: (data.title as string) || 'Untitled article',
      warden: (data.author as string) || 'unknown',
      timestamp: data.updatedAt as Timestamp,
      action: 'updated',
    }),
  },
  {
    path: ['files'],
    type: 'file',
    sortField: 'createdAt',
    maxItems: 5,
    map: (id, data) => ({
      id,
      type: 'file',
      title: (data.name as string) || 'Unnamed file',
      warden: (data.uploadedBy as string) || 'unknown',
      timestamp: data.createdAt as Timestamp,
      action: 'uploaded',
    }),
  },
  {
    path: ['kingdom', 'projects', 'items'],
    type: 'project',
    sortField: 'updatedAt',
    maxItems: 5,
    map: (id, data) => ({
      id,
      type: 'project',
      title: (data.name as string) || 'Unnamed project',
      warden: Array.isArray(data.wardens) ? (data.wardens[0] as string) || 'unknown' : 'unknown',
      timestamp: data.updatedAt as Timestamp,
      action: data.createdAt && data.updatedAt &&
        (data.createdAt as Timestamp).seconds === (data.updatedAt as Timestamp).seconds
        ? 'created'
        : 'updated',
    }),
  },
];

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useActivity(): HookListResult<ActivityItem> {
  // One state slot per source so partial loads don't clobber each other
  const [slices, setSlices] = useState<Record<string, ActivityItem[]>>({});
  const [loadingCount, setLoadingCount] = useState(FEED_SOURCES.length);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribes = FEED_SOURCES.map((source) => {
      const sourceKey = source.path.join('/');

      const [firstSegment, ...restSegments] = source.path;

      const q = query(
        collection(db, firstSegment, ...restSegments),
        orderBy(source.sortField, 'desc'),
        limit(source.maxItems),
      );

      return onSnapshot(
        q,
        (snapshot) => {
          const items = snapshot.docs
            .map((doc) => {
              try {
                return source.map(doc.id, doc.data() as Record<string, unknown>);
              } catch {
                return null;
              }
            })
            .filter((item): item is ActivityItem => item !== null && item.timestamp != null);

          setSlices((prev) => ({ ...prev, [sourceKey]: items }));
          setLoadingCount((prev) => Math.max(0, prev - 1));
          setError(null);
        },
        (err: FirestoreError) => {
          console.error(`[useActivity] Firestore error on ${sourceKey}:`, err);
          setError(new Error(err.message));
          setLoadingCount((prev) => Math.max(0, prev - 1));
        },
      );
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, []);

  // Merge all slices and sort by timestamp descending
  const data = useMemo(() => {
    const merged = Object.values(slices).flat();
    merged.sort((a, b) => {
      const aTime = a.timestamp?.seconds ?? 0;
      const bTime = b.timestamp?.seconds ?? 0;
      return bTime - aTime;
    });
    return merged;
  }, [slices]);

  return {
    data,
    loading: loadingCount > 0,
    error,
  };
}
