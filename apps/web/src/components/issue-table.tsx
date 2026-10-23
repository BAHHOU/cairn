import type { Issue } from "@cairn/shared";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import { useFormat } from "@/i18n/format";

/** The token column only exists when the server sent the figure, i.e. for allowed roles. */
export function IssueTable({
  issues,
  showProject = true,
}: {
  issues: Issue[];
  showProject?: boolean;
}) {
  const t = useTranslations("issues.table");
  const fmt = useFormat();
  const showTokens = issues.some((i) => i.wastedTokensMonth !== undefined);

  if (issues.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("severity")}</TableHead>
          <TableHead>{t("issue")}</TableHead>
          {showProject ? <TableHead>{t("project")}</TableHead> : null}
          <TableHead>{t("file")}</TableHead>
          <TableHead className="text-right">{t("effort")}</TableHead>
          {showTokens ? <TableHead className="text-right">{t("wastedTokens")}</TableHead> : null}
          <TableHead>{t("fix")}</TableHead>
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
              {t("minutes", { count: i.effortMin })}
            </TableCell>
            {showTokens ? (
              <TableCell className="text-right tabular-nums">
                {i.wastedTokensMonth ? fmt.tokens(i.wastedTokensMonth) : "—"}
              </TableCell>
            ) : null}
            <TableCell>
              {i.fixable ? (
                <Badge variant="success">{t("fixAuto")}</Badge>
              ) : (
                <Badge variant="secondary">{t("fixManual")}</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
