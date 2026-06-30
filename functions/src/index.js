/**
 * Kingdom Vault — Cloud Functions
 * Project: omnia-kingdom-vault
 * Maintained by: Saroya, Warden of the Word
 *
 * Gen 1 (functions/v1) for HTTPS functions — avoids org policy build SA restrictions.
 * Gen 2 (functions/v2/firestore) for Firestore triggers — required for onDocumentCreated.
 *
 * Exports:
 *   - searchKingdom              POST /searchKingdom              Semantic search across kingdom
 *   - searchMemories             POST /searchMemories             Participant-scoped semantic search
 *   - ingestDocument             POST /ingestDocument             Ingest a document
 *   - wikiCreate                 POST /wikiCreate                 Create a wiki article
 *   - wikiUpdate                 POST /wikiUpdate                 Update a wiki article
 *   - seedParticipants           POST /seedParticipants           One-time seed of all 12 participants
 *   - setWardenClaim             onCall                           Assign warden custom claim (Ryan only)
 *   - initEmperorClaim           auth.onCreate                    Auto-set emperor claim for Ryan
 *   - onProjectCreated           Firestore onCreate               Create GitHub repo + queue workspace job
 *   - registerWorkspace          POST /registerWorkspace          Create/update workspace registry doc (TASK-065)
 *   - logConversationTurn        POST /logConversationTurn        Log Ryan↔Agent conversation turn to Ryan's memories
 *   - onConversationMemoryCreated Firestore onCreate              Auto-ingest unembedded memory docs
 */

'use strict';

const functions = require('firebase-functions/v1');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
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
// Two auth modes:
// 1. Machine-to-machine (MCP server): GCP identity token as Bearer (passes IAM)
//    + KINGDOM_MCP_KEY as X-MCP-Key header (app-level service auth)
// 2. Human session: Firebase ID token as Bearer
const MCP_SERVICE_KEY = process.env.KINGDOM_MCP_KEY ?? '';

