---
name: credentials
description: Look up a stored login, password, API key, database URL, or other credential for the georgian-saas project from credentials.txt at the repo root. Use this skill whenever Max asks for a password, login, DB connection string, API key, or credential for this project — e.g. "what's the dev super-admin password", "give me the prod DB password", "resend api key", "supabase service role key for dev", "what's the admin login" — even if he doesn't name the file or say "credentials" explicitly, and even if he just asks "where do I log in as X". Do NOT use this for general questions about how auth/login code works, how to design an env var, or security best practices — only for retrieving a secret value that is already stored in that file.
---

# Credentials lookup

Max keeps every password, API key, and connection string for this project in one
gitignored file: `credentials.txt` at the repo root
(`C:\Users\Max\Desktop\claude-projects\georgian-saas\credentials.txt`). He doesn't
want to have to repeat that path every time — this skill's whole job is to read
that file and hand back exactly the piece he asked for.

## Steps

1. Read `C:\Users\Max\Desktop\claude-projects\georgian-saas\credentials.txt` directly.
   This is the only place to look — do not grep `.env` files, other vault notes, or
   anywhere else for credentials, even if you know of another location. If the
   requested credential isn't in this file, say so plainly instead of searching
   elsewhere or guessing.

2. The file is organized into `====` delimited sections (e.g. `NIKALAS MARANI —
   Supabase`, `DEV / STAGING — Supabase (georgian-saas-dev)`, `RESEND —
   Transactional Email`), and within a section there can be multiple labeled
   sub-blocks (e.g. two different "Admin panel login" entries for different
   users in the same dev section). Match Max's request against section headers
   and sub-block labels — things like "dev", "prod", "super-admin", "resend",
   "DB password" all map to specific blocks.

3. **If exactly one block matches**, reply with just that block's relevant
   lines (email/password, or key, or URL — whatever he asked for). No need to
   quote the whole section if he only asked for one field, e.g. just the
   password.

4. **If the request could match more than one block** (e.g. "the supabase
   password" matches both the prod and dev projects, or "admin login" matches
   both `maxb2bsaas@gmail.com` and `super-admin-dev@nikalasmarani.test` in the
   dev section), do not print any secret yet. List the matching section/block
   names and ask which one he means.

5. **If nothing matches**, say the credential isn't in `credentials.txt` — don't
   fall back to searching other files or inventing an answer.

## What not to do

- Don't paste the entire file when only one entry was asked for — that puts
  unrelated secrets (including prod keys) in the response unnecessarily.
- Don't copy anything from this file into other files, memory, config, or any
  external tool/service. This is a read-only, answer-in-chat-only lookup.
- Don't use this skill to answer general questions about authentication,
  environment variable setup, or security design — those aren't credential
  lookups, they're code questions.
