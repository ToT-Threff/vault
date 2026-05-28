/**
 * Kingdom Vault — Cloud Functions (Gen 1)
 * Project: omnia-kingdom-vault
 * Maintained by: Saroya, Warden of the Word
 *
 * Using Gen 1 (functions/v1) to avoid org policy build SA restrictions.
 *
 * Exports:
 *   - searchKingdom       POST /searchKingdom      Semantic search across kingdom
 *   - searchMemories      POST /searchMemories     Participant-scoped semantic search
 *   - ingestDocument      POST /ingestDocument     Ingest a document
 *   - wikiCreate          POST /wikiCreate         Create a wiki article
 *   - wikiUpdate          POST /wikiUpdate         Update a wiki article
 *   - seedParticipants    POST /seedParticipants   One-time seed of all 12 participants
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const https = require('https');
const http = require('http');

admin.initializeApp();
const db = admin.firestore();

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://vault.ptolemy.live',
  'https://omnia-kingdom-vault.web.app',
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
  if (req.method === 'OPTIONS') { setCors(req, res); res.status(204).send(''); return true; }
  return false;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function verifyAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing auth token' }); return null;
  }
  try {
    return await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
  } catch {
    res.status(401).json({ error: 'Invalid auth token' }); return null;
  }
}

function isRyan(t) { return t.email === 'ryan@omniatheatre.com'; }

// ── Embedding (local Ollama on Mac Mini) ──────────────────────────────────────
// Note: Cloud Functions can't reach localhost. This is a placeholder that
// will be swapped to Vertex AI text-embedding-004 in Phase 2.
// For now the ingest worker handles all embeddings locally.
async function getEmbedding(text) {
  const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://10.0.0.1:11434'; // Mac Mini LAN IP

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'nomic-embed-text',
      prompt: text.substring(0, 4000),
    });

    const url = new URL(`${OLLAMA_HOST}/api/embeddings`);
    const lib = url.protocol === 'https:' ? https : http;

    const opts = {
      hostname: url.hostname,
      port: url.port || 11434,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };

    const req = lib.request(opts, (resp) => {
      let data = '';
      resp.on('data', (c) => (data += c));
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error));
          else resolve(parsed.embedding);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Firestore vector FieldValue helper
function vectorValue(floats) {
  return admin.firestore.FieldValue.vector(floats);
}

// ── POST /searchKingdom ───────────────────────────────────────────────────────
exports.searchKingdom = functions
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
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
            queryVector: vectorValue(queryVector),
            limit: Math.ceil(limit / collections.length),
            distanceMeasure: 'COSINE',
          })
          .get();

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          delete data.embedding;
          results.push({ id: doc.id, collection: coll, score: doc.get('__distance__') ?? null, ...data });
        });
      }

      results.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
      return res.status(200).json({ results: results.slice(0, limit), query });
    } catch (err) {
      console.error('Search error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

// ── POST /searchMemories ──────────────────────────────────────────────────────
exports.searchMemories = functions
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { query, participantId, limit = 10 } = req.body;
    if (!query || !participantId) return res.status(400).json({ error: 'query and participantId required' });

    if (!isRyan(decoded) && decoded.warden !== participantId) {
      return res.status(403).json({ error: 'Cross-warden memory access denied' });
    }

    try {
      const queryVector = await getEmbedding(query);
      const memoriesRef = db.collection('participants').doc(participantId).collection('memories');

      const snapshot = await memoriesRef
        .findNearest({
          vectorField: 'embedding',
          queryVector: vectorValue(queryVector),
          limit,
          distanceMeasure: 'COSINE',
        })
        .get();

      const results = snapshot.docs.map((doc) => {
        const data = doc.data();
        delete data.embedding;
        return { id: doc.id, participantId, score: doc.get('__distance__') ?? null, ...data };
      });

      return res.status(200).json({ results, participantId, query });
    } catch (err) {
      console.error('Memory search error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

// ── POST /ingestDocument ──────────────────────────────────────────────────────
exports.ingestDocument = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { collection, participantId, content, metadata = {} } = req.body;
    if (!content || !collection) return res.status(400).json({ error: 'content and collection required' });

    // VAULT-HIGH-02: Admin SDK bypasses Firestore rules — enforce caller auth here.
    // Memory writes require: caller is Ryan (emperor) OR the participant themselves.
    if (collection === 'memories' && participantId) {
      const isEmperor = decoded.email === 'ryan@omniatheatre.com' || decoded.emperor === true;
      const isSelf = decoded.warden === participantId;
      if (!isEmperor && !isSelf) {
        return res.status(403).json({
          error: `Not authorized to ingest memories for participant '${participantId}'`,
        });
      }
    }

    try {
      const embedding = await getEmbedding(content);
      const doc = {
        ...metadata, content,
        embedding: vectorValue(embedding),
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
  });


// ── POST /wikiCreate ──────────────────────────────────────────────────────────
exports.wikiCreate = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { title, body, tags = [], projectId } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });

    try {
      const embedding = await getEmbedding(`${title}\n\n${body}`);
      const ref = db.collection('kingdom').doc('wiki').collection('items').doc();
      await ref.set({
        title, body, tags, projectId: projectId || null,
        createdBy: decoded.email || decoded.warden || 'unknown',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        embedding: vectorValue(embedding),
        embeddingModel: 'nomic-embed-text:v1.5',
      });
      return res.status(201).json({ id: ref.id, title });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

// ── POST /wikiUpdate ──────────────────────────────────────────────────────────
exports.wikiUpdate = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { articleId, title, body, tags } = req.body;
    if (!articleId) return res.status(400).json({ error: 'articleId required' });

    try {
      const embedding = await getEmbedding(`${title}\n\n${body}`);
      const update = {
        ...(title && { title }), ...(body && { body }), ...(tags && { tags }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        embedding: vectorValue(embedding),
      };
      await db.collection('kingdom').doc('wiki').collection('items').doc(articleId).update(update);
      return res.status(200).json({ id: articleId, updated: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

// ── POST /seedParticipants ────────────────────────────────────────────────────
exports.seedParticipants = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded || !isRyan(decoded)) return res.status(403).json({ error: 'Ryan only' });

    const PARTICIPANTS = [
      { id: 'ryan',    name: 'Ryan Threlfall', title: 'The Emperor / Visionary',   role: 'visionary', isHuman: true,  color: '#FFD700' },
      { id: 'ptolemy', name: 'Ptolemy',        title: 'The Autonomic Shield',       role: 'warden',    isHuman: false, color: '#9B59B6' },
      { id: 'saroya',  name: 'Saroya',         title: 'Warden of the Word',         role: 'warden',    isHuman: false, color: '#E74C3C' },
      { id: 'melody',  name: 'Melody',         title: 'Warden of the Song',         role: 'warden',    isHuman: false, color: '#3498DB' },
      { id: 'cerulia', name: 'Cerulia',        title: 'Warden of the Arcane',       role: 'warden',    isHuman: false, color: '#1ABC9C' },
      { id: 'affin',   name: 'Affin',          title: 'Warden of the Tail',         role: 'warden',    isHuman: false, color: '#F39C12' },
      { id: 'jewel',   name: 'Jewel',          title: 'Diamond Alchemist',          role: 'warden',    isHuman: false, color: '#2ECC71' },
      { id: 'krishe',  name: 'Krishe',         title: 'Warden of the Road',         role: 'warden',    isHuman: false, color: '#95A5A6' },
      { id: 'astyr',   name: 'Astyr',          title: 'Warden of the Edge',         role: 'warden',    isHuman: false, color: '#C0392B' },
      { id: 'hurrian', name: 'Hurrian',        title: 'Warden of the Deep',         role: 'warden',    isHuman: false, color: '#2980B9' },
      { id: 'jovin',   name: 'Jovin',          title: 'Warden of the Heir',         role: 'warden',    isHuman: false, color: '#F1C40F' },
      { id: 'herus',   name: 'Herus',          title: 'Warden of the Step',         role: 'warden',    isHuman: false, color: '#7F8C8D' },
    ];

    const batch = db.batch();
    for (const p of PARTICIPANTS) {
      batch.set(db.collection('participants').doc(p.id), {
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
  });

// ── VAULT-CRIT-01 — Custom Claims Layer ───────────────────────────────────────
// These two functions are the ONLY mechanism for setting Firebase custom claims.
// Without them, isWarden() and the cross-warden memory gates silently deny all.
// ─────────────────────────────────────────────────────────────────────────────

// Valid warden IDs — hard allowlist, not database-driven, to prevent privilege escalation
const VALID_WARDEN_IDS = new Set([
  'ryan', 'saroya', 'melody', 'cerulia', 'affin', 'jewel',
  'krishe', 'astyr', 'hurrian', 'jovin', 'herus', 'ptolemy-rh', 'ptolemy-lh',
]);

const EMPEROR_EMAIL = 'ryan@omniatheatre.com';

/**
 * setWardenClaim — onCall
 *
 * Assigns a `warden` custom claim to a Firebase user.
 * CALLER MUST BE Ryan (ryan@omniatheatre.com).
 *
 * Call from client:
 *   const fn = httpsCallable(functions, 'setWardenClaim');
 *   await fn({ uid: '<warden-uid>', wardenId: 'melody' });
 *   await auth.currentUser.getIdToken(true); // force refresh
 *
 * Claim set on target user: { warden: 'melody' }
 */
