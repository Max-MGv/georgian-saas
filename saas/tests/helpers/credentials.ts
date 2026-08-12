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
