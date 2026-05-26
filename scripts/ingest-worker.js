#!/usr/bin/env node
/**
 * Kingdom Vault — Local Ingest Worker
 * Runs on Mac Mini. Processes unembedded documents and calls Ollama.
 *
 * Usage:
 *   node ingest-worker.js                  # Start polling daemon
 *   node ingest-worker.js --once           # Process all pending, then exit
 *   node ingest-worker.js --bootstrap      # Ingest all bootstrap markdown files
 *
 * Environment:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
 *   OLLAMA_HOST=http://localhost:11434      (default)
 *   FIRESTORE_PROJECT=omnia-kingdom-vault  (default)
 *   POLL_INTERVAL_MS=5000                  (default)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ── Init ───────────────────────────────────────────────────────────────────────
const PROJECT_ID = process.env.FIRESTORE_PROJECT || 'omnia-kingdom-vault';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_DIMS = 768;

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const args = process.argv.slice(2);
const MODE_ONCE = args.includes('--once');
const MODE_BOOTSTRAP = args.includes('--bootstrap');

// ── Embedding ──────────────────────────────────────────────────────────────────
async function embed(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text.substring(0, 8000),
    });

    const url = new URL(`${OLLAMA_HOST}/api/embeddings`);
    const lib = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || 11434,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (!parsed.embedding || parsed.embedding.length !== EMBEDDING_DIMS) {
          reject(new Error(`Bad embedding: got ${parsed.embedding?.length} dims, expected ${EMBEDDING_DIMS}`));
        } else {
          resolve(parsed.embedding);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Process a single collection of unembedded docs ────────────────────────────
async function processCollection(collRef, label) {
  const snap = await collRef.where('embedding', '==', null).limit(50).get();
  if (snap.empty) return 0;

  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const text = [data.title, data.body, data.content, data.summary]
      .filter(Boolean)
      .join('\n\n');

    if (!text.trim()) {
      await doc.ref.update({ embedding: admin.firestore.FieldValue.delete() });
      continue;
    }

    try {
      const vector = await embed(text);
      await doc.ref.update({
        embedding: admin.firestore.FieldValue.vector(vector),
        embeddedAt: admin.firestore.FieldValue.serverTimestamp(),
        embeddingModel: `${EMBEDDING_MODEL}:v1.5`,
      });
      count++;
      process.stdout.write(`  ✓ ${label}/${doc.id.substring(0, 8)}\n`);
    } catch (err) {
      console.error(`  ✗ ${label}/${doc.id}: ${err.message}`);
    }
  }
  return count;
}

// ── Poll loop ──────────────────────────────────────────────────────────────────
async function pollOnce() {
  let total = 0;

  // Kingdom collections
  for (const coll of ['wiki', 'logs', 'interactions']) {
    const ref = db.collection('kingdom').doc(coll).collection('items');
    total += await processCollection(ref, `kingdom/${coll}`);
  }

  // All participant memories
  const participants = await db.collection('participants').get();
  for (const pDoc of participants.docs) {
    const memoriesRef = pDoc.ref.collection('memories');
    total += await processCollection(memoriesRef, `${pDoc.id}/memories`);
  }

  if (total > 0) {
    console.log(`[${new Date().toISOString()}] Embedded ${total} documents`);
  }

  return total;
}

// ── Bootstrap ingestion ────────────────────────────────────────────────────────
const BOOTSTRAP_DIRS = [
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Saroya/bootstrap',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/CROSS_WORKSPACE',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/omniland/BOOTSTRAP_OMNILAND/team_intel',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/omnia-theatre/BOOTSTRAP_OMNIA_THEATRE/team_intel',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/insain-ngen/BOOTSTRAP_INSAIN_NGEN',
  '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/omniland',
];

async function ingestFile(filePath, metadata = {}) {
  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);

  // Determine participant from file name (SOUL_saroya.md → saroya)
  const soulMatch = filename.match(/SOUL_(\w+)\.md/i);
  const participantId = soulMatch ? soulMatch[1].toLowerCase() : null;

  const doc = {
    title: filename.replace('.md', '').replace(/_/g, ' '),
    body: content,
    content,
    source: filePath,
    sourceType: 'bootstrap_markdown',
    tags: ['bootstrap', 'kingdom-knowledge'],
    projectId: metadata.projectId || null,
    embedding: null, // will be filled by pollOnce()
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...metadata,
  };

  let ref;
  if (participantId) {
    // Soul docs go into the participant's memories
    ref = db.collection('participants').doc(participantId).collection('memories').doc();
    doc.tags.push('soul-document', participantId);
    doc.sharedWith = []; // Soul docs are private to that warden
  } else {
    // Everything else goes into kingdom/wiki
    ref = db.collection('kingdom').doc('wiki').collection('items').doc();
  }

  await ref.set(doc);
  return ref.id;
}

async function bootstrap() {
  console.log('🏛️  Kingdom Vault — Bootstrap Ingestion');
  console.log('=========================================\n');

  let total = 0;
  let errors = 0;

  for (const dir of BOOTSTRAP_DIRS) {
    if (!fs.existsSync(dir)) {
      console.log(`  ⚠ Dir not found: ${dir}`);
      continue;
    }

    const files = fs.readdirSync(dir, { recursive: true })
      .filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
      .filter((f) => !f.includes('node_modules'));

    console.log(`📁 ${dir} (${files.length} files)`);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (!fs.statSync(fullPath).isFile()) continue;

      try {
        const id = await ingestFile(fullPath);
        console.log(`  → Queued: ${file} (${id.substring(0, 8)})`);
        total++;
      } catch (err) {
        console.error(`  ✗ Failed: ${file}: ${err.message}`);
        errors++;
      }
    }
    console.log('');
  }

  console.log(`\n✅ Queued ${total} documents (${errors} errors)`);
  console.log('🔄 Starting embedding pass...\n');

  // Now embed everything we just queued
  let embedded = 0;
  let passes = 0;
  do {
    embedded = await pollOnce();
    passes++;
  } while (embedded > 0 && passes < 20);

  console.log(`\n🎉 Bootstrap complete! ${passes} embedding pass(es) done.`);
  console.log('The kingdom\'s knowledge is now searchable.');
}

// ── Entry point ────────────────────────────────────────────────────────────────
(async () => {
  console.log(`🏛️  Kingdom Vault Ingest Worker`);
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   Ollama:  ${OLLAMA_HOST}`);
  console.log(`   Model:   ${EMBEDDING_MODEL}\n`);

  // Verify Ollama is reachable
  try {
    await embed('Kingdom Vault connection test');
    console.log('✓ Ollama connection OK\n');
  } catch (err) {
    console.error('✗ Ollama not reachable:', err.message);
    console.error('  Make sure Ollama is running: ollama serve');
    process.exit(1);
  }

  if (MODE_BOOTSTRAP) {
    await bootstrap();
    process.exit(0);
  }

  if (MODE_ONCE) {
    await pollOnce();
    process.exit(0);
  }

  // Daemon mode — poll continuously
  console.log(`Polling every ${POLL_MS}ms for unembedded documents...\n`);
  setInterval(pollOnce, POLL_MS);
  await pollOnce(); // immediate first pass
})();
