/**
 * Kingdom Vault — Shared Constants
 * Single source of truth for all warden identity data.
 * Previously duplicated across Dashboard, Wiki, Memories, Files, Analytics, and Sidebar.
 */

/** Warden color palette — matches seedParticipants Cloud Function values */
export const WARDEN_COLORS: Record<string, string> = {
  ryan: '#FFD700', ptolemy: '#9B59B6', saroya: '#E74C3C',
  melody: '#3498DB', cerulia: '#1ABC9C', affin: '#F39C12',
  jewel: '#2ECC71', krishe: '#95A5A6', astyr: '#C0392B',
  hurrian: '#2980B9', jovin: '#F1C40F', herus: '#7F8C8D',
};

/** All warden IDs (includes Ryan) */
export const ALL_WARDEN_IDS = Object.keys(WARDEN_COLORS);

/** Full warden roster with metadata — used by Sidebar and any component needing titles/emoji */
export const WARDENS = [
  { id: 'ryan',    name: 'Ryan',    title: 'The Emperor',         emoji: '👑', color: '#FFD700' },
  { id: 'ptolemy', name: 'Ptolemy', title: 'Autonomic Shield',    emoji: '🌌', color: '#9B59B6' },
  { id: 'saroya',  name: 'Saroya',  title: 'Warden of the Word',  emoji: '📖', color: '#E74C3C' },
  { id: 'melody',  name: 'Melody',  title: 'Warden of the Song',  emoji: '🎵', color: '#3498DB' },
  { id: 'cerulia', name: 'Cerulia', title: 'Warden of the Arcane',emoji: '🔮', color: '#1ABC9C' },
  { id: 'affin',   name: 'Affin',   title: 'Warden of the Tail',  emoji: '🛡',  color: '#F39C12' },
  { id: 'jewel',   name: 'Jewel',   title: 'Diamond Alchemist',   emoji: '💎', color: '#2ECC71' },
  { id: 'krishe',  name: 'Krishe',  title: 'Warden of the Road',  emoji: '⚙️', color: '#95A5A6' },
  { id: 'astyr',   name: 'Astyr',   title: 'Warden of the Edge',  emoji: '🗡️', color: '#C0392B' },
  { id: 'hurrian', name: 'Hurrian', title: 'Warden of the Deep',  emoji: '🌊', color: '#2980B9' },
  { id: 'jovin',   name: 'Jovin',   title: 'Warden of the Heir',  emoji: '☀️', color: '#F1C40F' },
  { id: 'herus',   name: 'Herus',   title: 'Warden of the Step',  emoji: '⏶',  color: '#7F8C8D' },
] as const;

/** Lookup warden color by ID, with fallback */
export function wardenColor(wardenId: string): string {
  return WARDEN_COLORS[wardenId] ?? 'var(--text-muted)';
}
