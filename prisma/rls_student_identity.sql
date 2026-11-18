-- =============================================================================
-- WOFS Student Identity & Registration — PostgreSQL / Supabase RLS Policies
-- =============================================================================
-- Protects Student identity records, single-use registration invitations,
-- manual verification requests, biometric/identity verification records,
-- and duplicate review cases against unauthorized client access.

-- 1. Enable Row Level Security on all identity & registration tables
ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentVerificationRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdentityVerificationRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DuplicateReviewCase" ENABLE ROW LEVEL SECURITY;

-- 2. Helper function to extract authenticated portal UserID from session setting
CREATE OR REPLACE FUNCTION public.wofs_current_user_id()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::INTEGER;
$$;

CREATE OR REPLACE FUNCTION public.wofs_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('app.current_user_role', true), '');
$$;

-- 3. Student Table Policies:
--    - Students can read ONLY their own row ("UserID" = wofs_current_user_id()).
--    - Parents can read linked wards via ParentStudentLink.
--    - Students can only update non-identity profile fields (AvatarUrl, PreferredName, ParentContact)
--      via server actions; AdmissionNo (WOFS-STU-YYYY-XXXXXX), Uuid, ClassID, and IdentityVerified
--      are strictly immutable by students.
DROP POLICY IF EXISTS "student_self_read" ON "Student";
CREATE POLICY "student_self_read" ON "Student"
  FOR SELECT
  USING (
    "UserID" = public.wofs_current_user_id()
    OR public.wofs_current_user_role() IN ('SUPER_ADMIN', 'PRINCIPAL', 'ADMISSIONS', 'BURSAR', 'TEACHER', 'FORM_MASTER', 'Admin', 'Teacher')
    OR EXISTS (
      SELECT 1 FROM "ParentStudentLink" psl
      JOIN "Parent" p ON p.id = psl."ParentID"
      WHERE psl."StudentID" = "Student"."StudentID"
        AND p."UserID" = public.wofs_current_user_id()
    )
  );

DROP POLICY IF EXISTS "student_admin_all" ON "Student";
CREATE POLICY "student_admin_all" ON "Student"
  FOR ALL
  USING (
    public.wofs_current_user_role() IN ('SUPER_ADMIN', 'PRINCIPAL', 'ADMISSIONS', 'Admin')
  )
  WITH CHECK (
    public.wofs_current_user_role() IN ('SUPER_ADMIN', 'PRINCIPAL', 'ADMISSIONS', 'Admin')
  );

-- 4. StudentClaim, StudentSequence, IdentityVerificationRecord, DuplicateReviewCase:
--    Strictly restricted to server-side service role / administrative roles.
--    Invitation hashes, verification tokens, and biometric captures are never exposed to client queries.
DROP POLICY IF EXISTS "student_claim_admin_only" ON "StudentClaim";
CREATE POLICY "student_claim_admin_only" ON "StudentClaim"
  FOR ALL
  USING (public.wofs_current_user_role() IN ('SUPER_ADMIN', 'PRINCIPAL', 'ADMISSIONS', 'Admin'));

DROP POLICY IF EXISTS "student_sequence_admin_only" ON "StudentSequence";
CREATE POLICY "student_sequence_admin_only" ON "StudentSequence"
  FOR ALL
  USING (public.wofs_current_user_role() IN ('SUPER_ADMIN', 'PRINCIPAL', 'ADMISSIONS', 'Admin'));

DROP POLICY IF EXISTS "identity_verification_admin_only" ON "IdentityVerificationRecord";
CREATE POLICY "identity_verification_admin_only" ON "IdentityVerificationRecord"
  FOR ALL
  USING (public.wofs_current_user_role() IN ('SUPER_ADMIN', 'PRINCIPAL', 'ADMISSIONS', 'Admin'));

DROP POLICY IF EXISTS "duplicate_review_admin_only" ON "DuplicateReviewCase";
CREATE POLICY "duplicate_review_admin_only" ON "DuplicateReviewCase"
  FOR ALL
  USING (public.wofs_current_user_role() IN ('SUPER_ADMIN', 'PRINCIPAL', 'ADMISSIONS', 'Admin'));

DROP POLICY IF EXISTS "verification_request_admin_only" ON "StudentVerificationRequest";
CREATE POLICY "verification_request_admin_only" ON "StudentVerificationRequest"
  FOR ALL
  USING (public.wofs_current_user_role() IN ('SUPER_ADMIN', 'PRINCIPAL', 'ADMISSIONS', 'Admin'));
