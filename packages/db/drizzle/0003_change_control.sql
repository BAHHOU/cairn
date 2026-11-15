CREATE TABLE "change_control_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"jira_base_url" text,
	"jira_auth_kind" text,
	"jira_user" text,
	"jira_token_enc" text,
	"jira_content_fields" jsonb,
	"policy" jsonb,
	"people" jsonb,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
