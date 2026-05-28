#!/usr/bin/env npx ts-node
// scripts/ingest-memory.ts
// Kingdom Vault — Embedding Ingestion Worker
//
// Runs as a cron job on the Mac Mini.
// Queries Firestore for memories without embeddings, calls Ollama, writes back.
//
// Usage:
//   npx ts-node scripts/ingest-memory.ts
//
// Environment (set in .env or shell):
//   GOOGLE_APPLICATION_CREDENTIALS — path to Firebase service account JSON
//   FIREBASE_PROJECT_ID            — e.g. "kingdom-vault-prod"
//   OLLAMA_BASE_URL                — default http://localhost:11434
//
// Cron example (Mac Mini LaunchAgent or crontab):
//   */15 * * * * cd /path/to/vault && npx ts-node scripts/ingest-memory.ts >> /var/log/vault-ingest.log 2>&1

import * as admin from 'firebase-admin';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';

// ── Inline embedding logic (avoids Next.js @/* alias in Node context) ────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

async function fetchEmbedding(prompt: string): Promise<number[] | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '<unreadable>');
        log('warn', `Ollama HTTP ${response.status} on attempt ${attempt + 1}: ${body}`);
        if (attempt < MAX_RETRIES - 1) await sleep(backoffMs(attempt));
        continue;
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;
      if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
        log('warn', 'Ollama returned empty embedding');
        return null;
      }
      return data.embedding;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES - 1;
      if (isLast) {
        log('error', `Ollama unreachable after ${MAX_RETRIES} attempts`, err);
        return null;
      }
      log('warn', `Attempt ${attempt + 1} failed, retrying in ${backoffMs(attempt)}ms`);
      await sleep(backoffMs(attempt));
    }
  }
  return null;
}

async function embedMemoryText(content: string, summary?: string): Promise<number[] | null> {
  const parts = [content.trim()];
  if (summary && summary.trim().length > 0) parts.push(summary.trim());
  const combined = parts.join(' ').trim();
  if (combined.length === 0) return null;
  return fetchEmbedding(combined);
}

// ── Logging ──────────────────────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, err?: unknown): void {
  const prefix = `[${new Date().toISOString()}] [ingest-memory] [${level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(`${prefix} ${message}`, err ?? '');
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ── Firestore memory shape (admin-side) ──────────────────────────────────────

interface MemoryDoc {
  content: string;
  summary?: string;
  embedding?: number[] | null;
  [key: string]: unknown;
}

interface IngestStats {
  examined: number;
  embedded: number;
  skipped: number;
  failed: number;
}

// ── Core ingestion logic ─────────────────────────────────────────────────────

/**
 * Process all participants' memories that are missing embeddings.
 * Uses a collectionGroup query — Firestore must have an index for
 * `memories` collectionGroup on the `embedding` field, or we fall back
 * to the soft filter below.
 */
async function ingestMissingEmbeddings(db: Firestore): Promise<IngestStats> {
  const stats: IngestStats = { examined: 0, embedded: 0, skipped: 0, failed: 0 };

  // collectionGroup covers /participants/{id}/memories/{memId}
  // We filter client-side because Firestore can't query "field does not exist"
  // without an expensive inequality; the worker is batch-oriented so this is fine.
  const snapshot = await db.collectionGroup('memories').get();

  log('info', `Found ${snapshot.size} total memory documents across all participants`);

  const toProcess = snapshot.docs.filter((doc) => {
    const data = doc.data() as MemoryDoc;
    return !data.embedding || (Array.isArray(data.embedding) && data.embedding.length === 0);
  });

  log('info', `${toProcess.length} memories require embedding`);

  // Process in batches of 10 to avoid overwhelming Ollama
  const BATCH_SIZE = 10;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    log('info', `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(toProcess.length / BATCH_SIZE)} (${batch.length} docs)`);

    await Promise.all(
      batch.map(async (docSnap) => {
        stats.examined++;
        const data = docSnap.data() as MemoryDoc;
        const ref = docSnap.ref;

        if (!data.content || data.content.trim().length === 0) {
          log('warn', `Memory ${ref.path} has no content — skipping`);
          stats.skipped++;
          return;
        }

        try {
          const vector = await embedMemoryText(data.content, data.summary);

          if (vector === null) {
            log('warn', `Failed to embed ${ref.path} (Ollama returned null)`);
            stats.failed++;
            return;
          }

          await ref.update({
            embedding: vector,
            embeddedAt: FieldValue.serverTimestamp(),
            embeddingModel: EMBED_MODEL,
            embeddingDim: vector.length,
          });

          log('info', `✓ Embedded ${ref.path} (${vector.length}d)`);
          stats.embedded++;
        } catch (err) {
          log('error', `Error processing ${ref.path}`, err);
          stats.failed++;
        }
      }),
    );
  }

  return stats;
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  log('info', '─── Kingdom Vault Embedding Ingestion Worker ───');
  log('info', `Firebase project: ${projectId ?? '(from credentials file)'}`);
  log('info', `Ollama endpoint : ${OLLAMA_BASE_URL}`);

  // Initialise firebase-admin (idempotent)
  if (admin.apps.length === 0) {
    if (credPath) {
      // Explicit service account
      const serviceAccount = (await import(credPath, { assert: { type: 'json' } })).default as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        ...(projectId ? { projectId } : {}),
      });
    } else {
      // Application Default Credentials (e.g. gcloud auth application-default login)
      admin.initializeApp({
        ...(projectId ? { projectId } : {}),
      });
    }
  }

  const db = getFirestore();

  // Health check Ollama before bothering Firestore
  try {
    const tagsRes = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!tagsRes.ok) {
      log('error', `Ollama health check failed: HTTP ${tagsRes.status}. Aborting.`);
      process.exit(1);
    }
    const tags = (await tagsRes.json()) as { models?: Array<{ name: string }> };
    const has = (tags.models ?? []).some((m) => m.name.startsWith(EMBED_MODEL));
    if (!has) {
      log('error', `Model '${EMBED_MODEL}' not loaded in Ollama. Run: ollama pull ${EMBED_MODEL}`);
      process.exit(1);
    }
    log('info', `Ollama healthy — model '${EMBED_MODEL}' confirmed`);
  } catch (err) {
    log('error', 'Cannot reach Ollama. Is it running on the Mac Mini?', err);
    process.exit(1);
  }

  const start = Date.now();
  const stats = await ingestMissingEmbeddings(db);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  log('info', '─── Ingestion complete ───');
  log('info', `Examined : ${stats.examined}`);
  log('info', `Embedded : ${stats.embedded}`);
  log('info', `Skipped  : ${stats.skipped}`);
  log('info', `Failed   : ${stats.failed}`);
  log('info', `Duration : ${elapsed}s`);

  if (stats.failed > 0) {
    process.exit(1); // Signal cron failure for monitoring
  }
}

main().catch((err) => {
  log('error', 'Unhandled fatal error', err);
  process.exit(1);
});
