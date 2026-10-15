DROP INDEX "ci_runs_run_attempt_idx";--> statement-breakpoint
DROP INDEX "ci_runs_installation_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_run_attempt_idx" ON "ci_runs" USING btree ("workspace_id","repo_full_name","github_run_id","run_attempt");--> statement-breakpoint
CREATE INDEX "ci_runs_installation_idx" ON "ci_runs" USING btree ("ci_installation_id","ran_at");