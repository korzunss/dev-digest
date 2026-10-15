ALTER TABLE "ci_installations" ADD COLUMN "repo_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "mode" text DEFAULT 'pr' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "exported_agent_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "exported_ci_fail_on" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "runner_version" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "triggers" text[] DEFAULT ARRAY['opened','synchronize']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "post_as" text DEFAULT 'github_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_number" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "scan_cursor" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "local_pr_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo_full_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "github_run_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "run_attempt" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "head_sha" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_version" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "runner_version" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "error_class" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_local_pr_id_pull_requests_id_fk" FOREIGN KEY ("local_pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_repo_idx" ON "ci_installations" USING btree ("agent_id","repo");--> statement-breakpoint
CREATE INDEX "ci_installations_repo_idx" ON "ci_installations" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_run_attempt_idx" ON "ci_runs" USING btree ("workspace_id","repo_full_name","github_run_id","run_attempt");--> statement-breakpoint
CREATE INDEX "ci_runs_ws_ran_idx" ON "ci_runs" USING btree ("workspace_id","ran_at");--> statement-breakpoint
CREATE INDEX "ci_runs_installation_idx" ON "ci_runs" USING btree ("ci_installation_id","ran_at");--> statement-breakpoint
CREATE INDEX "ci_runs_agent_idx" ON "ci_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "ci_runs_local_pr_idx" ON "ci_runs" USING btree ("local_pr_id");