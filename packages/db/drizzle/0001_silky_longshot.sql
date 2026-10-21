CREATE TABLE "repository_scan" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"import_id" text NOT NULL,
	"commit_sha" text NOT NULL,
	"report" jsonb NOT NULL,
	"architecture" jsonb NOT NULL,
	"code_graph" jsonb NOT NULL,
	"file_index" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_scan" ADD CONSTRAINT "repository_scan_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_scan" ADD CONSTRAINT "repository_scan_import_id_repository_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."repository_import"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_scan_import" ON "repository_scan" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "repository_scan_repo_created" ON "repository_scan" USING btree ("repository_id","created_at");