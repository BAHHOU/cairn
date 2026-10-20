import type { Issue } from "@cairn/shared";
import Link from "next/link";
import { SeverityBadge, TypeBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTokens } from "@/lib/format";

/** The token column only exists when the server sent the figure, i.e. for allowed roles. */
export function IssueTable({
  issues,
  showProject = true,
}: {
  issues: Issue[];
  showProject?: boolean;
}) {
  const showTokens = issues.some((i) => i.wastedTokensMonth !== undefined);

  if (issues.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">Aucun problème ouvert.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Sévérité</TableHead>
          <TableHead>Problème</TableHead>
          {showProject ? <TableHead>Projet</TableHead> : null}
          <TableHead>Fichier</TableHead>
          <TableHead className="text-right">Effort</TableHead>
          {showTokens ? <TableHead className="text-right">Tokens perdus / mois</TableHead> : null}
          <TableHead>Correction</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((i) => (
          <TableRow key={i.id}>
            <TableCell>
              <SeverityBadge severity={i.severity} />
            </TableCell>
            <TableCell className="max-w-md">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{i.title}</span>
                <span className="text-xs text-muted-foreground">{i.why}</span>
                <span className="flex items-center gap-2">
                  <TypeBadge type={i.type} />
                  <span className="font-mono text-[11px] text-muted-foreground">{i.rule}</span>
                </span>
              </div>
            </TableCell>
            {showProject ? (
              <TableCell>
                <Link href={`/projects/${i.projectId}`} className="text-sm hover:underline">
                  {i.projectName}
                </Link>
              </TableCell>
            ) : null}
            <TableCell
              className="max-w-56 truncate font-mono text-xs text-muted-foreground"
              title={i.path}
            >
              {i.path}
              {i.line ? `:${i.line}` : ""}
            </TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">
              {i.effortMin} min
            </TableCell>
            {showTokens ? (
              <TableCell className="text-right tabular-nums">
                {i.wastedTokensMonth ? formatTokens(i.wastedTokensMonth) : "—"}
              </TableCell>
            ) : null}
            <TableCell>
              {i.fixable ? (
                <Badge variant="success">Automatique</Badge>
              ) : (
                <Badge variant="secondary">Manuelle</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
