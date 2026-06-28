/**
 * Kingdom Vault — Centralized Configuration
 * All environment-dependent values live here.
 */

// Cloud Functions base URL — configurable per environment
export const CF_BASE_URL = process.env.NEXT_PUBLIC_VAULT_API_BASE
  || 'https://us-central1-omnia-kingdom-vault.cloudfunctions.net';

/** Build a full Cloud Function URL */
export function cfUrl(functionName: string): string {
  return `${CF_BASE_URL}/${functionName}`;
}
