import { listImportViews } from "@cairn/db";
import { can, MATURITY_NAMES } from "@cairn/shared";
import { FolderInput } from "lucide-react";
import Link from "next/link";
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
import { getApi } from "@/lib/api";
import { formatDate, scoreTone, TONE_TEXT } from "@/lib/format";
import { getDb, isImportConfigured, viewerMayImport } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
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
        title="Projets"
        description={`${projects.length} projets · tri par score croissant`}
        actions={
          viewerMayImport(viewer) ? (
            <Link href="/projects/import" className={buttonVariants({ size: "sm" })}>
              <FolderInput aria-hidden /> Importer un dépôt
            </Link>
          ) : null
        }
      />
      {imports.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Dépôts importés
            <Badge variant="success">Données réelles</Badge>
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
              <TableHead>Projet</TableHead>
              {viewer.role === "admin" || viewer.role === "superadmin" ? (
                <TableHead>Équipe</TableHead>
              ) : null}
              <TableHead>Technologies</TableHead>
              <TableHead className="w-44">Score IA</TableHead>
              <TableHead>Maturité</TableHead>
              <TableHead>Porte</TableHead>
              <TableHead className="text-right">Problèmes</TableHead>
              <TableHead>Dernier scan</TableHead>
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
                    {p.tech.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
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
                  {p.maturity} · {MATURITY_NAMES[p.maturity]}
                </TableCell>
                <TableCell>
                  <GateBadge status={p.gate} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.openIssues}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(p.lastScan)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
