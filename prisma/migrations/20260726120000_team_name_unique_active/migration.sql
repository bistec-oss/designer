-- Scope Team name uniqueness to LIVE teams only.
--
-- Previously `Team.name` had a plain unique constraint (`Team_name_key`) that
-- also counted soft-deleted rows, so once a team was deleted (isDeleted = true)
-- its name was permanently reserved and could never be recreated.
--
-- Replace it with a partial unique index that ignores soft-deleted rows: at
-- most one LIVE team may hold a given name, while any number of deleted teams
-- may share it. Deleting a team now frees its name for reuse.

DROP INDEX "Team_name_key";

CREATE UNIQUE INDEX "Team_name_active_key" ON "Team"("name") WHERE "isDeleted" = false;
