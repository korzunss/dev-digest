CREATE TABLE "eval_case_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suite_run_id" uuid NOT NULL,
	"case_id" uuid,
	"case_name" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_suite_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"input_diff" text NOT NULL,
	"input_files" jsonb NOT NULL,
	"input_meta" jsonb,
	"expected" jsonb NOT NULL,
	"source_finding_id" uuid,
	"source_pr_id" uuid,
	"last_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"skills" jsonb NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cases_total" integer DEFAULT 0 NOT NULL,
	"cases_done" integer DEFAULT 0 NOT NULL,
	"cases_passed" integer DEFAULT 0 NOT NULL,
	"cases_errored" integer DEFAULT 0 NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"cost_usd" double precision
);
--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_suite_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("suite_run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_case_id_eval_suite_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_suite_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_cases" ADD CONSTRAINT "eval_suite_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_cases" ADD CONSTRAINT "eval_suite_cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_cases" ADD CONSTRAINT "eval_suite_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_cases" ADD CONSTRAINT "eval_suite_cases_source_pr_id_pull_requests_id_fk" FOREIGN KEY ("source_pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_case_results_run_idx" ON "eval_case_results" USING btree ("suite_run_id");--> statement-breakpoint
CREATE INDEX "eval_case_results_case_idx" ON "eval_case_results" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_cases_agent_name_idx" ON "eval_suite_cases" USING btree ("agent_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_cases_source_finding_idx" ON "eval_suite_cases" USING btree ("source_finding_id");--> statement-breakpoint
CREATE INDEX "eval_suite_cases_source_pr_idx" ON "eval_suite_cases" USING btree ("source_pr_id");--> statement-breakpoint
CREATE INDEX "eval_suite_runs_agent_started_idx" ON "eval_suite_runs" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "eval_suite_runs_workspace_started_idx" ON "eval_suite_runs" USING btree ("workspace_id","started_at");