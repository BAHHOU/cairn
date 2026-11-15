CREATE TABLE "tracker_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"settings" jsonb NOT NULL,
	"secret_enc" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_control_settings" DROP COLUMN "jira_base_url";--> statement-breakpoint
ALTER TABLE "change_control_settings" DROP COLUMN "jira_auth_kind";--> statement-breakpoint
ALTER TABLE "change_control_settings" DROP COLUMN "jira_user";--> statement-breakpoint
ALTER TABLE "change_control_settings" DROP COLUMN "jira_token_enc";--> statement-breakpoint
ALTER TABLE "change_control_settings" DROP COLUMN "jira_content_fields";