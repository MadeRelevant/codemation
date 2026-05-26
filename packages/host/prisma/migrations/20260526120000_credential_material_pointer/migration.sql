-- Migration: Credential material provider seam (credentials-vault sprint, story 01).
-- Adds the {material_source, material_ref} pointer on CredentialInstance.
-- See docs/design/credentials-oauth-unification.md "Material provider seam".
--
-- All existing rows are local-mode workspace rows; backfill the pointer to
-- {source: "local", ref: instance_id} so the bytes still resolve via the
-- existing PrismaCredentialStore tables (CredentialOAuth2Material /
-- CredentialSecretMaterial).

ALTER TABLE "CredentialInstance"
  ADD COLUMN "material_source" TEXT NOT NULL DEFAULT 'local';

ALTER TABLE "CredentialInstance"
  ADD COLUMN "material_ref" TEXT NOT NULL DEFAULT '';

UPDATE "CredentialInstance"
  SET "material_ref" = "instance_id"
  WHERE "material_ref" = '';
