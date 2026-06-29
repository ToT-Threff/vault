import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'omnia-kingdom-vault',
  });
}
const db = admin.firestore();

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';

// Generate embedding using local Ollama
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.substring(0, 4000) }),
    });
    if (!res.ok) {
      throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as { embedding: number[] };
    return data.embedding;
  } catch (err) {
    console.error(`  ⚠️ Local embedding helper failed, returning fallback zero vector: ${(err as Error).message}`);
    return new Array(768).fill(0);
  }
}

// Map files to Wardens
function getWardenFromFiles(files: string[]): string | null {
  for (const file of files) {
    if (file.startsWith('vault/src/components/')) return 'cerulia';
    if (file.startsWith('kingdom-mcp/src/tools/')) {
      const match = file.match(/tools\/([a-zA-Z0-9]+)\.ts/);
      if (match && ['saroya', 'melody', 'cerulia', 'affin', 'jewel', 'krishe', 'astyr', 'hurrian', 'jovin', 'herus'].includes(match[1])) {
        return match[1];
      }
      return 'melody';
    }
    if (file.startsWith('kingdom-mcp/')) return 'melody';
    if (file.includes('skills-scanner') || file.startsWith('tests/')) return 'affin';
    if (file.startsWith('docs/reviews/')) return 'herus';
    if (file.startsWith('docs/adr/')) return 'saroya';
    if (file.startsWith('infra/')) return 'krishe';
  }
  return null;
}

// Parse Warden from commit message
function getWardenFromMessage(msg: string): string | null {
  const cleanMsg = msg.toLowerCase();
  const wardens = ['saroya', 'melody', 'cerulia', 'affin', 'jewel', 'krishe', 'astyr', 'hurrian', 'jovin', 'herus'];
  for (const w of wardens) {
    if (cleanMsg.includes(`[${w}]`) || cleanMsg.includes(`${w}:`)) {
      return w;
    }
  }
  return null;
}

