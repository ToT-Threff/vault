// src/lib/hooks/useSearch.ts
// Kingdom Vault — Global Semantic Search
// Architecture: Client-side embedding (Ollama) + Firestore findNearest (CF)
// The CF cannot reach Ollama (localhost:11434 unreachable from GCP).
// Solution: embed the query client-side, send the vector to the CF.

'use client';

import { useState, useCallback } from 'react';
import { embedText } from '@/lib/embedding';
import { cfUrl } from '@/lib/config';
import { auth } from '@/lib/firebase';

export interface SearchResult {
  id: string;
  collection: string;
  title?: string;
  content?: string;
  summary?: string;
  author?: string;
  score: number | null;
  [key: string]: unknown; // allow extra Firestore fields
}

interface UseSearchReturn {
  results: SearchResult[];
  loading: boolean;
  error: Error | null;
  search: (query: string, options?: SearchOptions) => Promise<void>;
  clear: () => void;
}

interface SearchOptions {
  /** Which kingdom subcollections to search */
  collections?: string[];
  /** Max results to return */
  limit?: number;
}

/**
 * Global semantic search across the Kingdom.
 * 
 * Flow:
 * 1. Embed the query locally via Ollama (nomic-embed-text, 768d)
 * 2. Send the pre-computed vector to searchKingdom CF
 * 3. CF runs findNearest on Firestore vector index
 * 4. Returns ranked results
 * 
 * Fallback: If Ollama is offline, falls back to text-based CF search
 * (which will fail with a clear error, since CF also can't reach Ollama).
 */
export function useSearch(): UseSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(async (query: string, options?: SearchOptions) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      // Step 1: Embed query client-side
      const queryVector = await embedText(trimmed);
      if (!queryVector) {
        throw new Error('Ollama is offline — cannot compute search embedding. Start Ollama and try again.');
      }

      // Step 2: Get auth token
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      const token = await user.getIdToken();

      // Step 3: Send to CF with pre-computed vector
      const response = await fetch(cfUrl('searchKingdom'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: trimmed,
          queryVector, // pre-computed embedding
          collections: options?.collections ?? ['wiki', 'logs', 'files'],
          limit: options?.limit ?? 20,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(body.error || `Search failed: ${response.status}`);
      }

      const data = await response.json();
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, loading, error, search, clear };
}
