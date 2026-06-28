#!/usr/bin/env node
/**
 * Kingdom Vault — Performance Benchmark Runner CLI
 * Measures direct database, API, and network roundtrip latencies.
 */

const admin = require('firebase-admin');
const path = require('path');
const http = require('http');

// Init Firebase
const saPath = path.join(process.env.HOME, '.config', 'firebase', 'service-account.json');
try {
  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
} catch {
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'omnia-kingdom-vault' });
}

const db = admin.firestore();

// Helper to ping Ollama
function pingOllama() {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(performance.now() - start);
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// Helper to ping GCP Cloud Functions
async function pingCloudFunction() {
  const start = performance.now();
  // Using node-fetch dynamically or native fetch if node 18+
  const cfUrl = 'https://us-central1-omnia-kingdom-vault.cloudfunctions.net/ingestDocument';
  try {
    const res = await fetch(cfUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Status 400 is expected on empty payload
    const duration = performance.now() - start;
    return { duration, status: res.status };
  } catch (err) {
    throw err;
  }
}

async function run() {
  console.log('==================================================');
  console.log('🏰 KINGDOM VAULT PERFORMANCE AUDIT RUNNER');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('==================================================\n');

  // Test 1: Local Ollama Endpoint
  console.log('Running Test 1: Local Ollama tag checking...');
  try {
    const ollamaLat = await pingOllama();
    console.log(`  ✓ LOCAL OLLAMA: ${ollamaLat.toFixed(1)}ms`);
  } catch (err) {
    console.log(`  ✗ LOCAL OLLAMA FAILED: ${err.message}`);
  }

  // Test 2: GCP Cloud Function WAN Ping
  console.log('\nRunning Test 2: GCP Cloud Function WAN roundtrip...');
  try {
    const { duration, status } = await pingCloudFunction();
    console.log(`  ⚡ CLOUD FUNCTION: ${duration.toFixed(1)}ms (Status: ${status})`);
  } catch (err) {
    console.log(`  ✗ CLOUD FUNCTION FAILED: ${err.message}`);
  }

  // Test 3: Firestore Read Latencies (individual collections)
  console.log('\nRunning Test 3: Firestore Collection Reads...');
  const collections = [
    { name: 'Participants', path: 'participants' },
    { name: 'Projects', path: 'kingdom/projects/items' },
    { name: 'Wiki Articles', path: 'kingdom/wiki/items' },
    { name: 'Files', path: 'files' },
    { name: 'Workspaces', path: 'kingdom/workspaces/items' },
    { name: 'Token Usage', path: 'token_usage' }
  ];

  for (const col of collections) {
    const start = performance.now();
    try {
      const snap = await db.collection(col.path).limit(50).get();
      const duration = performance.now() - start;
      console.log(`  ✓ ${col.name.padEnd(15)}: ${duration.toFixed(1)}ms (Loaded: ${snap.size} documents)`);
    } catch (err) {
      console.log(`  ✗ ${col.name.padEnd(15)}: FAILED (${err.message})`);
    }
  }

  // Test 4: Firestore Read/Write Roundtrip
  console.log('\nRunning Test 4: Firestore Read/Write latency...');
  const writeStart = performance.now();
  try {
    const ref = db.collection('kingdom/performance_logs/items');
    const docRef = await ref.add({
      action: 'BENCHMARK_CLI_WRITE',
      durationMs: 0,
      details: 'CLI benchmark test run',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    const writeEnd = performance.now() - writeStart;

    const readStart = performance.now();
    await docRef.get();
    const readEnd = performance.now() - readStart;

    const deleteStart = performance.now();
    await docRef.delete();
    const deleteEnd = performance.now() - deleteStart;

    console.log(`  ✓ Write Document: ${writeEnd.toFixed(1)}ms`);
    console.log(`  ✓ Read Document:  ${readEnd.toFixed(1)}ms`);
    console.log(`  ✓ Delete Document: ${deleteEnd.toFixed(1)}ms`);
  } catch (err) {
    console.log(`  ✗ Firestore Write/Read/Delete cycle failed: ${err.message}`);
  }

  console.log('\n==================================================');
  console.log('✅ Performance Audit Completed!');
  console.log('==================================================');
}

run().catch(err => {
  console.error('Audit script failed:', err);
  process.exit(1);
});