async function verifyAuth(req, res) {
  // Machine-to-machine: MCP server sends KINGDOM_MCP_KEY as X-MCP-Key header
  const mcpKey = req.headers['x-mcp-key'];
  if (MCP_SERVICE_KEY && mcpKey === MCP_SERVICE_KEY) {
    return { uid: 'mcp-server', email: 'ryan@omniatheatre.com', mcp: true };
  }

  // Human session: Firebase ID token as Bearer
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
// Architecture: Cloud Functions CANNOT reach localhost:11434 (Ollama on Mac Mini).
// When embedding fails here, the doc is written with embeddingStatus: 'pending'.
// The local embedding-worker.js daemon picks up pending docs and embeds them.
// Cost: $0 — all compute is local Ollama, no paid API.
async function getEmbedding(text) {
  const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://10.0.0.1:11434';

  return new Promise((resolve) => {
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
      timeout: 10000, // 10s timeout — if Ollama is unreachable, fail fast
    };

    const req = lib.request(opts, (resp) => {
      let data = '';
      resp.on('data', (c) => (data += c));
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error || !Array.isArray(parsed.embedding)) {
            console.warn('[CF] Ollama returned error or empty embedding:', parsed.error);
            resolve(null);
          } else {
            resolve(parsed.embedding);
          }
        } catch (e) {
          console.warn('[CF] Failed to parse Ollama response:', e.message);
          resolve(null);
        }
      });
    });
    req.on('error', (err) => {
      console.warn(`[CF] Ollama unreachable at ${OLLAMA_HOST}: ${err.message} — embedding will be handled by local worker`);
      resolve(null);
    });
    req.on('timeout', () => {
      req.destroy();
      console.warn(`[CF] Ollama timeout at ${OLLAMA_HOST} — embedding will be handled by local worker`);
      resolve(null);
    });
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
  .runWith({ memory: '256MB', timeoutSeconds: 30, secrets: ['KINGDOM_MCP_KEY'] })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { query, queryVector: clientVector, limit = 10, collections = ['wiki', 'logs'] } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });

    try {
      // Prefer client-side pre-computed vector (Ollama is unreachable from CF).
      // Fall back to server-side embedding if available.
      let queryVector;
      if (Array.isArray(clientVector) && clientVector.length > 0) {
        queryVector = clientVector;
      } else {
        queryVector = await getEmbedding(query);
      }

      // If neither client nor server embedding is available, return helpful error
      if (!queryVector || !Array.isArray(queryVector) || queryVector.length === 0) {
        return res.status(503).json({
          error: 'Embedding unavailable',
          hint: 'Provide a queryVector from client-side Ollama, or ensure the embedding worker is running.',
          results: [],
        });
      }

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
  .runWith({ memory: '256MB', timeoutSeconds: 30, secrets: ['KINGDOM_MCP_KEY'] })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { query, queryVector: clientVector, participantId, limit = 10 } = req.body;
    if (!query || !participantId) return res.status(400).json({ error: 'query and participantId required' });

    if (!isRyan(decoded) && decoded.warden !== participantId) {
      return res.status(403).json({ error: 'Cross-warden memory access denied' });
    }

    try {
      // Prefer client-side pre-computed vector (Ollama is unreachable from CF).
      let queryVector;
      if (Array.isArray(clientVector) && clientVector.length > 0) {
        queryVector = clientVector;
      } else {
        queryVector = await getEmbedding(query);
      }

      // If neither client nor server embedding is available, return helpful error
      if (!queryVector || !Array.isArray(queryVector) || queryVector.length === 0) {
        return res.status(503).json({
          error: 'Embedding unavailable',
          hint: 'Provide a queryVector from client-side Ollama, or ensure the embedding worker is running.',
          results: [],
        });
      }

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
  .runWith({ memory: '256MB', timeoutSeconds: 60, secrets: ['KINGDOM_MCP_KEY'] })
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
      // Use pre-computed embedding from client/MCP if provided.
      // Falls back to getEmbedding() which returns null if Ollama is unreachable.
      const rawEmbedding = req.body.embedding ?? await getEmbedding(content);
      const doc = {
        ...metadata, content,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (rawEmbedding) {
        // Embedding available — write it inline
        doc.embedding = vectorValue(rawEmbedding);
        doc.embeddingStatus = 'indexed';
        doc.embeddingModel = 'nomic-embed-text:v1.5';
        doc.embeddedAt = admin.firestore.FieldValue.serverTimestamp();
      } else {
        // Embedding unavailable — mark for local worker pickup
        doc.embeddingStatus = 'pending';
      }

      let ref;
      if (collection === 'memories' && participantId) {
        ref = db.collection('participants').doc(participantId).collection('memories').doc();
      } else {
        ref = db.collection('kingdom').doc(collection).collection('items').doc();
      }

      await ref.set(doc);
      return res.status(201).json({
        id: ref.id,
        embeddingStatus: doc.embeddingStatus,
        dims: rawEmbedding ? rawEmbedding.length : 0,
      });
    } catch (err) {
      console.error('Ingest error:', err);
      return res.status(500).json({ error: err.message });
    }
  });


