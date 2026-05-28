// src/lib/embedding.ts
// Kingdom Vault — Ollama Embedding Service
// Model: nomic-embed-text (768-dim)
// Endpoint: http://localhost:11434 (Mac Mini local)
//
// Graceful degradation: if Ollama is unreachable, functions return null
// and log a warning rather than throwing — callers must handle null.

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff helper.
 * attempt is 0-indexed: 0 → BASE_DELAY_MS, 1 → 2×, 2 → 4×
 */
function backoffMs(attempt: number): number {
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * POST to Ollama /api/embeddings with retry + exponential backoff.
 * Returns the raw embedding array, or null on failure.
 */
async function fetchEmbedding(prompt: string): Promise<number[] | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt }),
        // Node 18+ fetch supports signal; give each attempt 30 s
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '<unreadable>');
        console.warn(
          `[embedding] Ollama HTTP ${response.status} on attempt ${attempt + 1}: ${body}`,
        );
        if (attempt < MAX_RETRIES - 1) {
          await sleep(backoffMs(attempt));
        }
        continue;
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;

      if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
        console.warn('[embedding] Ollama returned empty embedding array');
        return null;
      }

      return data.embedding;
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      if (isLastAttempt) {
        console.warn(
          `[embedding] Ollama unreachable after ${MAX_RETRIES} attempts — degrading gracefully.`,
          err instanceof Error ? err.message : err,
        );
        return null;
      }
      console.warn(
        `[embedding] Attempt ${attempt + 1} failed, retrying in ${backoffMs(attempt)}ms…`,
        err instanceof Error ? err.message : err,
      );
      await sleep(backoffMs(attempt));
    }
  }
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Embed a raw text string using nomic-embed-text.
 *
 * @param text - The text to embed. Should be meaningful; empty strings return null.
 * @returns 768-dimensional embedding vector, or null if Ollama is unavailable.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    console.warn('[embedding] embedText called with empty string — returning null');
    return null;
  }
  return fetchEmbedding(trimmed);
}

/**
 * Embed a Vault memory document.
 * Concatenates `content` and optional `summary` for a richer embedding signal.
 *
 * @param memory - Object with at least `content`, and optional `summary`.
 * @returns 768-dimensional embedding vector, or null if Ollama is unavailable.
 */
export async function embedMemory(
  memory: { content: string; summary?: string },
): Promise<number[] | null> {
  const parts: string[] = [memory.content.trim()];
  if (memory.summary && memory.summary.trim().length > 0) {
    parts.push(memory.summary.trim());
  }
  const combined = parts.join(' ');
  return embedText(combined);
}

/**
 * Health check: confirms Ollama is reachable and has the embed model loaded.
 * Hits GET /api/tags and checks that nomic-embed-text appears in the model list.
 *
 * @returns true if healthy, false otherwise.
 */
export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      console.warn(`[embedding] Ollama health check HTTP ${response.status}`);
      return false;
    }

    const data = (await response.json()) as {
      models?: Array<{ name: string }>;
    };

    const models = data.models ?? [];
    const hasModel = models.some((m) => m.name.startsWith(EMBED_MODEL));

    if (!hasModel) {
      console.warn(
        `[embedding] Ollama is running but model '${EMBED_MODEL}' not found. ` +
          `Available: ${models.map((m) => m.name).join(', ') || '(none)'}`,
      );
    }

    return hasModel;
  } catch (err) {
    console.warn(
      '[embedding] Ollama health check failed — service unreachable.',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
