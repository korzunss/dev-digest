ALTER TABLE "skill_versions" ADD COLUMN "paths" text[];--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "paths" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_paths_max" CHECK (cardinality("skills"."paths") <= 20);