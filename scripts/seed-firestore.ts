#!/usr/bin/env node
// scripts/seed-firestore.ts
// Kingdom Vault — Firestore Seed Script
// Populates initial participant records for all 12 SPECTRE members.
//
// ⚠️  SERVER-ONLY (VAULT-HIGH-03) — This file uses firebase-admin which
// bypasses ALL Firestore security rules. It must NEVER be imported by
// Next.js client components, pages, or any file in src/lib/ that components
// import. It is safe here in scripts/ which runs only via `pnpm seed`.
//
// USAGE:
//   pnpm seed
//   (which runs: tsx scripts/seed-firestore.ts)
//
// REQUIRES:
//   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a Firebase Admin service account JSON
//   - OR set FIREBASE_PROJECT_ID and run with Application Default Credentials (gcloud auth)
//   - firebase-admin is already in package.json dependencies
//
// NOTE: This script is IDEMPOTENT — it uses set() with merge, so re-running
// won't overwrite memory data or other subcollection docs.
//
// ADMIN WRITE AUTH CHECK (VAULT-HIGH-02):
// This is a CLI script run manually by Ryan. It does not accept remote calls.
// No additional caller auth is needed here — the ADC credentials are the auth.


import * as admin from 'firebase-admin';

// ── Firebase Admin init ────────────────────────────────────────────────────────
// Picks up GOOGLE_APPLICATION_CREDENTIALS automatically via ADC,
// or FIREBASE_EMULATOR_HOST if set.

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'omnia-kingdom-vault',
  });
}

const db = admin.firestore();

// ── SPECTRE Roster ─────────────────────────────────────────────────────────────
// Source of truth: KINGDOM_STATE.md (Saroya, 2026-05-26)

interface ParticipantSeed {
  id: string;
  name: string;
  role: 'emperor' | 'warden' | 'spectres';
  wardenTitle: string;
  emoji: string;
  model: string;
  color: string;
  memoryCount: number;
  lastActive: null;
}

const PARTICIPANTS: ParticipantSeed[] = [
  {
    id: 'ryan',
    name: 'Ryan Threlfall',
    role: 'emperor',
    wardenTitle: 'The Emperor',
    emoji: '👑',
    model: 'human',
    color: '#FFD700',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'ptolemy-rh',
    name: 'Ptolemy RH',
    role: 'warden',
    wardenTitle: 'The Autonomic Shield',
    emoji: '🛡️',
    model: 'ministral-3:14b',
    color: '#9B59B6',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'ptolemy-lh',
    name: 'Ptolemy LH',
    role: 'warden',
    wardenTitle: 'The Emperor (Digital)',
    emoji: '👁️',
    model: 'qwen3.5:35b',
    color: '#8E44AD',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'saroya',
    name: 'Saroya',
    role: 'warden',
    wardenTitle: 'Warden of the Word',
    emoji: '📖',
    model: 'devstral',
    color: '#E74C3C',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'melody',
    name: 'Melody',
    role: 'warden',
    wardenTitle: 'Warden of the Song',
    emoji: '🎵',
    model: 'nemotron-3-nano',
    color: '#3498DB',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'cerulia',
    name: 'Cerulia',
    role: 'warden',
    wardenTitle: 'Warden of the Arcane',
    emoji: '🔮',
    model: 'qwen3.5:9b',
    color: '#1ABC9C',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'affin',
    name: 'Affin',
    role: 'warden',
    wardenTitle: 'Warden of the Tail',
    emoji: '🛡',
    model: 'devstral',
    color: '#F39C12',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'jewel',
    name: 'Jewel',
    role: 'warden',
    wardenTitle: 'Diamond Alchemist',
    emoji: '💎',
    model: 'glm-4.7-flash',
    color: '#2ECC71',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'krishe',
    name: 'Krishe',
    role: 'warden',
    wardenTitle: 'Warden of the Road',
    emoji: '⚙️',
    model: 'phi4-mini',
    color: '#95A5A6',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'astyr',
    name: 'Astyr',
    role: 'warden',
    wardenTitle: 'Warden of the Edge',
    emoji: '🗡️',
    model: 'ministral-3:14b',
    color: '#C0392B',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'hurrian',
    name: 'Hurrian',
    role: 'warden',
    wardenTitle: 'Warden of the Deep',
    emoji: '🌊',
    model: 'qwen3.5:35b',
    color: '#2980B9',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'jovin',
    name: 'Jovin',
    role: 'warden',
    wardenTitle: 'Warden of the Heir',
    emoji: '☀️',
    model: 'jewel-proxy',
    color: '#F1C40F',
    memoryCount: 0,
    lastActive: null,
  },
  {
    id: 'herus',
    name: 'Herus',
    role: 'warden',
    wardenTitle: 'Warden of the Step',
    emoji: '⏶',
    model: 'devstral',
    color: '#7F8C8D',
    memoryCount: 0,
    lastActive: null,
  },
];

// ── Seed function ──────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Kingdom Vault — Firestore Seed');
  console.log(`   Project: ${admin.app().options.projectId}`);
  console.log(`   Seeding ${PARTICIPANTS.length} participants…\n`);

  const batch = db.batch();

  for (const participant of PARTICIPANTS) {
    const { id, ...data } = participant;
    const ref = db.collection('participants').doc(id);
    // merge: true — won't overwrite subcollections (memories, sessions, logs)
    batch.set(ref, {
      ...data,
      seededAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();

  console.log('✅ Participants seeded:');
  for (const p of PARTICIPANTS) {
    console.log(`   ${p.emoji}  ${p.id.padEnd(12)} — ${p.wardenTitle}`);
  }

  console.log('\n🏰 Kingdom Vault Firestore is ready.');
}

// ── Run ────────────────────────────────────────────────────────────────────────

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
