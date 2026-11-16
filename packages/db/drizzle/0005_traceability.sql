CREATE TABLE "repository_tracker_link" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"scope" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trace_snapshot" (
	"repository_id" text PRIMARY KEY NOT NULL,
	"summary" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_tracker_link" ADD CONSTRAINT "repository_tracker_link_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_tracker_link" ADD CONSTRAINT "repository_tracker_link_connection_id_tracker_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."tracker_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_snapshot" ADD CONSTRAINT "trace_snapshot_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repository_tracker_link_repository_idx" ON "repository_tracker_link" USING btree ("repository_id");