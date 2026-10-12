ALTER TABLE "eval_suite_cases" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_suite_cases" ADD COLUMN "skill_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_suite_cases" ADD CONSTRAINT "eval_suite_cases_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_cases_skill_name_idx" ON "eval_suite_cases" USING btree ("skill_id","name");--> statement-breakpoint
ALTER TABLE "eval_suite_cases" ADD CONSTRAINT "eval_suite_cases_owner_check" CHECK (("eval_suite_cases"."agent_id" IS NULL) <> ("eval_suite_cases"."skill_id" IS NULL));