CREATE INDEX "reviews_pr_idx" ON "reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_idx" ON "agent_runs" USING btree ("pr_id");