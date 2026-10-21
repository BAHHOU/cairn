import type { ImportView } from "@cairn/shared";
import Link from "next/link";
import { ImportStatusBadge } from "@/components/import/status";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export function ImportsTable({ imports }: { imports: ImportView[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Dépôt</TableHead>
          <TableHead>Branche</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Commit analysé</TableHead>
          <TableHead>Technologies</TableHead>
          <TableHead>Demandé</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {imports.map((i) => (
          <TableRow key={i.id}>
            <TableCell>
              <Link href={`/projects/${i.repository.id}`} className="font-medium hover:underline">
                {i.repository.fullPath}
              </Link>
              <div className="text-xs text-muted-foreground">
                {i.repository.team} · {i.repository.host}
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs">{i.repository.branch}</TableCell>
            <TableCell>
              <Link href={`/projects/import/${i.id}`} title="Détail de l'exécution">
                <ImportStatusBadge status={i.status} />
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">{i.commitSha?.slice(0, 10) ?? "—"}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {i.facts?.technologies.length ? (
                  i.facts.technologies.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
              {formatDate(i.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
