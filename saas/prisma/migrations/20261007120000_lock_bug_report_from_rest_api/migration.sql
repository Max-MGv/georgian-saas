-- BugReport is reached only through the app server (Prisma, connecting as the table
-- owner, which bypasses Row Level Security). It must NOT be reachable through
-- Supabase's auto-generated REST API with the public anon key, which ships in every
-- page's JavaScript. Found 2026-10-07: that key could read, insert, update and delete
-- every report (comments, submitter emails, tenant ids) on dev and production.
--
-- RLS on with NO policy = default-deny for every non-owner role; the REVOKE is the second,
-- independent lock (same belt-and-braces idea as the Tenant / PlatformConfig lockdown).
-- Guarded so a plain Postgres (e.g. a Prisma shadow database) without the Supabase roles
-- still applies this cleanly.
ALTER TABLE "BugReport" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "BugReport" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "BugReport" FROM authenticated';
  END IF;
END
$$;
