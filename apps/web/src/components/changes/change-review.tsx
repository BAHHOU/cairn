import {
  type ChangeFinding,
  type PersonView,
  type ChangeReview as Review,
  type SpecView,
  TRACKERS,
} from "@cairn/shared";
import {
  CircleAlert,
  ExternalLink,
  FileCode2,
  History,
  Minus,
  Plus,
  Ticket,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { SeverityBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/i18n/format";
import { diffWords } from "@/lib/text-diff";
import { cn } from "@/lib/utils";
import { VERDICT_STYLE } from "./change-list";
import { TrackerLogo } from "./tracker-logo";

/** Finding messages take different arguments per kind; every kind has one (catalog test). */
type DynamicT = (key: string, values?: Record<string, string | number>) => string;

const nameIn = (people: PersonView[]) => (id: string) =>
  people.find((p) => p.id === id)?.name ?? id;

/** The answer first, in the colour of the verdict: what the reviewer must do with this change. */
export function VerdictBanner({ review }: { review: Review }) {
  const t = useTranslations("changeControl.detail.verdict");
  const { verdict, findings } = review.evaluation;
  const { icon: Icon, text } = VERDICT_STYLE[verdict];
  const count =
    verdict === "blocked"
      ? findings.filter((f) => f.severity === "blocker").length
      : findings.filter((f) => f.severity !== "minor").length;
  return (
    <section
      className={cn(
        "flex gap-4 rounded-xl border p-5",
        verdict === "blocked" && "border-destructive/40 bg-destructive/5",
        verdict === "review" && "border-warning/40 bg-warning/5",
        verdict === "pass" && "border-success/30 bg-success/5",
      )}
    >
      <Icon className={cn("mt-0.5 size-6 shrink-0", text)} aria-hidden />
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-lg">{t(`${verdict}.title`)}</h2>
        <p className="text-sm">{t(`${verdict}.body`, { count })}</p>
      </div>
    </section>
  );
}

export function FindingList({ review }: { review: Review }) {
  const t = useTranslations("changeControl.detail.findings");
  const tf = useTranslations("domain.change.finding") as unknown as DynamicT;
  const fmt = useFormat();
  const zoneName = (id: string) => review.zones.find((z) => z.id === id)?.name ?? id;
  const { findings } = review.evaluation;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ol className="flex flex-col divide-y">
            {findings.map((f, i) => (
              <li
                // Findings have no id: their order is fixed by the engine.
                // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                key={i}
                className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={f.severity} />
                  <span className="font-medium text-sm">{tf(`${f.kind}.title`, f.params)}</span>
                </div>
                <p className="text-muted-foreground text-sm">{tf(`${f.kind}.detail`, f.params)}</p>
                <FindingWhere finding={f} zoneName={zoneName} fmt={fmt} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function FindingWhere({
  finding: f,
  zoneName,
  fmt,
}: {
  finding: ChangeFinding;
  zoneName: (id: string) => string;
  fmt: ReturnType<typeof useFormat>;
}) {
  const t = useTranslations("changeControl.detail.findings");
  const from = f.params?.from;
  const to = f.params?.to;
  const parts = [
    f.ticket ? (
      <span key="t" className="inline-flex items-center gap-1 font-mono">
        <Ticket className="size-3" aria-hidden />
        {f.ticket}
      </span>
    ) : null,
    f.file ? (
      <span key="f" className="font-mono">
        {f.file}
        {f.line ? `:${f.line}` : ""}
      </span>
    ) : null,
    f.zone ? <span key="z">{t("zone", { name: zoneName(f.zone) })}</span> : null,
    typeof from === "number" && typeof to === "number" ? (
      <span key="a" className="font-medium text-foreground tabular-nums">
        {t("fromTo", { from: fmt.number(from), to: fmt.number(to) })}
      </span>
    ) : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {parts}
    </div>
  );
}

/**
 * The ticket as the business approved it and as it reads today. When they differ, the words that
 * changed are shown side by side — the approved words struck through, the later ones in red — so a
 * non-developer sees "50 000 → 2 000 000" at once.
 */
export function SpecPanel({ review }: { review: Review }) {
  const t = useTranslations("changeControl.detail.spec");
  const { tickets } = review.evaluation;
  const missing = tickets.filter((k) => !review.specs.some((s) => s.key === k));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {tickets.length === 0 ? (
          <p className="flex items-start gap-2 text-destructive text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("none")}
          </p>
        ) : null}
        {review.specs.map((spec) => (
          <SpecBlock key={spec.key} spec={spec} review={review} />
        ))}
        {missing.map((key) => (
          <p key={key} className="text-muted-foreground text-sm">
            {t("unavailable", { key })}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

function SpecBlock({ spec, review }: { spec: SpecView; review: Review }) {
  const t = useTranslations("changeControl.detail.spec");
  const fmt = useFormat();
  const name = nameIn(review.people);
  const approved = spec.approved;
  const editedAfter = approved !== null && spec.revisions.some((r) => r.at > approved.at);
  // A tool without old versions only tells that the text changed, not how.
  const inexact = approved?.exact === false;
  const changed = approved !== null && (inexact ? editedAfter : approved.text !== spec.text);
  const parts = changed && !inexact && approved ? diffWords(approved.text, spec.text) : null;
  const author = review.change.authorId;

  const events = [
    ...(approved ? [{ at: approved.at, by: approved.byId, kind: "approval" as const }] : []),
    ...spec.revisions.map((r) => ({ at: r.at, by: r.authorId, kind: "revision" as const })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <article className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {spec.tracker ? <TrackerLogo kind={spec.tracker} size={22} /> : null}
          <span className="font-mono text-muted-foreground text-xs">{spec.key}</span>
          <span className="font-medium text-sm">{spec.title}</span>
          {spec.url ? (
            <a
              href={spec.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            >
              <ExternalLink className="size-3" aria-hidden />
              {t("open", { tool: spec.tracker ? TRACKERS[spec.tracker].name : spec.key })}
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {approved ? (
            <span className="text-muted-foreground">
              {t("approvedBy", { name: name(approved.byId), date: fmt.date(approved.at) })}
            </span>
          ) : (
            <Badge variant="destructive">{t("notApproved", { status: spec.status })}</Badge>
          )}
          {approved ? (
            changed ? (
              <Badge variant="destructive">{t("changed")}</Badge>
            ) : (
              <Badge variant="success">{t("unchanged")}</Badge>
            )
          ) : null}
        </div>
      </header>

      <blockquote className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">
        {parts
          ? parts.map((p, i) =>
              p.kind === "same" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed text
                <span key={i}>{p.text}</span>
              ) : p.kind === "removed" ? (
                <del
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed text
                  key={i}
                  title={t("removed")}
                  className="rounded bg-muted px-0.5 text-muted-foreground"
                >
                  {p.text}
                </del>
              ) : (
                <ins
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed text
                  key={i}
                  title={t("added")}
                  className="rounded bg-destructive/15 px-0.5 font-medium text-destructive no-underline"
                >
                  {p.text}
                </ins>
              ),
            )
          : spec.text}
      </blockquote>
      {inexact && changed ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning-ink" aria-hidden />
          {t("inexact", { tool: spec.tracker ? TRACKERS[spec.tracker].name : "" })}
        </p>
      ) : null}
      {parts ? (
        <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-muted-foreground/40" aria-hidden />
            {t("removed")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-destructive/40" aria-hidden />
            {t("added")}
          </span>
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
            <History className="size-3.5" aria-hidden />
            {t("history")}
          </h4>
          <ol className="relative flex flex-col gap-2 border-l pl-4">
            {events.map((e) => {
              const late = e.kind === "revision" && approved !== null && e.at > approved.at;
              return (
                <li key={`${e.kind}-${e.at}`} className="relative text-xs">
                  <span
                    className={cn(
                      "absolute top-1 -left-[1.3rem] size-2 rounded-full ring-2 ring-card",
                      e.kind === "approval"
                        ? "bg-success"
                        : late
                          ? "bg-destructive"
                          : "bg-muted-foreground/50",
                    )}
                    aria-hidden
                  />
                  <span className={cn(late && "font-medium text-destructive")}>
                    {t(e.kind, { name: name(e.by) })}
                  </span>
                  {e.by === author ? (
                    <span className="text-destructive"> · {t("isAuthor")}</span>
                  ) : null}
                  <span className="text-muted-foreground"> · {fmt.date(e.at)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </article>
  );
}

/** Per zone touched, each role it requires and who gave it — or that nobody did. */
export function ApprovalPanel({ review }: { review: Review }) {
  const t = useTranslations("changeControl.detail.approvals");
  const tr = useTranslations("domain.change.approverRole");
  const name = nameIn(review.people);
  const { requirements } = review.evaluation;
  const author = review.change.authorId;
  const zoneName = (id: string) => review.zones.find((z) => z.id === id)?.name ?? id;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {requirements.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("none")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("zone")}</th>
                  <th className="px-3 py-2 font-medium">{t("role")}</th>
                  <th className="px-3 py-2 font-medium">{t("by")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requirements.map((r) => (
                  <tr key={`${r.zone}-${r.role}`}>
                    <td className="px-3 py-2">{zoneName(r.zone)}</td>
                    <td className="px-3 py-2">{tr(r.role)}</td>
                    <td className="px-3 py-2">
                      {r.approvedBy.length > 0 ? (
                        <span className="text-success">{r.approvedBy.map(name).join(", ")}</span>
                      ) : (
                        <Badge variant="destructive">{t("missing")}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h4 className="font-medium text-muted-foreground text-xs">{t("approvers")}</h4>
          {review.change.approvals.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noApprovers")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {review.change.approvals.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                >
                  <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
                  {name(id)}
                  {review.people
                    .find((p) => p.id === id)
                    ?.roles.map((role) => (
                      <span key={role} className="text-muted-foreground">
                        · {tr(role)}
                      </span>
                    ))}
                  {id === author ? <span className="text-destructive">· {t("author")}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The diff excerpt the findings point to. Removed lines first, then added, as in a unified hunk. */
export function FileChanges({ review }: { review: Review }) {
  const t = useTranslations("changeControl.detail.files");
  const zoneOf = new Map(review.evaluation.zones.flatMap((z) => z.files.map((f) => [f, z.id])));
  const zoneName = (id: string) => review.zones.find((z) => z.id === id)?.name ?? id;
  const flagged = new Set(
    review.evaluation.findings.filter((f) => f.file && f.line).map((f) => `${f.file}:${f.line}`),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("title")}
          <Badge variant="outline">{t("count", { count: review.change.files.length })}</Badge>
        </CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {review.change.files.map((file) => {
          const zone = zoneOf.get(file.path);
          const rows = [
            ...file.removed.map((l) => ({ ...l, kind: "removed" as const })),
            ...file.added.map((l) => ({ ...l, kind: "added" as const })),
          ];
          return (
            <div key={file.path} className="overflow-hidden rounded-lg border">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
                <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate font-medium font-mono">{file.path}</span>
                {zone ? (
                  <Badge variant="outline" className="px-1.5 py-0 text-[11px]">
                    {t("zone", { name: zoneName(zone) })}
                  </Badge>
                ) : null}
                <span className="ml-auto font-mono text-muted-foreground">
                  {t("stats", { added: file.added.length, removed: file.removed.length })}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <tbody>
                    {rows.map((row) => {
                      const flag = flagged.has(`${file.path}:${row.line}`);
                      return (
                        <tr
                          key={`${row.kind}-${row.line}`}
                          className={cn(row.kind === "added" ? "bg-success/8" : "bg-destructive/8")}
                        >
                          <td className="w-10 select-none px-2 py-0.5 text-right text-muted-foreground tabular-nums">
                            {row.line}
                          </td>
                          <td className="w-5 select-none text-center text-muted-foreground">
                            {row.kind === "added" ? (
                              <Plus className="inline size-3" aria-hidden />
                            ) : (
                              <Minus className="inline size-3" aria-hidden />
                            )}
                          </td>
                          <td className="whitespace-pre py-0.5 pr-3">{row.text}</td>
                          <td className="w-6 pr-2 text-right">
                            {flag ? (
                              <CircleAlert
                                className="inline size-3.5 text-destructive"
                                aria-label={t("finding")}
                              />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
