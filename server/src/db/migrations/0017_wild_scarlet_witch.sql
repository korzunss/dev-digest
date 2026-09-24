DROP INDEX "repos_ws_fullname_uq";--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "provider" text DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "api_base" text;--> statement-breakpoint
CREATE UNIQUE INDEX "repos_ws_forge_fullname_uq" ON "repos" USING btree ("workspace_id","provider",coalesce("api_base", ''),"full_name");