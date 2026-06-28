import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'omnia-kingdom-vault',
  });
}

const db = admin.firestore();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';

// Helper to generate embedding using local Ollama
async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text.trim() }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Ollama embedding call failed: HTTP ${response.status} - ${errorBody}`);
  }

  const data = await response.json() as { embedding: number[] };
  if (!data.embedding || data.embedding.length !== 768) {
    throw new Error(`Invalid embedding returned: expected 768 dimensions, got ${data.embedding?.length ?? 0}`);
  }
  return data.embedding;
}

// Chunking function to split large markdown texts into digestible blocks (under 3000 chars)
function chunkText(text: string, maxCharLength: number = 3000): string[] {
  const paragraphs = text.split('\n\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxCharLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      let temp = paragraph;
      while (temp.length > 0) {
        chunks.push(temp.substring(0, maxCharLength));
        temp = temp.substring(maxCharLength);
      }
    } else if ((currentChunk + '\n\n' + paragraph).length <= maxCharLength) {
      currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = paragraph;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

// Deterministic document ID generator
function getDocId(filename: string, participantId: string): string {
  const base = filename.replace(/\.[^/.]+$/, '').toLowerCase();
  return `${base}_${participantId}`.replace(/[^a-z0-9_-]/g, '_');
}

// Ingestion target directories and paths
const BASE_PROJECTS_DIR = '/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects';
const PTOLEMY_DIR = path.join(BASE_PROJECTS_DIR, 'Ptolemy');
const SAROYA_DIR = path.join(BASE_PROJECTS_DIR, 'Saroya');

// Global Files List
const GLOBAL_FILES = [
  path.join(PTOLEMY_DIR, 'rules.md'),
  path.join(PTOLEMY_DIR, 'task.md'),
  path.join(PTOLEMY_DIR, 'WORKSPACE_CONTEXT.md'),
  path.join(SAROYA_DIR, 'KINGDOM_STATE.md'),
  path.join(PTOLEMY_DIR, 'docs/MASTER_PLAN.md'),
  path.join(PTOLEMY_DIR, 'docs/API_STRATEGY.md'),
  path.join(SAROYA_DIR, 'bootstrap/SPECTRE_PROFILES_ENHANCED.md'),
  path.join(SAROYA_DIR, 'bootstrap/protocols/01-workspace-investigation.md'),
  path.join(SAROYA_DIR, 'bootstrap/protocols/02-chat-sync-and-handoff.md'),
  path.join(SAROYA_DIR, 'bootstrap/protocols/03-kingdom-status.md'),
  path.join(SAROYA_DIR, 'bootstrap/protocols/SPECTRE_PROFILES_SYNC_PROTOCOL.md'),
  path.join(SAROYA_DIR, 'bootstrap/reports/EVALUATION-001.md'),
  path.join(SAROYA_DIR, 'bootstrap/reports/OVERNIGHT-BRIEF-001.md'),
  path.join(SAROYA_DIR, 'bootstrap/SPECTRE_DEPLOY_CURRENT/WORKSPACE_CONTEXT.md'),
];

// Helper to scan for handoffs
function getHandoffFiles(): string[] {
  const handoffsDir = path.join(PTOLEMY_DIR, 'docs/handoffs');
  if (!fs.existsSync(handoffsDir)) return [];
  return fs.readdirSync(handoffsDir)
    .filter(f => f.endsWith('.md') && (f.startsWith('SESSION_HANDOFF_') || f.startsWith('HANDOFF_') || f.startsWith('DISPATCH_')))
    .map(f => path.join(handoffsDir, f));
}

async function main() {
  console.log('📖 Starting Chunked Boot Memory Ingestion Script...');
  
  // 1. Verify Ollama Health
  try {
    const health = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!health.ok) throw new Error(`Ollama health check status: ${health.status}`);
    console.log('✓ Local Ollama connection verified');
  } catch (err: any) {
    console.error('✗ Cannot connect to local Ollama on localhost:11434. Is Ollama running?', err.message);
    process.exit(1);
  }

  // 2. Fetch all participants
  const participantsSnapshot = await db.collection('participants').get();
  const participantIds = participantsSnapshot.docs.map(doc => doc.id);
  console.log(`✓ Retrieved ${participantIds.length} participants from Firestore:`, participantIds);

  // Helper to save a memory document (supports chunking)
  async function saveMemoryWithChunking(participantId: string, filePath: string, rawContent: string, tagSuffix: string) {
    const filename = path.basename(filePath);
    const baseDocId = getDocId(filename, participantId);
    const baseTitle = filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/-/g, ' ');

    const chunks = chunkText(rawContent, 3000);
    console.log(`  Ingesting "${filename}" for ${participantId} in ${chunks.length} chunk(s)`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];
      const docId = chunks.length === 1 ? baseDocId : `${baseDocId}_part_${i}`;
      const title = chunks.length === 1 ? baseTitle : `${baseTitle} - Part ${i + 1}`;
      
      const vector = await getEmbedding(chunkContent);
      const ref = db.collection('participants').doc(participantId).collection('memories').doc(docId);
      
      await ref.set({
        title,
        content: chunkContent,
        body: chunkContent,
        summary: `Supplemental boot document: ${filename} (Part ${i + 1}/${chunks.length})`,
        source: filePath,
        sourceType: 'bootstrap_markdown',
        tags: [
          'bootstrap', 
          'kingdom-knowledge', 
          'supplemental-boot', 
          tagSuffix,
          ...(chunks.length > 1 ? ['chunked-document'] : [])
        ],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        embedding: admin.firestore.FieldValue.vector(vector),
        embeddedAt: admin.firestore.FieldValue.serverTimestamp(),
        embeddingModel: `${EMBED_MODEL}:v1.5`,
        embeddingDim: vector.length,
      }, { merge: true });
    }
  }

  // 3. Process Global Files (for ALL participants including ryan)
  const allGlobalFiles = [...GLOBAL_FILES, ...getHandoffFiles()];
  console.log(`\n📂 Processing ${allGlobalFiles.length} Global Boot Files...`);

  for (const filePath of allGlobalFiles) {
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠️ File not found, skipping: ${filePath}`);
      continue;
    }

    const filename = path.basename(filePath);
    console.log(`Processing global file: ${filename}`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      // Save for ALL participants
      for (const pId of participantIds) {
        await saveMemoryWithChunking(pId, filePath, content, 'global-document');
      }
    } catch (err: any) {
      console.error(`  ✗ Error processing global file ${filename}:`, err.message);
    }
  }

  // 4. Process Warden-Specific Persona Files
  console.log('\n🔮 Processing Warden-Specific Persona Files...');
  const wardenSoulsDir = path.join(SAROYA_DIR, 'bootstrap/SPECTRE_DEPLOY_CURRENT/warden_souls');

  if (fs.existsSync(wardenSoulsDir)) {
    const personaFiles = fs.readdirSync(wardenSoulsDir).filter(f => f.startsWith('PERSONA_') && f.endsWith('.md'));
    
    for (const file of personaFiles) {
      const filePath = path.join(wardenSoulsDir, file);
      const match = file.match(/PERSONA_(\w+)\.md/i);
      if (!match) continue;

      const wardenId = match[1].toLowerCase();
      if (!participantIds.includes(wardenId)) {
        console.warn(`  ⚠️ Persona file found for unknown participant: ${wardenId}`);
        continue;
      }

      console.log(`Processing persona file for ${wardenId}: ${file}`);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        await saveMemoryWithChunking(wardenId, filePath, content, 'persona-document');
      } catch (err: any) {
        console.error(`  ✗ Error processing persona for ${wardenId}:`, err.message);
      }
    }
  } else {
    console.warn(`  ⚠️ Warden souls directory not found: ${wardenSoulsDir}`);
  }

  // 5. Process Warden-Specific Dossier Files
  console.log('\n📂 Processing Warden-Specific Dossier Files...');
  const dossiersDir = path.join(SAROYA_DIR, 'bootstrap/team_dossiers');

  if (fs.existsSync(dossiersDir)) {
    const dossierFiles = fs.readdirSync(dossiersDir).filter(f => f.endsWith('.md') && f !== 'README.md');

    for (const file of dossierFiles) {
      const filePath = path.join(dossiersDir, file);
      const baseName = file.replace(/\.md$/i, '').toLowerCase();

      // Determine who gets this dossier
      let targetIds: string[] = [];
      if (baseName === 'ptolemy') {
        targetIds = ['ptolemy-lh', 'ptolemy-rh'];
      } else if (baseName === 'ryan') {
        targetIds = ['ryan'];
      } else if (participantIds.includes(baseName)) {
        targetIds = [baseName];
      }

      if (targetIds.length === 0) {
        console.warn(`  ⚠️ Dossier file found for unknown participant: ${baseName}`);
        continue;
      }

      console.log(`Processing dossier file for ${targetIds.join(', ')}: ${file}`);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const tId of targetIds) {
          await saveMemoryWithChunking(tId, filePath, content, 'dossier-document');
        }
      } catch (err: any) {
        console.error(`  ✗ Error processing dossier for ${baseName}:`, err.message);
      }
    }
  } else {
    console.warn(`  ⚠️ Dossiers directory not found: ${dossiersDir}`);
  }

  console.log('\n🎉 Ingestion of Boot memories completed successfully!');
}

main().catch(err => {
  console.error('Fatal ingestion error:', err);
  process.exit(1);
});
