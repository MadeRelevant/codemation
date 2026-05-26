-- Migration: Credential material provider seam (credentials-vault sprint, story 01) - SQLite variant.
-- Adds the {material_source, material_ref} pointer on CredentialInstance.
-- See docs/design/credentials-oauth-unification.md "Material provider seam".

ALTER TABLE "CredentialInstance"
  ADD COLUMN "material_source" TEXT NOT NULL DEFAULT 'local';

ALTER TABLE "CredentialInstance"
  ADD COLUMN "material_ref" TEXT NOT NULL DEFAULT '';

UPDATE "CredentialInstance"
  SET "material_ref" = "instance_id"
  WHERE "material_ref" = '';
