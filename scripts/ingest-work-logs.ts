#!/usr/bin/env npx tsx
// scripts/ingest-work-logs.ts
// Kingdom Vault — Submodule Work Log Ingestion
//
// Reads WORK_LOG.md from each Kingdom submodule, parses the most recent entry,
// and writes the parsed status to Firestore at:
//   /kingdom/projects/items/{submoduleId}
//
// Usage (manual):
//   npx tsx scripts/ingest-work-logs.ts
//
// Environment:
//   GOOGLE_APPLICATION_CREDENTIALS — path to Firebase service account JSON (optional)
//   FIREBASE_PROJECT_ID            — e.g. "omnia-kingdom-vault" (optional, falls back to default)
//
// ─────────────────────────────────────────────────────────────────────────────
// CRON INTEGRATION (Mac Mini)
// Add alongside the ingest-memory cron in crontab -e:
//
//   # Work log ingestion — every 15 minutes
//   */15 * * * * cd "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/vault" && npx tsx scripts/ingest-work-logs.ts >> /tmp/vault-worklogs.log 2>&1
//
// The script is idempotent — re-runs overwrite the same Firestore document
// with the freshest parsed entry. No duplicates accumulate.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';
import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────

const PARSER_MARKER = '<!-- PARSER: kingdom-vault-ingest -->';
const FIRESTORE_COLLECTION = ['kingdom', 'projects', 'items'] as const;

// ── Submodule Registry ────────────────────────────────────────────────────────
// The 13 Kingdom submodules. Paths that don't exist on disk are skipped
// gracefully. Add remaining submodules here as they become locally available.

interface SubmoduleEntry {
  id: string;
  name: string;
  path: string;
}

const SUBMODULES: SubmoduleEntry[] = [
  {
    id: 'ptolemy-parent',
    name: 'Ptolemy Parent',
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy",
  },
  {
    id: 'vault',
    name: 'Kingdom Vault',
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/vault",
  },
  {
    id: 'traid-ngen',
    name: 'TRaiD-ngen',
    path: '/Users/ptolemy/Desktop/TRaiD-ngen',
  },
  {
    id: 'ptolemy-live',
    name: 'ptolemy.live',
    path: '/Users/ptolemy/Desktop/ptolemy-live',
  },
  {
    id: 'omnia-theatre',
    name: 'Omnia Theatre',
    path: '/Users/ptolemy/Desktop/omnia-theatre',
  },
  {
    id: 'saroya',
    name: 'Saroya Drive',
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Saroya",
  },
  {
    id: 'chefs-kiss-tgc',
    name: "Chef's Kiss TGC",
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Chefs_Kiss_TGC",
  },
  {
    id: 'ptolemy-kb',
    name: "Ptolemy's Knowledge Base",
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy's Knowledge-base",
  },
  // ── Submodules not yet locally present — skip gracefully if absent ──────────
  {
    id: 'ptolemy-core',
    name: 'Ptolemy Core',
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/ptolemy-core",
  },
  {
    id: 'ptolemy-studio',
    name: 'Ptolemy Studio',
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/ptolemy-studio",
  },
  {
    id: 'ollama-bridge',
    name: 'Ollama Bridge',
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/melodys-metronome",
  },
  {
    id: 'ptolemy-discord',
    name: 'Ptolemy Discord',
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/ptolemy-studio",
  },
  {
    id: 'insain-ngen',
    name: 'Insain-ngen',
    path: "/Users/ptolemy/Library/CloudStorage/GoogleDrive-ryan@omniatheatre.com/My Drive/AI-Projects/Ptolemy/insain-ngen",
  },
];

