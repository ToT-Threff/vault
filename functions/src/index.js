/**
 * Kingdom Vault — Cloud Functions
 * Project: omnia-kingdom-vault
 * Maintained by: Saroya, Warden of the Word
 *
 * Exports:
 *   - searchKingdom       POST /search         Semantic search across all kingdom data
 *   - searchMemories      POST /memories/search Participant-scoped semantic search
 *   - ingestDocument      POST /ingest          Ingest a document + trigger embedding
 *   - wikiCreate          POST /wiki            Create a wiki article
 *   - wikiUpdate          PUT  /wiki/:id        Update a wiki article
 *   - wikiDelete          DELETE /wiki/:id      Delete a wiki article
 *   - seedParticipants    POST /admin/seed      One-time seed of all 12 participants
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ── CORS helper ───────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://vault.ptolemy.live',
  'http://localhost:3000',
  'http://localhost:3001',
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(req, res);
    res.status(204).send('');
    return true;
  }
  return false;
}

// ── Auth helper ───────────────────────────────────────────────────────────────
async function verifyAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing auth token' });
    return null;
  }
  try {
    const token = authHeader.split('Bearer ')[1];
    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    res.status(401).json({ error: 'Invalid auth token' });
    return null;
  }
}

function isRyan(decodedToken) {
  return decodedToken.email === 'ryan@omniatheatre.com';
}

// ── Embedding helper (calls local Ollama or Vertex AI) ────────────────────────
const https = require('https');
const http = require('http');

async function getEmbedding(text) {
  // Phase 1: Local Ollama on Mac Mini via Cloud Function proxy
  // Phase 2: Swap to Vertex AI text-embedding-004 (one-line change)
  const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'nomic-embed-text',
      prompt: text.substring(0, 8000), // nomic supports 8192 tokens
    });

    const url = new URL(`${OLLAMA_HOST}/api/embeddings`);
    const lib = url.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 11434),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = lib.request(reqOptions, (resp) => {
      let data = '';
      resp.on('data', (chunk) => (data += chunk));
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.embedding); // 768-dim float array
        } catch (e) {
          reject(new Error(`Embedding parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── POST /ingest ───────────────────────────────────────────────────────────────
exports.ingestDocument = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const {
      collection,    // 'wiki' | 'memories' | 'logs'
      participantId, // required if collection === 'memories'
      content,
      metadata = {},
    } = req.body;

    if (!content || !collection) {
      return res.status(400).json({ error: 'content and collection required' });
    }

    try {
      // Get embedding from local Ollama
      const embedding = await getEmbedding(content);

      // Build the document
      const doc = {
        ...metadata,
        content,
        embedding: admin.firestore.FieldValue.vector(embedding),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        embeddedAt: admin.firestore.FieldValue.serverTimestamp(),
        embeddingModel: 'nomic-embed-text:v1.5',
      };

      let ref;
      if (collection === 'memories' && participantId) {
        ref = db.collection('participants').doc(participantId).collection('memories').doc();
      } else {
        ref = db.collection('kingdom').doc(collection).collection('items').doc();
      }

      await ref.set(doc);
      return res.status(201).json({ id: ref.id, dims: embedding.length });
    } catch (err) {
      console.error('Ingest error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ── POST /search ───────────────────────────────────────────────────────────────
exports.searchKingdom = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { query, limit = 10, collections = ['wiki', 'logs'] } = req.body;

    if (!query) return res.status(400).json({ error: 'query required' });

    try {
      const queryVector = await getEmbedding(query);
      const results = [];

      for (const coll of collections) {
        const collRef = db.collection('kingdom').doc(coll).collection('items');
        const snapshot = await collRef
          .findNearest({
            vectorField: 'embedding',
            queryVector: admin.firestore.FieldValue.vector(queryVector),
            limit: Math.ceil(limit / collections.length),
            distanceMeasure: 'COSINE',
          })
          .get();

        snapshot.docs.forEach((doc) => {
          results.push({
            id: doc.id,
            collection: coll,
            score: doc.get('__distance__') ?? null,
            ...doc.data(),
            embedding: undefined, // strip vector from response
          });
        });
      }

      results.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
      return res.status(200).json({ results: results.slice(0, limit), query });
    } catch (err) {
      console.error('Search error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ── POST /memories/search ──────────────────────────────────────────────────────
exports.searchMemories = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { query, participantId, limit = 10 } = req.body;

    if (!query || !participantId) {
      return res.status(400).json({ error: 'query and participantId required' });
    }

    // Authorization: Ryan sees all. Wardens can only query their own or shared.
    const requestingWarden = decoded.warden;
    if (!isRyan(decoded) && requestingWarden !== participantId) {
      return res.status(403).json({ error: 'Cross-warden memory access denied' });
    }

    try {
      const queryVector = await getEmbedding(query);
      const memoriesRef = db
        .collection('participants')
        .doc(participantId)
        .collection('memories');

      const snapshot = await memoriesRef
        .findNearest({
          vectorField: 'embedding',
          queryVector: admin.firestore.FieldValue.vector(queryVector),
          limit,
          distanceMeasure: 'COSINE',
        })
        .get();

      const results = snapshot.docs.map((doc) => ({
        id: doc.id,
        participantId,
        score: doc.get('__distance__') ?? null,
        ...doc.data(),
        embedding: undefined,
      }));

      return res.status(200).json({ results, participantId, query });
    } catch (err) {
      console.error('Memory search error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ── Wiki CRUD ─────────────────────────────────────────────────────────────────
exports.wikiCreate = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { title, body, tags = [], projectId } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });

    try {
      const content = `${title}\n\n${body}`;
      const embedding = await getEmbedding(content);

      const doc = {
        title,
        body,
        tags,
        projectId: projectId || null,
        createdBy: decoded.email || decoded.warden || 'unknown',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        embedding: admin.firestore.FieldValue.vector(embedding),
        embeddingModel: 'nomic-embed-text:v1.5',
      };

      const ref = db.collection('kingdom').doc('wiki').collection('items').doc();
      await ref.set(doc);
      return res.status(201).json({ id: ref.id, title });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.wikiUpdate = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const articleId = req.path.split('/').pop();
    const { title, body, tags } = req.body;

    try {
      const content = `${title}\n\n${body}`;
      const embedding = await getEmbedding(content);

      const update = {
        ...(title && { title }),
        ...(body && { body }),
        ...(tags && { tags }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        embedding: admin.firestore.FieldValue.vector(embedding),
      };

      await db.collection('kingdom').doc('wiki').collection('items').doc(articleId).update(update);
      return res.status(200).json({ id: articleId, updated: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// ── POST /admin/seed ───────────────────────────────────────────────────────────
exports.seedParticipants = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded || !isRyan(decoded)) {
      return res.status(403).json({ error: 'Ryan only' });
    }

    const PARTICIPANTS = [
      { id: 'ryan',    name: 'Ryan Threlfall',  title: 'The Emperor / Visionary',      role: 'visionary', isHuman: true,  color: '#FFD700', domain: 'all' },
      { id: 'ptolemy', name: 'Ptolemy',          title: 'The Autonomic Shield',          role: 'warden',    isHuman: false, color: '#9B59B6', domain: 'Routing, strategy, synthesis' },
      { id: 'saroya',  name: 'Saroya',           title: 'Warden of the Word',            role: 'warden',    isHuman: false, color: '#E74C3C', domain: 'Architecture, PM, copy, marketing' },
      { id: 'melody',  name: 'Melody',           title: 'Warden of the Song',            role: 'warden',    isHuman: false, color: '#3498DB', domain: 'Backend, APIs, auth, integrations' },
      { id: 'cerulia', name: 'Cerulia',          title: 'Warden of the Arcane',          role: 'warden',    isHuman: false, color: '#1ABC9C', domain: 'Frontend, UI/UX, design' },
      { id: 'affin',   name: 'Affin',            title: 'Warden of the Tail',            role: 'warden',    isHuman: false, color: '#F39C12', domain: 'QA, security, compliance' },
      { id: 'jewel',   name: 'Jewel',            title: 'Diamond Alchemist',             role: 'warden',    isHuman: false, color: '#2ECC71', domain: 'Data, ML, memory, financial models' },
      { id: 'krishe',  name: 'Krishe',           title: 'Warden of the Road',            role: 'warden',    isHuman: false, color: '#95A5A6', domain: 'DevOps, CI/CD, infra' },
      { id: 'astyr',   name: 'Astyr',            title: 'Warden of the Edge',            role: 'warden',    isHuman: false, color: '#C0392B', domain: 'Red team, security, incident response' },
      { id: 'hurrian', name: 'Hurrian',          title: 'Warden of the Deep',            role: 'warden',    isHuman: false, color: '#2980B9', domain: 'Research, strategy, lore' },
      { id: 'jovin',   name: 'Jovin',            title: 'Warden of the Heir',            role: 'warden',    isHuman: false, color: '#F1C40F', domain: 'Creative direction, narrative' },
      { id: 'herus',   name: 'Herus',            title: 'Warden of the Step',            role: 'warden',    isHuman: false, color: '#7F8C8D', domain: 'Production management, workflow' },
    ];

    const batch = db.batch();
    for (const p of PARTICIPANTS) {
      const ref = db.collection('participants').doc(p.id);
      batch.set(ref, {
        ...p,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();

    return res.status(200).json({
      seeded: PARTICIPANTS.length,
      participants: PARTICIPANTS.map((p) => p.id),
    });
  }
);