async function seedWardenMemories() {
  console.log('🏁 Starting Warden Memory Seeding process...');

  const wardens = ['saroya', 'melody', 'cerulia', 'affin', 'jewel', 'krishe', 'astyr', 'hurrian', 'jovin', 'herus'];

  // ── Step 1: Read and parse WARDEN_REVIEW/Enhanced Profiles ────────────────
  console.log('📖 Fetching SPECTRE PROFILES ENHANCED from Firestore...');
  let wikiBody = '';
  try {
    const wikiDoc = await db.collection('kingdom/wiki/items').doc('k27iXC5s5sE8jt3WS7IC').get();
    if (wikiDoc.exists) {
      wikiBody = wikiDoc.data()?.body ?? '';
      console.log('✓ Wiki article loaded successfully.');
    } else {
      console.log('⚠️ Wiki article k27iXC5s5sE8jt3WS7IC not found. Falling back to local profile files.');
    }
  } catch (err) {
    console.error('⚠️ Failed to load wiki article:', err);
  }

  // Parse sections
  const loreSections: Record<string, string> = {};
  if (wikiBody) {
    const sections = wikiBody.split(/## /);
    for (const section of sections) {
      const firstLine = section.split('\n')[0];
      const match = firstLine.match(/([a-zA-Z]+)\s+—/);
      if (match) {
        const wardenId = match[1].toLowerCase();
        if (wardens.includes(wardenId)) {
          loreSections[wardenId] = section;
        }
      } else if (firstLine.includes('PTOLEMY')) {
        loreSections['ptolemy'] = section;
      }
    }
  }

  // ── Step 2: Seed Lore & Profile Instructions ──────────────────────────────
  for (const w of wardens) {
    console.log(`\n👤 Seeding Lore and Profiles for Warden: ${w.toUpperCase()}`);

    const docIdPrefix = `lore_${w}`;

    // 1. Seed Lore section from Book
    const loreContent = loreSections[w] || '';
    if (loreContent) {
      const content = `## Warden Lore: ${w.toUpperCase()}\n\n${loreContent}`;
      const embedding = await getEmbedding(content);
      const docId = `${docIdPrefix}_backstory`;
      await db.collection('participants').doc(w).collection('memories').doc(docId).set({
        content,
        summary: `Canonical Without Equal backstory and Council observations for Warden ${w}`,
        metadata: {
          tags: ['lore', 'identity', 'source-book'],
          seededAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        embedding: admin.firestore.FieldValue.vector(embedding),
      });
      console.log(`  ✓ Seeded backstory lore memory for ${w}`);
    }

    // 2. Seed System Profile Directive
    const profilePath = path.resolve(__dirname, `../../.agents/profiles/${w}.md`);
    if (fs.existsSync(profilePath)) {
      const content = fs.readFileSync(profilePath, 'utf8');
      const embedding = await getEmbedding(content);
      const docId = `${docIdPrefix}_profile_instructions`;
      await db.collection('participants').doc(w).collection('memories').doc(docId).set({
        content,
        summary: `System instructions, technical purviews, and operating rules for Warden ${w}`,
        metadata: {
          tags: ['system-instructions', 'profile', 'boot-protocol'],
          seededAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        embedding: admin.firestore.FieldValue.vector(embedding),
      });
      console.log(`  ✓ Seeded profile instructions memory for ${w}`);
    }
  }

  // ── Step 3: Seed Git Commits (Work History) ────────────────────────────────
  console.log('\n🌿 Parsing recent git commits for Warden work attribution...');
  try {
    const gitLog = execSync('git log -n 100 --name-only --pretty=format:"COMMIT:%H|%an|%ae|%ad|%s"').toString();
    const commits = gitLog.split('COMMIT:').slice(1);
    console.log(`Analyzing ${commits.length} recent git commits...`);

    let attributedCount = 0;
    for (const commitBlock of commits) {
      const lines = commitBlock.split('\n').filter(l => l.trim() !== '');
      if (lines.length === 0) continue;

      const header = lines[0];
      const changedFiles = lines.slice(1);
      const [hash, authorName, authorEmail, dateStr, message] = header.split('|');

      // Attempt Warden mapping
      let wardenId = getWardenFromMessage(message);
      if (!wardenId) {
        wardenId = getWardenFromFiles(changedFiles);
      }

      if (wardenId && wardens.includes(wardenId)) {
        const docId = `git_commit_${hash}`;
        // Check if already seeded to avoid double writes
        const existing = await db.collection('participants').doc(wardenId).collection('memories').doc(docId).get();
        if (existing.exists) continue;

        const content = `### Git Commit Work History\n` +
          `- **Commit Hash**: \`${hash}\`\n` +
          `- **Warden Assigned**: **${wardenId.toUpperCase()}**\n` +
          `- **Author**: ${authorName} <${authorEmail}>\n` +
          `- **Date**: ${dateStr}\n` +
          `- **Message**: "${message}"\n` +
          `- **Files Changed**:\n` +
          changedFiles.map(f => `  - [${path.basename(f)}](file://${path.resolve(__dirname, '..', '..', f)})`).join('\n');

        const embedding = await getEmbedding(content);
        await db.collection('participants').doc(wardenId).collection('memories').doc(docId).set({
          content,
          summary: `Attributed work commit: "${message}"`,
          metadata: {
            tags: ['git-commit', 'work-history', 'codebase'],
            hash,
            date: dateStr,
            files: changedFiles,
            seededAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          embedding: admin.firestore.FieldValue.vector(embedding),
        });
        attributedCount++;
        console.log(`  ✓ Mapped commit ${hash.substring(0, 8)} to ${wardenId.toUpperCase()} ("${message.substring(0, 40)}...")`);
      }
    }
    console.log(`\n✅ Attributed and seeded ${attributedCount} git commits to Warden memories.`);

  } catch (err) {
    console.error('⚠️ Git commit analysis failed:', err);
  }

  // ── Step 4: Update participant memory counts ──────────────────────────────
  console.log('\n📈 Updating memoryCount metric on all participants...');
  for (const w of wardens) {
    const snap = await db.collection('participants').doc(w).collection('memories').get();
    await db.collection('participants').doc(w).update({
      memoryCount: snap.size,
    });
    console.log(`  ✓ ${w.toUpperCase()} memoryCount = ${snap.size}`);
  }

  console.log('\n🎉 Warden memory seeding completed successfully!');
  process.exit(0);
}

seedWardenMemories().catch((err) => {
  console.error('❌ Fatal error during memory seeding:', err);
  process.exit(1);
});