// ── Logging ───────────────────────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, err?: unknown): void {
  const prefix = `[${new Date().toISOString()}] [ingest-work-logs] [${level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(`${prefix} ${message}`, err ?? '');
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ── Status Parsing ────────────────────────────────────────────────────────────

type WorkLogStatus = 'stable' | 'in-progress' | 'blocked' | 'inactive';

interface StatusParseResult {
  status: WorkLogStatus;
  statusEmoji: string;
  statusLabel: string;
}

/**
 * Parses the status line: "- **Status:** 🟢 Stable | ..."
 * Returns the first emoji+label found, mapped to our canonical status slug.
 */
function parseStatus(statusLine: string): StatusParseResult {
  if (/🟢/.test(statusLine)) {
    return { status: 'stable', statusEmoji: '🟢', statusLabel: 'Stable' };
  }
  if (/🟡/.test(statusLine)) {
    return { status: 'in-progress', statusEmoji: '🟡', statusLabel: 'In Progress' };
  }
  if (/🔴/.test(statusLine)) {
    return { status: 'blocked', statusEmoji: '🔴', statusLabel: 'Blocked' };
  }
  if (/⚫/.test(statusLine)) {
    return { status: 'inactive', statusEmoji: '⚫', statusLabel: 'Inactive' };
  }
  // Default: treat unrecognised status as inactive rather than throwing
  return { status: 'inactive', statusEmoji: '⚫', statusLabel: 'Unknown' };
}

/**
 * Extracts the value after "**FieldName:**" from a bullet line.
 * e.g. "- **Warden:** Melody" → "Melody"
 */
function extractField(lines: string[], fieldName: string): string {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return match[1].trim();
  }
  return '';
}

// ── Work Log Document Shape (Firestore) ───────────────────────────────────────

interface WorkLogDoc {
  id: string;
  name: string;
  workLogStatus: WorkLogStatus; // renamed from 'status' to avoid collision with ProjectStatus
  statusEmoji: string;
  statusLabel: string;
  activeTask: string;
  warden: string;
  lastOutput: string;
  nextAction: string;
  blockers: string;
  lastUpdated: ReturnType<typeof FieldValue.serverTimestamp>;
  logDate: string;
}

// ── Parser ────────────────────────────────────────────────────────────────────

interface ParseResult {
  success: boolean;
  reason?: string;
  doc?: Omit<WorkLogDoc, 'id' | 'name' | 'lastUpdated'>;
}

/**
 * Parses a WORK_LOG.md file content.
 * Returns the structured data extracted from the most recent (first) `## YYYY-MM-DD` entry.
 */
function parseWorkLog(content: string): ParseResult {
  // Guard: must contain the parser marker
  if (!content.includes(PARSER_MARKER)) {
    return { success: false, reason: 'missing parser marker' };
  }

  // Find the first date section header: ## YYYY-MM-DD
  const dateHeaderRegex = /^## (\d{4}-\d{2}-\d{2})\s*$/m;
  const dateMatch = content.match(dateHeaderRegex);
  if (!dateMatch) {
    return { success: false, reason: 'no date header (## YYYY-MM-DD) found' };
  }

  const logDate = dateMatch[1];
  const entryStart = content.indexOf(dateMatch[0]);

  // Slice from the first date header to the next date header (or EOF)
  const remainingAfterDate = content.slice(entryStart + dateMatch[0].length);
  const nextDateMatch = remainingAfterDate.match(dateHeaderRegex);
  const entryBody = nextDateMatch
    ? remainingAfterDate.slice(0, remainingAfterDate.indexOf(nextDateMatch[0]))
    : remainingAfterDate;

  const entryLines = entryBody.split('\n').map((l) => l.trim()).filter(Boolean);

  if (entryLines.length === 0) {
    return { success: false, reason: `date entry ${logDate} is empty` };
  }

  // Find the Status line
  const statusLine = entryLines.find((l) => /\*\*Status:\*\*/.test(l));
  if (!statusLine) {
    return { success: false, reason: `no **Status:** field in entry ${logDate}` };
  }

  const { status: workLogStatus, statusEmoji, statusLabel } = parseStatus(statusLine);
  const activeTask = extractField(entryLines, 'Active task');
  const warden = extractField(entryLines, 'Warden');
  const lastOutput = extractField(entryLines, 'Output').slice(0, 500); // Firestore char safety
  const nextAction = extractField(entryLines, 'Next');
  const blockers = extractField(entryLines, 'Blockers');

  return {
    success: true,
    doc: {
      workLogStatus,
      statusEmoji,
      statusLabel,
      activeTask,
      warden,
      lastOutput,
      nextAction,
      blockers,
      logDate,
    },
  };
}

