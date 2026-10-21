CREATE TYPE "public"."import_status" AS ENUM('queued', 'cloning', 'scanning', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."provenance" AS ENUM('measured', 'declared', 'estimated');--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"url" text,
	"host" text NOT NULL,
	"full_path" text NOT NULL,
	"branch" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"credential_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_import" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"status" "import_status" DEFAULT 'queued' NOT NULL,
	"requested_sha" text,
	"commit_sha" text,
	"error_code" text,
	"error_message" text,
	"facts" jsonb,
	"requested_by" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"commit_sha" text NOT NULL,
	"facts" jsonb NOT NULL,
	"score" integer NOT NULL,
	"axes" jsonb NOT NULL,
	"maturity" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"source" text NOT NULL,
	"tool" text NOT NULL,
	"model" text NOT NULL,
	"repo" text,
	"ticket" text,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"cached" integer,
	"duration_ms" integer,
	"outcome" text,
	"provenance" "provenance" NOT NULL,
	"ts" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository" ADD CONSTRAINT "repository_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_import" ADD CONSTRAINT "repository_import_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created" ON "audit_event" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_team_name" ON "repository" USING btree ("team_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_source" ON "repository" USING btree ("host","full_path","branch");--> statement-breakpoint
CREATE INDEX "repository_import_repo_created" ON "repository_import" USING btree ("repository_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_repo_commit" ON "scan" USING btree ("repository_id","commit_sha");--> statement-breakpoint
CREATE INDEX "usage_team_repo_ts" ON "usage_event" USING btree ("team_id","repo","ts");