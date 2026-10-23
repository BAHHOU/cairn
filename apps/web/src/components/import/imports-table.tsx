import type { ImportView } from "@cairn/shared";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import { useFormat } from "@/i18n/format";

export function ImportsTable({ imports }: { imports: ImportView[] }) {
  const t = useTranslations("import.table");
  const fmt = useFormat();
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("repository")}</TableHead>
          <TableHead>{t("branch")}</TableHead>
          <TableHead>{t("status")}</TableHead>
          <TableHead>{t("commit")}</TableHead>
          <TableHead>{t("technologies")}</TableHead>
          <TableHead>{t("requested")}</TableHead>
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
              <Link href={`/projects/import/${i.id}`} title={t("runDetail")}>
                <ImportStatusBadge status={i.status} />
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">{i.commitSha?.slice(0, 10) ?? "—"}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {i.facts?.technologies.length ? (
                  i.facts.technologies.map((tech) => (
                    <Badge key={tech} variant="outline">
                      {tech}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
              {fmt.date(i.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
