import { listImportViews } from "@cairn/db";
import { can } from "@cairn/shared";
import { FolderInput } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GateBadge } from "@/components/badges";
import { ImportsTable } from "@/components/import/imports-table";
import { PageHeader, ProgressBar } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { scoreTone, TONE_TEXT } from "@/lib/format";
import { getDb, isImportConfigured, viewerMayImport } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const t = await getTranslations("projects.list");
  const td = await getTranslations("domain");
  const fmt = await getFormat();
  const viewer = await getViewer();
  const projects = await (await getApi()).projects.list();
  const sorted = [...projects].sort((a, b) => a.score - b.score);

  let imports: Awaited<ReturnType<typeof listImportViews>> = [];
  if (can(viewer.role, "see.allTeams") && isImportConfigured()) {
    try {
      imports = await listImportViews(getDb(), 20);
    } catch {
      // The demo table below keeps working when the database is down.
    }
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { count: projects.length })}
        actions={
          viewerMayImport(viewer) ? (
            <Link href="/projects/import" className={buttonVariants({ size: "sm" })}>
              <FolderInput aria-hidden /> {t("import")}
            </Link>
          ) : null
        }
      />
      {imports.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {t("imported")}
            <Badge variant="success">{t("realData")}</Badge>
          </h2>
          <Card className="gap-0 py-0">
            <ImportsTable imports={imports} />
          </Card>
        </section>
      ) : null}
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("project")}</TableHead>
              {viewer.role === "admin" || viewer.role === "superadmin" ? (
                <TableHead>{t("team")}</TableHead>
              ) : null}
              <TableHead>{t("tech")}</TableHead>
              <TableHead className="w-44">{t("score")}</TableHead>
              <TableHead>{t("maturity")}</TableHead>
              <TableHead>{t("gate")}</TableHead>
              <TableHead className="text-right">{t("issues")}</TableHead>
              <TableHead>{t("lastScan")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{p.provider}</div>
                </TableCell>
                {viewer.role === "admin" || viewer.role === "superadmin" ? (
                  <TableCell>{p.team}</TableCell>
                ) : null}
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.tech.map((tech) => (
                      <Badge key={tech} variant="outline">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-7 text-right font-semibold tabular-nums",
                        TONE_TEXT[scoreTone(p.score)],
                      )}
                    >
                      {p.score}
                    </span>
                    <ProgressBar value={p.score} />
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {p.maturity} · {td(`maturity.${p.maturity}`)}
                </TableCell>
                <TableCell>
                  <GateBadge status={p.gate} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.openIssues}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {fmt.date(p.lastScan)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
