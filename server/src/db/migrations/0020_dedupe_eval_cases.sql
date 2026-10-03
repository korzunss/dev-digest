-- Merge duplicate eval_cases per (workspace_id, owner_kind, owner_id, name) before
-- 0021 adds the unique index. Keeps the case with the latest eval_runs.ran_at
-- (no runs ranks last, ties by id), re-points the others' eval_runs, deletes the rest.
WITH ranked AS (
  SELECT c."id",
         first_value(c."id") OVER (
           PARTITION BY c."workspace_id", c."owner_kind", c."owner_id", c."name"
           ORDER BY r.last_ran DESC NULLS LAST, c."id" DESC
         ) AS keep_id
  FROM "eval_cases" c
  LEFT JOIN (SELECT "case_id", max("ran_at") AS last_ran FROM "eval_runs" GROUP BY "case_id") r
    ON r."case_id" = c."id"
)
UPDATE "eval_runs" er SET "case_id" = ranked.keep_id
FROM ranked WHERE er."case_id" = ranked."id" AND ranked."id" <> ranked.keep_id;
--> statement-breakpoint
WITH ranked AS (
  SELECT c."id",
         first_value(c."id") OVER (
           PARTITION BY c."workspace_id", c."owner_kind", c."owner_id", c."name"
           ORDER BY r.last_ran DESC NULLS LAST, c."id" DESC
         ) AS keep_id
  FROM "eval_cases" c
  LEFT JOIN (SELECT "case_id", max("ran_at") AS last_ran FROM "eval_runs" GROUP BY "case_id") r
    ON r."case_id" = c."id"
)
DELETE FROM "eval_cases" c USING ranked
WHERE c."id" = ranked."id" AND ranked."id" <> ranked.keep_id;
