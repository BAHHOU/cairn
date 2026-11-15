import type { GuideSource } from "@cairn/shared";
import { FileCode2, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type SourceBase, sourceHref } from "@/lib/import/source-link";
import { cn } from "@/lib/utils";

/** `path:line`, as a link to the file on the forge when it has one. */
export function SourceRef({
  source,
  base,
  className,
}: {
  source: GuideSource;
  base: SourceBase | null;
  className?: string;
}) {
  const t = useTranslations("projectNav");
  const label = source.line ? `${source.path}:${source.line}` : source.path;
  const href = sourceHref(base, source);
  const body = (
    <>
      <FileCode2 className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </>
  );
  const style = cn(
    "inline-flex max-w-full items-center gap-1 font-mono text-[11px] text-muted-foreground",
    className,
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(style, "underline-offset-4 hover:text-foreground hover:underline")}
      title={t("openInRepo")}
    >
      {body}
    </a>
  ) : (
    <span className={style}>{body}</span>
  );
}

/** Text with `code` spans: the scan writes file names and commands between backticks. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts are static text, never reordered
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Shown when the last scan predates this view, or the repository has nothing to read for it. */
export function GuideUnavailable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** A titled block of the guide pages. */
export function Section({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description?: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {count !== undefined ? <Badge variant="secondary">{count}</Badge> : null}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** What the repository cannot tell, said plainly rather than filled with estimates. */
export function LimitsNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-muted-foreground text-xs leading-relaxed">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