// ── Ingestion Stats ───────────────────────────────────────────────────────────

interface IngestStats {
  total: number;
  written: number;
  skipped: number;
  missing: number;
  failed: number;
}

// ── Core Ingestion ────────────────────────────────────────────────────────────

async function ingestSubmodule(
  submodule: SubmoduleEntry,
  db: Firestore,
  stats: IngestStats,
): Promise<void> {
  const workLogPath = path.join(submodule.path, 'WORK_LOG.md');

  // 1. Check path exists
  if (!fs.existsSync(submodule.path)) {
    log('warn', `[${submodule.id}] path does not exist — skipping`);
    stats.skipped++;
    return;
  }

  // 2. Check WORK_LOG.md exists
  if (!fs.existsSync(workLogPath)) {
    log('warn', `[${submodule.id}] WORK_LOG.md not found — skipping`);
    stats.missing++;
    return;
  }

  // 3. Read and parse
  let content: string;
  try {
    content = fs.readFileSync(workLogPath, 'utf-8');
  } catch (err) {
    log('error', `[${submodule.id}] failed to read WORK_LOG.md`, err);
    stats.failed++;
    return;
  }

  const result = parseWorkLog(content);
  if (!result.success || !result.doc) {
    log('warn', `[${submodule.id}] parse skipped — ${result.reason}`);
    stats.skipped++;
    return;
  }

  // 4. Write to Firestore
  const docRef = db
    .collection(FIRESTORE_COLLECTION[0])
    .doc(FIRESTORE_COLLECTION[1])
    .collection(FIRESTORE_COLLECTION[2])
    .doc(submodule.id);

  const payload: WorkLogDoc = {
    id: submodule.id,
    name: submodule.name,
    ...result.doc,
    lastUpdated: FieldValue.serverTimestamp(),
  };

  try {
    await docRef.set(payload, { merge: true });
    log(
      'info',
      `[${submodule.id}] → status: ${result.doc.statusEmoji} ${result.doc.statusLabel} (${result.doc.logDate})`,
    );
    stats.written++;
  } catch (err) {
    log('error', `[${submodule.id}] Firestore write failed`, err);
    stats.failed++;
  }
}

// ── Entry Point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'omnia-kingdom-vault';
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  log('info', '─── Kingdom Vault Work Log Ingestion ───');
  log('info', `Firebase project : ${projectId}`);
  log('info', `Submodules registered: ${SUBMODULES.length}`);

  // Initialise firebase-admin (idempotent — same pattern as ingest-memory.ts)
  if (admin.apps.length === 0) {
    if (credPath) {
      const serviceAccount = (
        await import(credPath, { assert: { type: 'json' } })
      ).default as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId,
      });
    } else {
      // Application Default Credentials (gcloud auth application-default login)
      admin.initializeApp({ projectId });
    }
  }

  const db = getFirestore();

  const stats: IngestStats = {
    total: SUBMODULES.length,
    written: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
  };

  // Sequential — keeps Firestore write rate low and logs readable
  for (const submodule of SUBMODULES) {
    await ingestSubmodule(submodule, db, stats);
  }

  log('info', '─── Ingestion complete ───');
  log('info', `Total    : ${stats.total}`);
  log('info', `Written  : ${stats.written}`);
  log('info', `Missing  : ${stats.missing}  (WORK_LOG.md not present yet)`);
  log('info', `Skipped  : ${stats.skipped}  (no marker or parse issue)`);
  log('info', `Failed   : ${stats.failed}`);

  if (stats.failed > 0) {
    process.exit(1); // Signal cron failure for monitoring
  }
}

main().catch((err) => {
  log('error', 'Unhandled fatal error', err);
  process.exit(1);
});
