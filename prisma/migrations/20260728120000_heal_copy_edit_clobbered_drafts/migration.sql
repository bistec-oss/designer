-- One-time data repair: restore drafts whose status was clobbered by a copy edit.
--
-- PATCH /api/drafts/[id] used to flip an EXPORTED draft to IN_PROGRESS on any
-- copy edit ("the export is stale"). IN_PROGRESS means "generation is running",
-- so every consumer misread it: the draft vanished from the library (it filters
-- on EXPORTED), Refine design / Edit inline disappeared, Regenerate copy
-- answered 409 'Draft is not ready for copy regeneration', and after 15 minutes
-- the lazy sweep marked the draft FAILED with 'Generation was interrupted.'
--
-- The flip is gone, but already-stranded drafts remain — and a draft missing
-- from the library can't be opened, so the read-time heal in the GET handler
-- would never fire for them. Repair them in bulk here.
--
-- Safe by construction: exportUrl is only ever written together with status
-- EXPORTED, so a row with a rendered export AND html AND a revision pointer had
-- finished generating. A genuinely interrupted generation has exportUrl NULL and
-- is left alone.
UPDATE "Draft"
SET "status" = 'EXPORTED',
    "failureReason" = NULL
WHERE "exportUrl" IS NOT NULL
  AND "htmlContent" IS NOT NULL
  AND "currentRevisionNumber" IS NOT NULL
  AND (
    "status" = 'IN_PROGRESS'
    OR ("status" = 'FAILED' AND "failureReason" = 'Generation was interrupted. Please retry.')
  );
