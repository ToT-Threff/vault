#!/usr/bin/env node
/**
 * Kingdom Vault — Local Ingest Worker
 * Runs on Mac Mini. Embeds docs with Ollama, writes to Firestore via REST API.
 *
 * Auth: Uses gcloud bearer token — no service account key file needed.
 * Run `gcloud auth login` once, then this script works indefinitely.
 *
 * Usage:
 *   node ingest-worker.js                  # Start polling daemon
 *   node ingest-worker.js --once           # Process all pending, then exit
 *   node ingest-worker.js --bootstrap      # Ingest all bootstrap markdown files
 *
 * Environment:
 *   FIRESTORE_PROJECT=omnia-kingdom-vault  (default)
 *   OLLAMA_HOST=http://localhost:11434      (default)
 *   POLL_INTERVAL_MS=5000                  (default)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync, execFileSync } = require('child_process');

// ── Config ────────────────────────────────────────────────────────────────────
const PROJECT_ID     = process.env.FIRESTORE_PROJECT || 'omnia-kingdom-vault';
const OLLAMA_HOST    = process.env.OLLAMA_HOST       || 'http://localhost:11434';
const POLL_MS        = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const EMBED_MODEL    = 'nomic-embed-text';
const EMBED_DIMS     = 768;
const FS_BASE        = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const args = process.argv.slice(2);
const MODE_ONCE      = args.includes('--once');
const MODE_BOOTSTRAP = args.includes('--bootstrap');

// ── Auth — gcloud bearer token ────────────────────────────────────────────────
function getToken() {
  return execSync('gcloud auth print-access-token', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : undefined;

    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Firestore REST helpers ────────────────────────────────────────────────────
// Convert JS value to Firestore REST value
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean')  return { booleanValue: v };
  if (typeof v === 'number')   return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string')   return { stringValue: v };
  if (Array.isArray(v))        return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (v instanceof Date)       return { timestampValue: v.toISOString() };
  if (v && typeof v === 'object' && v.__type === 'serverTimestamp') {
    return { timestampValue: new Date().toISOString() };
  }
  if (v && typeof v === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v).map(([k, val]) => [k, toFirestoreValue(val)])
        ),
      },
    };
  }
  return { stringValue: String(v) };
}

// Convert JS object to Firestore document fields
function toFields(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, toFirestoreValue(v)])
  );
}

// Convert Firestore value to JS
function fromFirestoreValue(v) {
  if (!v) return null;
  if ('nullValue'      in v) return null;
  if ('booleanValue'   in v) return v.booleanValue;
  if ('integerValue'   in v) return parseInt(v.integerValue);
  if ('doubleValue'    in v) return v.doubleValue;
  if ('stringValue'    in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue'     in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue'       in v) return fromFields(v.mapValue.fields || {});
  return null;
}

function fromFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, fromFirestoreValue(v)])
  );
}

// Write a document (create with auto-id)
async function createDoc(collectionPath, data, token) {
  const url = `${FS_BASE}/${collectionPath}`;
  return request('POST', url, { fields: toFields(data) }, token);
}

// Patch (update specific fields) on a document
async function updateDoc(docPath, data, token) {
  const url = `${FS_BASE}/${docPath}?updateMask.fieldPaths=${Object.keys(data).join('&updateMask.fieldPaths=')}`;
  return request('PATCH', url, { fields: toFields(data) }, token);
}

// Run a Firestore query: collection.where('embedding', '==', null).limit(50)
async function queryNullEmbedding(collectionPath, token) {
  // collectionPath is like 'kingdom/wiki/items' or 'participants/saroya/memories'
  // For runQuery, we POST to the parent document path with the collection as structuredQuery.from
  const parts = collectionPath.split('/');
  const collectionId = parts.pop(); // 'items' or 'memories'
  const parentPath = parts.length > 0 ? parts.join('/') : '';
  const url = parentPath
    ? `${FS_BASE}/${parentPath}:runQuery`
    : `${FS_BASE}:runQuery`;

  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        unaryFilter: {
          field: { fieldPath: 'embedding' },
          op: 'IS_NULL',
        },
      },
      limit: 50,
    },
  };

  const results = await request('POST', url, body, token);
  if (!Array.isArray(results)) return [];
  return results
    .filter((r) => r.document)
    .map((r) => ({
      id: r.document.name.split('/').pop(),
      name: r.document.name,
      path: r.document.name.replace(`projects/${PROJECT_ID}/databases/(default)/documents/`, ''),
      data: fromFields(r.document.fields || {}),
    }));
}

// List sub-collection docs
async function listDocs(collectionPath, token) {
  const url = `${FS_BASE}/${collectionPath}?pageSize=100`;
  const result = await request('GET', url, undefined, token);
  if (!result.documents) return [];
  return result.documents.map((d) => ({
    id: d.name.split('/').pop(),
    path: d.name.replace(`projects/${PROJECT_ID}/databases/(default)/documents/`, ''),
    data: fromFields(d.fields || {}),
  }));
}

// ── Embedding via Ollama ──────────────────────────────────────────────────────
async function embedOnce(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: EMBED_MODEL,
      prompt: text.substring(0, 4000), // nomic-embed-text: 8192 token limit (~4000 safe chars)
    });

    const url = new URL(`${OLLAMA_HOST}/api/embeddings`);
    const lib = url.protocol === 'https:' ? https : http;

    const opts = {
      hostname: url.hostname,
      port: url.port || 11434,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Ollama error: ${parsed.error}`));
          } else if (!parsed.embedding || parsed.embedding.length !== EMBED_DIMS) {
            reject(new Error(`Bad embedding: got ${parsed.embedding?.length ?? 0} dims, expected ${EMBED_DIMS}`));
          } else {
            resolve(parsed.embedding);
          }
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function embed(text, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await embedOnce(text);
    } catch (err) {
      if (i === retries - 1) throw err;
      // Backoff: 800ms, 1600ms
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

// ── Encode vector for Firestore REST ─────────────────────────────────────────
// Firestore REST API vector format:
// { "mapValue": { "fields": { "__type__": { "stringValue": "__vector__" }, "value": { "arrayValue": { "values": [...] } } } } }
function vectorValue(floats) {
  return {
    mapValue: {
      fields: {
        __type__: { stringValue: '__vector__' },
        value: { arrayValue: { values: floats.map((f) => ({ doubleValue: f })) } },
      },
    },
  };
}

// ── Process unembedded docs ───────────────────────────────────────────────────
async function processCollection(collPath, label, token) {
  let docs;
  try {
    docs = await queryNullEmbedding(collPath, token);
  } catch (err) {
    // Collection may not exist yet
    return 0;
  }

  if (docs.length === 0) return 0;

  let count = 0;
  for (const doc of docs) {
    const { title, body, content, summary } = doc.data;
    const text = [title, body, content, summary].filter(Boolean).join('\n\n').trim();

    if (!text) continue;

    try {
      const vector = await embed(text);
      const updateData = {
        embeddedAt: new Date(),
        embeddingModel: `${EMBED_MODEL}:v1.5`,
      };

      // Build the REST PATCH body manually to include the vector field
      const patchUrl = `${FS_BASE}/${doc.path}?updateMask.fieldPaths=embedding&updateMask.fieldPaths=embeddedAt&updateMask.fieldPaths=embeddingModel`;
      await request('PATCH', patchUrl, {
        fields: {
          embedding: vectorValue(vector),
          embeddedAt: { timestampValue: new Date().toISOString() },
          embeddingModel: { stringValue: `${EMBED_MODEL}:v1.5` },
        },
      }, token);

      count++;
      process.stdout.write(`  ✓ ${label}/${doc.id.substring(0, 8)}\n`);
    } catch (err) {
      console.error(`  ✗ ${label}/${doc.id}: ${err.message.substring(0, 80)}`);
    }
  }
  return count;
}

// ── Poll once ─────────────────────────────────────────────────────────────────
async function pollOnce() {
  const token = getToken();
  let total = 0;

  for (const coll of ['wiki', 'logs', 'interactions']) {
    total += await processCollection(`kingdom/${coll}/items`, `kingdom/${coll}`, token);
  }

  let participants = [];
  try {
    participants = await listDocs('participants', token);
  } catch { /* no participants yet */ }

  for (const p of participants) {
    total += await processCollection(`participants/${p.id}/memories`, `${p.id}/memories`, token);
  }

  if (total > 0) {
    console.log(`[${new Date().toISOString()}] Embedded ${total} document(s)`);
  }
  return total;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const BOOTSTRAP_DIRS = [
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Saroya/bootstrap',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/CROSS_WORKSPACE',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/omniland/BOOTSTRAP_OMNILAND',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/omnia-theatre/BOOTSTRAP_OMNIA_THEATRE',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/insain-ngen/BOOTSTRAP_INSAIN_NGEN',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/melodys-metronome/BOOTSTRAP_MELODYS_METRONOME',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/withoutequal/BOOTSTRAP_WITHOUTEQUAL',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/ptolemy-knowledge-base',
];

