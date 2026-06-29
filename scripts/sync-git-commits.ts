import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'omnia-kingdom-vault',
  });
}
const db = admin.firestore();

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';

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
    console.error(`  ⚠️ Local embedding failed, returning fallback zero vector: ${(err as Error).message}`);
    return new Array(768).fill(0);
  }
}

function getWardenFromFiles(files: string[], repoName: string): string | null {
  for (const file of files) {
    // Construct path relative to Ptolemy root if we are in a submodule
    const fullPath = repoName.toLowerCase() === 'ptolemy' 
      ? file 
      : `${repoName}/${file}`;
    
    const cleanPath = fullPath.startsWith('vault/') ? fullPath.substring(6) : fullPath;
    
    // 1. Specific tools / wardens mapping
    if (cleanPath.startsWith('kingdom-mcp/src/tools/')) {
      const match = cleanPath.match(/tools\/([a-zA-Z0-9]+)\.ts/);
      if (match && ['saroya', 'melody', 'cerulia', 'affin', 'jewel', 'krishe', 'astyr', 'hurrian', 'jovin', 'herus'].includes(match[1])) {
        return match[1];
      }
      return 'melody';
    }
    if (cleanPath.startsWith('kingdom-mcp/')) return 'melody';
    
    // 2. Affin (QA & Security)
    if (cleanPath.includes('skills-scanner') || cleanPath.includes('test') || cleanPath.includes('spec') || cleanPath.startsWith('tests/')) {
      return 'affin';
    }
    
    // 3. Astyr (Red Team & Incident Response)
    if (cleanPath.startsWith('docs/incident/') || cleanPath.includes('security-audit') || cleanPath.includes('threat')) {
      return 'astyr';
    }
    
    // 4. Herus (Production Management)
    if (cleanPath.startsWith('docs/reviews/') || cleanPath.includes('consens') || cleanPath.includes('signoff')) {
      return 'herus';
    }
    
    // 5. Krishe (DevOps & Infrastructure)
    if (cleanPath.startsWith('infra/') || cleanPath.startsWith('launchagents/') || cleanPath.includes('backup') || cleanPath.includes('workspace-init') || cleanPath.includes('register-workspace') || cleanPath.endsWith('.sh') || cleanPath.endsWith('.plist')) {
      return 'krishe';
    }
    
    // 6. Saroya (PM & Architecture)
    if (cleanPath.startsWith('docs/adr/') || cleanPath.startsWith('.agents/') || cleanPath === 'task.md' || cleanPath === 'rules.md' || cleanPath.startsWith('docs/handoffs/')) {
      return 'saroya';
    }
    
    // 7. Jovin / Hurrian (Narrative & Creative / Strategy & Research)
    if (cleanPath.startsWith('withoutequal/') || cleanPath.startsWith('docs/creative/') || cleanPath.startsWith('docs/narrative/')) {
      return 'jovin';
    }
    if (cleanPath.startsWith('omniland/') || cleanPath.startsWith('docs/strategy/')) {
      return 'hurrian';
    }
    
    // 8. Jewel (Data & Accounting)
    if (cleanPath.startsWith('ml/') || cleanPath.startsWith('scripts/internal_accounting') || cleanPath.startsWith('scripts/general_ledger') || cleanPath.includes('budget') || cleanPath.includes('accounting')) {
      return 'jewel';
    }

    // 9. Cerulia / Melody frontend vs backend heuristics
    // If it's a styling, component, page, or layout file, assign to Cerulia
    if (
      cleanPath.endsWith('.css') || 
      cleanPath.endsWith('.scss') || 
      cleanPath.endsWith('.tsx') || 
      cleanPath.includes('/components/') || 
      (cleanPath.includes('/src/app/') && !cleanPath.includes('/api/'))
    ) {
      return 'cerulia';
    }
    
    // If it's an API route, function, backend server code, assign to Melody
    if (
      cleanPath.includes('/api/') || 
      cleanPath.includes('/functions/') || 
      cleanPath.includes('/backend/') || 
      cleanPath.includes('/server/')
    ) {
      return 'melody';
    }
  }
  
  // Default fallback based on repository name if file level matching didn't yield a specific warden
  if (repoName.toLowerCase() === 'ptolemy-studio') return 'cerulia';
  if (repoName.toLowerCase() === 'ptolemy-core') return 'melody';
  if (repoName.toLowerCase() === 'saroya') return 'saroya';
  
  return null;
}

