#!/usr/bin/env node
/**
 * Kingdom Vault — Vector Index Setup
 * Creates Firestore vector search indexes via gcloud CLI
 * Run once after Firestore database is provisioned.
 *
 * Usage: node scripts/setup-vector-indexes.js
 * Requires: gcloud authenticated and project set to omnia-kingdom-vault
 */

const { execSync } = require('child_process');

const PROJECT = 'omnia-kingdom-vault';
const DATABASE = '(default)';

const VECTOR_INDEXES = [
  // Kingdom wiki items
  {
    collection: 'kingdom/wiki/items',
    field: 'embedding',
    dimension: 768,
    label: 'kingdom/wiki — semantic search',
  },
  // Kingdom log items
  {
    collection: 'kingdom/logs/items',
    field: 'embedding',
    dimension: 768,
    label: 'kingdom/logs — semantic search',
  },
  // Kingdom interaction items
  {
    collection: 'kingdom/interactions/items',
    field: 'embedding',
    dimension: 768,
    label: 'kingdom/interactions — semantic search',
  },
  // Participant memories (collection group — applied per participant)
  {
    collection: 'memories',
    field: 'embedding',
    dimension: 768,
    label: 'participant memories — semantic search',
    collectionGroup: true,
  },
];

function run(cmd) {
  console.log(`  $ ${cmd.substring(0, 100)}...`);
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: err.stderr || err.message };
  }
}

console.log('🏛️  Kingdom Vault — Firestore Vector Index Setup');
console.log('=================================================\n');

for (const idx of VECTOR_INDEXES) {
  console.log(`📐 Creating index: ${idx.label}`);

  const cmd = [
    'gcloud alpha firestore indexes composite create',
    `--project=${PROJECT}`,
    `--database=${DATABASE}`,
    `--collection-group=${idx.collection.split('/').pop()}`,
    `--field-config=field-path=${idx.field},vector-config='{"dimension":${idx.dimension},"flat":{}}'`,
    '--quiet',
  ].join(' ');

  const result = run(cmd);
  if (result.ok) {
    console.log(`  ✓ Queued\n`);
  } else {
    if (result.out.includes('already exists')) {
      console.log(`  ✓ Already exists\n`);
    } else {
      console.log(`  ⚠ ${result.out.trim().substring(0, 120)}\n`);
    }
  }
}

console.log('\n✅ Vector index creation complete.');
console.log('Indexes build in the background. Check status at:');
console.log(`   https://console.firebase.google.com/project/${PROJECT}/firestore/indexes`);
console.log('\nNote: Vector search in Firestore is auto-triggered when you write an');
console.log('embedding field. The index does NOT need to pre-exist for writes.');
