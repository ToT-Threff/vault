// src/lib/search.ts
// Kingdom Vault — Semantic Search (MVP Phase 1)
//
// Phase 1: in-memory cosine similarity over pre-fetched Firestore documents.
// Phase 2 (backlog): BigQuery VECTOR_SEARCH over the embeddings column —
//   see ADR-001 §Phase 2 Backlog for the migration path.

import { embedText } from '@/lib/embedding';

// ── Math helpers ─────────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two equal-length numeric vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 *
 * nomic-embed-text produces unit-normalised vectors, so this is equivalent
 * to a dot product, but we compute it properly for safety.
 *
 * @throws if vectors have different lengths or are zero-length.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: vector dimension mismatch (${a.length} vs ${b.length})`,
    );
  }
  if (a.length === 0) {
    throw new Error('cosineSimilarity: vectors must not be empty');
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ── Semantic search ──────────────────────────────────────────────────────────

/**
 * Score a single document against a query embedding.
 * Returns -Infinity if the document has no valid embedding.
 */
function scoreDocument<T extends { embedding?: number[] | null }>(
  doc: T,
  queryEmbedding: number[],
): number {
  if (!doc.embedding || doc.embedding.length === 0) return -Infinity;
  try {
    return cosineSimilarity(queryEmbedding, doc.embedding);
  } catch {
    return -Infinity;
  }
}

/**
 * Semantic search over an array of documents using cosine similarity.
 *
 * Documents without an `embedding` field are excluded from results.
 * Results are sorted descending by score (most relevant first).
 *
 * @param query  - Natural language query string.
 * @param documents - Array of documents; each may optionally have `embedding`.
 * @param topK  - Maximum number of results to return (default: 10).
 * @returns Filtered, ranked subset of documents with an added `score` field.
 *          Returns an empty array if Ollama is offline (query embedding is null).
 *
 * @example
 * const results = await semanticSearch(
 *   "what did Saroya say about the vault",
 *   memories,
 *   5
 * );
 */
export async function semanticSearch<T extends { embedding?: number[] | null }>(
  query: string,
  documents: T[],
  topK = 10,
): Promise<Array<T & { score: number }>> {
  const queryEmbedding = await embedText(query);

  if (queryEmbedding === null) {
    console.warn(
      '[search] semanticSearch: query embedding failed (Ollama offline?) — returning empty results',
    );
    return [];
  }

  const embeddableDocuments = documents.filter(
    (d) => d.embedding && d.embedding.length > 0,
  );

  if (embeddableDocuments.length === 0) {
    console.warn(
      '[search] semanticSearch: no documents have embeddings yet — run the ingest worker first',
    );
    return [];
  }

  const scored = embeddableDocuments
    .map((doc) => ({
      ...doc,
      score: scoreDocument(doc, queryEmbedding),
    }))
    .filter((doc) => doc.score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