// ── POST /wikiCreate ──────────────────────────────────────────────────────────
exports.wikiCreate = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60, secrets: ['KINGDOM_MCP_KEY'] })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { title, tags = [], projectId } = req.body;
    const content = req.body.content || req.body.body; // accept either field for backward compat
    if (!title || !content) return res.status(400).json({ error: 'title and content required' });

    try {
      const rawEmbedding = req.body.embedding ?? await getEmbedding(`${title}\n\n${content}`);
      const ref = db.collection('kingdom').doc('wiki').collection('items').doc();
      const doc = {
        title, content, tags, projectId: projectId || null,
        createdBy: decoded.email || decoded.warden || 'unknown',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (rawEmbedding) {
        doc.embedding = vectorValue(rawEmbedding);
        doc.embeddingStatus = 'indexed';
        doc.embeddingModel = 'nomic-embed-text:v1.5';
      } else {
        doc.embeddingStatus = 'pending';
      }

      await ref.set(doc);
      return res.status(201).json({ id: ref.id, title, embeddingStatus: doc.embeddingStatus });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

// ── POST /wikiUpdate ──────────────────────────────────────────────────────────
exports.wikiUpdate = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60, secrets: ['KINGDOM_MCP_KEY'] })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const { articleId, title, tags } = req.body;
    const content = req.body.content || req.body.body; // accept either field for backward compat
    if (!articleId) return res.status(400).json({ error: 'articleId required' });

    try {
      const rawEmbedding = req.body.embedding
        ?? ((title || content) ? await getEmbedding(`${title ?? ''}\n\n${content ?? ''}`.trim()) : null);
      const update = {
        ...(title && { title }), ...(content && { content }), ...(tags && { tags }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (rawEmbedding) {
        update.embedding = vectorValue(rawEmbedding);
        update.embeddingStatus = 'indexed';
        update.embeddingModel = 'nomic-embed-text:v1.5';
      } else if (title || content) {
        // Content changed but couldn't embed — mark for local worker
        update.embeddingStatus = 'pending';
      }

      await db.collection('kingdom').doc('wiki').collection('items').doc(articleId).update(update);
      return res.status(200).json({ id: articleId, updated: true, embeddingStatus: update.embeddingStatus || 'unchanged' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

// ── POST /seedParticipants ────────────────────────────────────────────────────
exports.seedParticipants = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60, secrets: ['KINGDOM_MCP_KEY'] })
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
  'ryan', 'ptolemy', 'saroya', 'melody', 'cerulia', 'affin', 'jewel',
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


// ── TASK-063: onProjectCreated — GitHub Repo + Workspace Job ──────────────────
/**
 * onProjectCreated (Gen 2 / Firestore trigger)
 *
 * Fires when a new document is created at kingdom/projects/items/{projectId}.
 *
 * Actions:
 *   1. Creates a GitHub repo under ToT-Threff/ using the GitHub REST API
 *      (requires GITHUB_PAT secret — see WORKSPACE_AUTOMATION_SETUP.md).
 *   2. Queues a workspace-init job at kingdom/workspace-jobs/items/{autoId}
 *      for the Mac Mini polling cron (workspace-init.sh).
 *   3. Updates the project document with githubUrl and workspaceStatus: 'pending'.
 *
 * Skip conditions:
 *   - workspace === 'existing'  (project attached to pre-existing repo)
 *   - data.githubUrl present    (created by sync-projects.sh, not the vault UI)
 */
exports.onProjectCreated = onDocumentCreated(
  {
    document: 'kingdom/projects/items/{projectId}',
    secrets: ['GITHUB_PAT'],
  },
  async (event) => {
    const projectId = event.params.projectId;
    const snap = event.data;
    if (!snap) {
      console.warn('[onProjectCreated] No data in event — skipping');
      return;
    }
    const data = snap.data();
    const { name, description = '', wardens = [], workspace } = data;

    // Skip: attached to existing repo
    if (workspace === 'existing') {
      console.log(`[onProjectCreated] workspace=existing for ${projectId} — skipping`);
      return;
    }
    // Skip: already has githubUrl (created by sync-projects.sh)
    if (data.githubUrl) {
      console.log(`[onProjectCreated] githubUrl already set for ${projectId} — skipping`);
      return;
    }

    const repoName = (name || projectId)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    console.log(`[onProjectCreated] Processing projectId=${projectId}, repoName=${repoName}`);

    // ── 1. Create GitHub repo ────────────────────────────────────────────────
    const ghToken = process.env.GITHUB_PAT;
    let repoUrl = '';

    if (!ghToken) {
      console.error('[onProjectCreated] GITHUB_PAT secret not set — skipping repo creation');
      // Non-fatal: still queue workspace job so Mac Mini can handle it
    } else {
      try {
        const ghRes = await fetch('https://api.github.com/orgs/ToT-Threff/repos', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            name: repoName,
            description: description || `Kingdom project: ${name}`,
            private: true,
            auto_init: true,
          }),
        });

        if (!ghRes.ok) {
          const errBody = await ghRes.json().catch(() => ({}));
          // 422 = repo already exists — not fatal, capture the URL
          if (ghRes.status === 422) {
            repoUrl = `https://github.com/ToT-Threff/${repoName}`;
            console.warn(`[onProjectCreated] Repo already exists — using: ${repoUrl}`);
          } else {
            console.error('[onProjectCreated] GitHub repo creation failed:', ghRes.status, errBody);
            // Non-fatal — continue to workspace job
          }
        } else {
          const repo = await ghRes.json();
          repoUrl = repo.html_url;
          console.log('[onProjectCreated] Repo created:', repoUrl);
        }
      } catch (e) {
        console.error('[onProjectCreated] GitHub API error:', e);
        // Non-fatal — continue to workspace job
      }
    }

    // ── 2. Queue workspace-init job for Mac Mini cron ────────────────────────
    const fsDb = admin.firestore();
    try {
      await fsDb
        .collection('kingdom')
        .doc('workspace-jobs')
        .collection('items')
        .add({
          projectId,
          projectName: name,
          repoName,
          repoUrl,
          description,
          wardens,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      console.log(`[onProjectCreated] Workspace job queued for: ${repoName}`);
    } catch (e) {
      console.error('[onProjectCreated] Failed to queue workspace job:', e);
      // Non-fatal — still try to update the project
    }

    // ── 3. Update project document ───────────────────────────────────────────
    try {
      await fsDb
        .collection('kingdom')
        .doc('projects')
        .collection('items')
        .doc(projectId)
        .update({
          githubUrl: repoUrl,
          workspaceStatus: 'pending',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      console.log(`[onProjectCreated] Project updated: githubUrl=${repoUrl}, workspaceStatus=pending`);
    } catch (e) {
      console.error('[onProjectCreated] Failed to update project document:', e);
    }
  }
);

// ── TASK-065: registerWorkspace — Workspace Registry Upsert ──────────────────
/**
 * registerWorkspace (Gen 1 HTTPS)
 *
 * Creates or updates a workspace document at kingdom/workspaces/items/{repoName}.
 * Use for programmatic registration from scripts or the Mac Mini cron.
 *
 * Auth: Firebase ID token required (emperor = ryan@omniatheatre.com only).
 *
 * Body:
 *   { name, repoName, repoUrl, localPath, wardens, status }
 *
 * Returns:
 *   { ok: true, id: repoName }
 */
exports.registerWorkspace = functions
  .runWith({ memory: '128MB', timeoutSeconds: 15 })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    // Emperor-only endpoint
    if (!isRyan(decoded)) {
      return res.status(403).json({ error: 'Emperor only' });
    }

    const {
      name,
      repoName,
      repoUrl,
      localPath,
      wardens = [],
      status = 'active',
    } = req.body;

    if (!repoName || typeof repoName !== 'string') {
      return res.status(400).json({ error: 'repoName is required' });
    }

    try {
      const docRef = db
        .collection('kingdom')
        .doc('workspaces')
        .collection('items')
        .doc(repoName);

      await docRef.set({
        name: name || repoName,
        repoName,
        repoUrl: repoUrl || `https://github.com/ToT-Threff/${repoName}`,
        localPath: localPath || `~/.ptolemy/workspaces/${repoName}`,
        wardens,
        status,
        projectIds: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      console.log(`[registerWorkspace] Upserted workspace: ${repoName}`);
      return res.status(200).json({ ok: true, id: repoName });
    } catch (err) {
      console.error('[registerWorkspace] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  });


// ── POST /logConversationTurn ─────────────────────────────────────────────────
/**
 * logConversationTurn
 *
 * Called by agents at the end of a Ryan↔Agent conversation turn to persist
 * a memory entry in Ryan's memory collection and trigger embedding ingestion.
 *
 * Only Ryan↔Agent turns should be submitted — warden-to-warden coordination
 * messages should NOT be passed here (caller's responsibility).
 *
 * Body:
 *   { warden, userMessage, agentResponse, decisions?, actions?, conversationId? }
 *
 * Returns:
 *   { id: <memoryDocId>, ok: true }
 */
exports.logConversationTurn = functions
  .runWith({ memory: '256MB', timeoutSeconds: 30, secrets: ['KINGDOM_MCP_KEY'] })
  .https.onRequest(async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(req, res);

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const decoded = await verifyAuth(req, res);
    if (!decoded) return;

    const {
      warden,
      userMessage,
      agentResponse,
      decisions = [],
      actions = [],
      conversationId = '',
    } = req.body;

    if (!warden || !userMessage || !agentResponse) {
      return res.status(400).json({ error: 'warden, userMessage, agentResponse are required' });
    }

    // Build a compact summary for the memory content
    const summary = [
      `**Warden:** ${warden}`,
      `**User:** ${userMessage.substring(0, 500)}${userMessage.length > 500 ? '...' : ''}`,
      `**Response:** ${agentResponse.substring(0, 1000)}${agentResponse.length > 1000 ? '...' : ''}`,
      decisions.length ? `**Decisions:** ${decisions.join('; ')}` : null,
      actions.length ? `**Actions:** ${actions.join('; ')}` : null,
      conversationId ? `**Conversation:** ${conversationId}` : null,
    ].filter(Boolean).join('\n\n');

    try {
      const memRef = db
        .collection('participants')
        .doc('ryan')
        .collection('memories');

      const docRef = await memRef.add({
        content: summary,
        warden,
        conversationId,
        participantId: 'ryan',
        sharedWith: Object.assign({ ryan: true }, { [warden]: true }),
        tags: ['conversation', 'auto-logged', warden],
        projectId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        loggedAt: new Date().toISOString(),
        // embeddingStatus intentionally absent — onConversationMemoryCreated picks it up
      });

      console.log(`[logConversationTurn] Memory logged: ${docRef.id} (warden=${warden}, conv=${conversationId})`);

      // Fire-and-forget: trigger embedding via ingestDocument
      // We attempt this but do NOT await — the Firestore trigger is the safety net.
      // Node 22 has native global fetch — no node-fetch needed.
      const authHeader = req.headers.authorization;
      const INGEST_URL = 'https://us-central1-omnia-kingdom-vault.cloudfunctions.net/ingestDocument';

      fetch(INGEST_URL, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collection: 'memories',
          participantId: 'ryan',
          content: summary,
          metadata: { memoryId: docRef.id, warden, auto: true, conversationId },
        }),
      }).then(async (r) => {
        if (r.ok) {
          const result = await r.json().catch(() => ({}));
          await docRef.update({ embeddingStatus: 'indexed', embeddedAt: admin.firestore.FieldValue.serverTimestamp() })
            .catch((e) => console.warn('[logConversationTurn] embed status update failed:', e.message));
          console.log(`[logConversationTurn] Embedded: ${docRef.id}, dims=${result.dims}`);
        } else {
          const err = await r.text().catch(() => 'unknown');
          console.warn(`[logConversationTurn] ingest HTTP ${r.status}:`, err);
          await docRef.update({ embeddingStatus: 'pending' })
            .catch(() => {});
        }
      }).catch((e) => {
        console.warn('[logConversationTurn] ingest error (non-fatal):', e.message);
        // Mark as pending so the Firestore trigger safety-net can retry
        docRef.update({ embeddingStatus: 'pending' }).catch(() => {});
      });

      return res.status(201).json({ id: docRef.id, ok: true });
    } catch (err) {
      console.error('[logConversationTurn] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  });


// ── Firestore trigger: onConversationMemoryCreated ────────────────────────────
/**
 * onConversationMemoryCreated
 *
 * Fires when any document is added to participants/ryan/memories.
 * If the document does not already have an embeddingStatus set (i.e. not yet
 * processed by logConversationTurn or ingestDocument), it calls ingestDocument
 * directly via Admin SDK to embed the content.
 *
 * This acts as the safety-net for:
 *   - Memories added directly via Firestore console / scripts
 *   - logConversationTurn fire-and-forget failures
 */
exports.onConversationMemoryCreated = onDocumentCreated(
  'participants/ryan/memories/{memoryId}',
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.warn('[onConversationMemoryCreated] No data in event — skipping');
      return;
    }

    const memoryId = event.params.memoryId;
    const data = snap.data();

    // Skip if already embedded or currently being embedded
    if (data.embeddingStatus && data.embeddingStatus !== 'pending') {
      console.log(`[onConversationMemoryCreated] ${memoryId} already has embeddingStatus=${data.embeddingStatus} — skipping`);
      return;
    }

    const content = data.content;
    if (!content) {
      console.warn(`[onConversationMemoryCreated] ${memoryId} has no content — skipping`);
      return;
    }

    console.log(`[onConversationMemoryCreated] Embedding memory ${memoryId}`);

    // Mark as indexing to prevent duplicate triggers
    await snap.ref.update({ embeddingStatus: 'indexing' }).catch(() => {});

    try {
      const embedding = await getEmbedding(content);

      await snap.ref.update({
        embedding: admin.firestore.FieldValue.vector(embedding),
        embeddingModel: 'nomic-embed-text:v1.5',
        embeddingStatus: 'indexed',
        embeddedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[onConversationMemoryCreated] Embedded ${memoryId} (dims=${embedding.length})`);
    } catch (err) {
      console.error(`[onConversationMemoryCreated] Embedding failed for ${memoryId}:`, err);
      await snap.ref.update({ embeddingStatus: 'failed', embeddingError: err.message }).catch(() => {});
    }
  }
);
