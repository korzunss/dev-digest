CREATE TABLE "agent_context_docs" (
	"agent_id" uuid NOT NULL,
	"path" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "agent_context_docs_agent_id_path_pk" PRIMARY KEY("agent_id","path")
);
--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "context_globs" text[] DEFAULT ARRAY['**/{specs,docs,insights}/**/*.md']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_context_docs" ADD CONSTRAINT "agent_context_docs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;