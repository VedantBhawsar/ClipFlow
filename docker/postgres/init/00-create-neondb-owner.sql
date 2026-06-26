-- Pre-init script for the local-dev postgres container.
--
-- Runs BEFORE neon_backup.sql (lexical ordering puts 00-* first). The
-- dump was produced on Neon and references three roles that don't exist
-- in our local image:
--   - neondb_owner    : owner of every table and type in the dump
--   - cloud_admin     : role referenced by `ALTER DEFAULT PRIVILEGES FOR ROLE ...`
--   - neon_superuser  : GRANT target of those default-privilege statements
-- Without these present, the dump fails partway through with
-- `role "<name>" does not exist`.
--
-- All three are no-op stubs locally — we only need the role to *exist*
-- so the DDL parses, not for them to actually own anything.
--
-- CREATE ROLE has no IF NOT EXISTS in postgres < 16, so we use a DO block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    CREATE ROLE neondb_owner WITH LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloud_admin') THEN
    CREATE ROLE cloud_admin WITH LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser') THEN
    CREATE ROLE neon_superuser WITH LOGIN;
  END IF;
END
$$;