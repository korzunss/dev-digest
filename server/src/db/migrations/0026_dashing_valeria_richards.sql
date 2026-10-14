INSERT INTO "agent_versions" ("agent_id", "version", "config_json")
SELECT a."id", a."version", jsonb_build_object(
  'provider', a."provider", 'model', a."model", 'system_prompt', a."system_prompt",
  'output_schema', a."output_schema", 'strategy', a."strategy", 'ci_fail_on', a."ci_fail_on",
  'repo_intel', a."repo_intel",
  'skills', COALESCE((SELECT jsonb_agg(s."skill_id" ORDER BY s."order") FROM "agent_skills" s WHERE s."agent_id" = a."id"), '[]'::jsonb),
  'skill_names', COALESCE((SELECT jsonb_object_agg(k."id", k."name") FROM "agent_skills" s JOIN "skills" k ON k."id" = s."skill_id" WHERE s."agent_id" = a."id"), '{}'::jsonb))
FROM "agents" a
WHERE NOT EXISTS (SELECT 1 FROM "agent_versions" v WHERE v."agent_id" = a."id" AND v."version" = a."version");