async function ingestFile(filePath, token) {
  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  const soulMatch = filename.match(/SOUL_(\w+)\.md/i);
  const participantId = soulMatch ? soulMatch[1].toLowerCase() : null;

  const now = new Date().toISOString();
  const doc = {
    title: filename.replace(/\.(md|txt)$/i, '').replace(/_/g, ' '),
    body: content,
    content,
    source: filePath,
    sourceType: 'bootstrap_markdown',
    tags: ['bootstrap', 'kingdom-knowledge'],
    embedding: null,
    createdAt: now,
    updatedAt: now,
    ...(participantId ? { sharedWith: [], participantId } : {}),
  };

  let collPath;
  if (participantId) {
    collPath = `participants/${participantId}/memories`;
    doc.tags.push('soul-document');
  } else {
    collPath = 'kingdom/wiki/items';
  }

  const result = await createDoc(collPath, doc, token);
  return result.name.split('/').pop();
}

async function bootstrap() {
  const token = getToken();
  console.log('🏛️  Kingdom Vault — Bootstrap Ingestion');
  console.log('=========================================\n');

  let total = 0, errors = 0;

  for (const dir of BOOTSTRAP_DIRS) {
    if (!fs.existsSync(dir)) {
      console.log(`  ⚠ Dir not found: ${dir}`);
      continue;
    }

    const allFiles = [];
    function walk(d) {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory() && !f.includes('node_modules') && !f.startsWith('.')) {
          walk(full);
        } else if (stat.isFile() && /\.(md|txt)$/i.test(f)) {
          allFiles.push(full);
        }
      }
    }
    walk(dir);

    console.log(`📁 ${path.basename(dir)} (${allFiles.length} files)`);

    for (const filePath of allFiles) {
      try {
        const id = await ingestFile(filePath, token);
        console.log(`  → ${path.relative(dir, filePath)} (${id.substring(0, 8)})`);
        total++;
      } catch (err) {
        console.error(`  ✗ ${path.basename(filePath)}: ${err.message.substring(0, 80)}`);
        errors++;
      }
    }
    console.log('');
  }

  console.log(`\n✅ Queued ${total} documents (${errors} errors)`);
  console.log('🔄 Starting embedding pass...\n');

  let embedded = 0, passes = 0;
  do {
    embedded = await pollOnce();
    passes++;
  } while (embedded > 0 && passes < 20);

  console.log(`\n🎉 Bootstrap complete! ${passes} pass(es), ${total} documents indexed.`);
}

// ── Entry ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('🏛️  Kingdom Vault Ingest Worker (REST mode)');
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   Ollama:  ${OLLAMA_HOST}`);
  console.log(`   Model:   ${EMBED_MODEL}\n`);

  try {
    await embed('Kingdom Vault connection test');
    console.log('✓ Ollama OK\n');
  } catch (err) {
    console.error('✗ Ollama not reachable:', err.message);
    process.exit(1);
  }

  // Verify gcloud token
  try {
    getToken();
    console.log('✓ gcloud token OK\n');
  } catch (err) {
    console.error('✗ gcloud not authenticated. Run: gcloud auth login');
    process.exit(1);
  }

  if (MODE_BOOTSTRAP) { await bootstrap(); process.exit(0); }
  if (MODE_ONCE)      { await pollOnce(); process.exit(0); }

  console.log(`Polling every ${POLL_MS}ms...\n`);
  await pollOnce();
  setInterval(pollOnce, POLL_MS);
})();
