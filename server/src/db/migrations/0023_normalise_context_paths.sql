-- Custom SQL migration file, put your code below! --
-- Plan 25 (S7): canonicalise stored project-context paths to match normaliseDocPath
-- (backslash → '/', collapse '//', strip leading './', drop inner '/./'). Duplicates that
-- collide after canonicalisation keep the lowest (order, path) row. Idempotent.
DELETE FROM "agent_context_docs" a USING "agent_context_docs" b
WHERE a."agent_id" = b."agent_id" AND a."path" <> b."path"
  AND regexp_replace(regexp_replace(regexp_replace(replace(a."path", '\', '/'), '/{2,}', '/', 'g'), '^(\./)+', ''), '/(\./)+', '/', 'g') = regexp_replace(regexp_replace(regexp_replace(replace(b."path", '\', '/'), '/{2,}', '/', 'g'), '^(\./)+', ''), '/(\./)+', '/', 'g')
  AND (a."order", a."path") > (b."order", b."path");
--> statement-breakpoint
UPDATE "agent_context_docs" SET "path" = regexp_replace(regexp_replace(regexp_replace(replace("path", '\', '/'), '/{2,}', '/', 'g'), '^(\./)+', ''), '/(\./)+', '/', 'g') WHERE "path" <> regexp_replace(regexp_replace(regexp_replace(replace("path", '\', '/'), '/{2,}', '/', 'g'), '^(\./)+', ''), '/(\./)+', '/', 'g');
--> statement-breakpoint
DELETE FROM "skill_context_docs" a USING "skill_context_docs" b
WHERE a."skill_id" = b."skill_id" AND a."path" <> b."path"
  AND regexp_replace(regexp_replace(regexp_replace(replace(a."path", '\', '/'), '/{2,}', '/', 'g'), '^(\./)+', ''), '/(\./)+', '/', 'g') = regexp_replace(regexp_replace(regexp_replace(replace(b."path", '\', '/'), '/{2,}', '/', 'g'), '^(\./)+', ''), '/(\./)+', '/', 'g')
  AND (a."order", a."path") > (b."order", b."path");
--> statement-breakpoint
UPDATE "skill_context_docs" SET "path" = regexp_replace(regexp_replace(regexp_replace(replace("path", '\', '/'), '/{2,}', '/', 'g'), '^(\./)+', ''), '/(\./)+', '/', 'g') WHERE "path" <> regexp_replace(regexp_replace(regexp_replace(replace("path", '\', '/'), '/{2,}', '/', 'g'), '^(\./)+', ''), '/(\./)+', '/', 'g');