function getWardenFromMessage(msg: string): string | null {
  const cleanMsg = msg.toLowerCase();
  const wardens = ['saroya', 'melody', 'cerulia', 'affin', 'jewel', 'krishe', 'astyr', 'hurrian', 'jovin', 'herus'];
  const bracketMatch = cleanMsg.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    const content = bracketMatch[1];
    for (const w of wardens) {
      if (content.includes(w)) return w;
    }
  }
  for (const w of wardens) {
    if (cleanMsg.includes(`${w}:`) || cleanMsg.includes(`[${w}]`)) {
      return w;
    }
  }
  return null;
}

// Update the root-level WORK_LOG.md with recent activity
function updateWorkLog(wardenId: string, message: string, hash: string) {
  const workLogPath = path.resolve(__dirname, '../../WORK_LOG.md');
  if (!fs.existsSync(workLogPath)) return;

  const dateStr = new Date().toISOString().split('T')[0];
  const newEntry = `\n- [${dateStr}] [${wardenId.toUpperCase()}] commit \`${hash.substring(0, 8)}\`: ${message}`;

  try {
    fs.appendFileSync(workLogPath, newEntry, 'utf8');
    console.log(`  ✓ Updated WORK_LOG.md with commit entry`);
  } catch (err) {
    console.error('⚠️ Failed to append to WORK_LOG.md:', err);
  }
}

async function syncGitCommits() {
  console.log('🔄 Running Git Commit Sync & Warden Attribution...');

  const wardens = ['saroya', 'melody', 'cerulia', 'affin', 'jewel', 'krishe', 'astyr', 'hurrian', 'jovin', 'herus'];

  // Resolve target repository path from argument
  const repoPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '../..');

  const repoName = path.basename(repoPath);
  console.log(`Checking repository: ${repoPath} (Name: ${repoName})`);

  try {
    // 1. Get HEAD commit hash
    const headHash = execSync('git rev-parse HEAD', { cwd: repoPath }).toString().trim();
    console.log(`Checking commit: ${headHash}`);

    // 2. Read details of this commit
    const commitDetails = execSync(`git show --quiet --pretty=format:"%an|%ae|%ad|%s" ${headHash}`, { cwd: repoPath }).toString().trim();
    const changedFiles = execSync(`git diff-tree --no-commit-id --name-only -r ${headHash}`, { cwd: repoPath }).toString().split('\n').filter(l => l.trim() !== '');

    const [authorName, authorEmail, dateStr, message] = commitDetails.split('|');

    // 3. Determine Warden
    let wardenId = getWardenFromMessage(message);
    if (!wardenId) {
      wardenId = getWardenFromFiles(changedFiles, repoName);
    }

    if (wardenId && wardens.includes(wardenId)) {
      const docId = `git_commit_${headHash}`;
      const existing = await db.collection('participants').doc(wardenId).collection('memories').doc(docId).get();

      if (existing.exists) {
        console.log(`ℹ️ Commit ${headHash.substring(0, 8)} already synced to ${wardenId.toUpperCase()}.`);
        process.exit(0);
      }

      console.log(`🎯 Attributing commit to Warden: ${wardenId.toUpperCase()}`);

      const content = `### Git Commit Work History\n` +
        `- **Commit Hash**: \`${headHash}\`\n` +
        `- **Warden Assigned**: **${wardenId.toUpperCase()}**\n` +
        `- **Author**: ${authorName} <${authorEmail}>\n` +
        `- **Date**: ${dateStr}\n` +
        `- **Message**: "${message}"\n` +
        `- **Files Changed**:\n` +
        changedFiles.map(f => `  - [${path.basename(f)}](file://${path.resolve(repoPath, f)})`).join('\n');

      const embedding = await getEmbedding(content);

      // Write to memories collection
      await db.collection('participants').doc(wardenId).collection('memories').doc(docId).set({
        content,
        summary: `Attributed work commit: "${message}"`,
        metadata: {
          tags: ['git-commit', 'work-history', 'codebase'],
          hash: headHash,
          date: dateStr,
          files: changedFiles,
          seededAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        embedding: admin.firestore.FieldValue.vector(embedding),
      });

      // Update memory count
      const snap = await db.collection('participants').doc(wardenId).collection('memories').get();
      await db.collection('participants').doc(wardenId).update({
        memoryCount: snap.size,
      });

      console.log(`  ✓ Written to Firestore memories for ${wardenId.toUpperCase()} (total memory count: ${snap.size})`);

      // Update WORK_LOG.md
      updateWorkLog(wardenId, message, headHash);

    } else {
      console.log('ℹ️ Commit did not match any Warden files or message patterns. Skipping attribution.');
    }

  } catch (err) {
    console.error('❌ Commit sync failed:', err);
    process.exit(1);
  }

  process.exit(0);
}

syncGitCommits();
