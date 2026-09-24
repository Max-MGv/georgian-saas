import fs from 'fs';
import path from 'path';

// Reads credentials.txt directly at test-run time instead of copying any
// value into a fixture/.env file — the password lives in exactly one place
// on disk. See playwright/notes/07-admin-login.md and credentials.txt's own
// "never commit" header. Do not persist the return value to disk or logs.
const CREDENTIALS_PATH = path.resolve(__dirname, '../../../credentials.txt');

interface Credential {
  email: string;
  password: string;
}

function extractBlock(fileText: string, blockHeader: string): Credential {
  const headerIndex = fileText.indexOf(blockHeader);
  if (headerIndex === -1) {
    throw new Error(`credentials.txt: block "${blockHeader}" not found`);
  }
  const section = fileText.slice(headerIndex, headerIndex + 400);
  const email = section.match(/Email:\s*(\S+)/)?.[1];
  const password = section.match(/Password:\s*(\S+)/)?.[1];
  if (!email || !password) {
    throw new Error(`credentials.txt: could not parse email/password under "${blockHeader}"`);
  }
  return { email, password };
}

export function getTenantAdminCredentials(): Credential {
  const text = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
  // Tenant-locked login, matches real admin usage for Staging Winery.
  return extractBlock(text, 'Admin panel login (Supabase Auth — dev project, for staging /admin):');
}

export function getSuperAdminCredentials(): Credential {
  const text = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
  // Cross-tenant access — only for tests that need it (theme preset
  // switching, onboarding wizard on a separate test tenant).
  return extractBlock(text, 'Super-admin login (Supabase Auth — dev project ONLY, for /super-admin testing):');
}

/**
 * Resend's API key, read the same way as everything else in this file — never
 * copied into a fixture/.env. Added for tier5-payment-e2e's settlement-email
 * check (Chunk 3, Plan-PaymentE2ETesting.md): the only way to independently
 * confirm whether `settle.ts`'s fire-and-forget settlement email actually
 * reached Resend is to query Resend's own send log directly
 * (`GET api.resend.com/emails`), the same account/key documented in
 * credentials.txt's "RESEND — Transactional Email" block.
 */
export function getResendApiKey(): string {
  const text = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
  const headerIndex = text.indexOf('RESEND — Transactional Email');
  if (headerIndex === -1) {
    throw new Error('credentials.txt: "RESEND — Transactional Email" block not found');
  }
  const section = text.slice(headerIndex, headerIndex + 600);
  const match = section.match(/RESEND_API_KEY[^\n]*\n(\S+)/);
  if (!match) {
    throw new Error('credentials.txt: could not parse RESEND_API_KEY under the RESEND block');
  }
  return match[1];
}