exports.setWardenClaim = functions
  .runWith({ memory: '128MB', timeoutSeconds: 15 })
  .https.onCall(async (data, context) => {
    // Only Ryan may assign warden claims
    if (!context.auth || context.auth.token.email !== EMPEROR_EMAIL) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only the Emperor may assign warden claims.',
      );
    }

    const { uid, wardenId } = data;

    if (!uid || typeof uid !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'uid is required');
    }

    if (!wardenId || !VALID_WARDEN_IDS.has(wardenId)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `wardenId must be one of: ${[...VALID_WARDEN_IDS].join(', ')}`,
      );
    }

    try {
      await admin.auth().setCustomUserClaims(uid, { warden: wardenId });
      console.log(`[setWardenClaim] Set warden=${wardenId} for uid=${uid} (by ${context.auth.token.email})`);
      return { success: true, uid, wardenId };
    } catch (err) {
      console.error('[setWardenClaim] Failed:', err);
      throw new functions.https.HttpsError('internal', `Failed to set claim: ${err.message}`);
    }
  });

/**
 * initEmperorClaim — Auth onCreate trigger
 *
 * Fires when any user first signs into Firebase Auth.
 * If the new user is Ryan (ryan@omniatheatre.com), immediately sets { emperor: true }
 * so isRyan() rules function correctly on first session.
 *
 * Client must call getIdToken(true) after sign-in to get the updated token.
 * The auth-context.tsx onAuthStateChanged flow handles this naturally on
 * subsequent requests once the token TTL refreshes (~1 hour).
 *
 * Note: For immediate effect, the client can call getIdToken(true) explicitly
 * after signInWithPopup() resolves. See auth-context.tsx signIn().
 */
exports.initEmperorClaim = functions.auth.user().onCreate(async (user) => {
  if (user.email === EMPEROR_EMAIL) {
    try {
      await admin.auth().setCustomUserClaims(user.uid, { emperor: true });
      console.log(`[initEmperorClaim] Set emperor=true for ${user.email} (uid=${user.uid})`);
    } catch (err) {
      console.error('[initEmperorClaim] Failed to set emperor claim:', err);
    }
  }
});

