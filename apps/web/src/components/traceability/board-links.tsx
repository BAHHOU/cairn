"use client";

import type { TrackerKind } from "@cairn/shared";
import { AlertCircle, Link2, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  type LinkOutcome,
  type LinkResultCode,
  linkBoardAction,
  unlinkBoardAction,
} from "@/app/(app)/projects/[id]/traceability/actions";
import { TrackerLogo } from "@/components/changes/tracker-logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { isListable } from "@/lib/traceability/scope";
import { cn } from "@/lib/utils";

export interface BoardLinkView {
  id: string;
  kind: TrackerKind;
  label: string;
  scope: string;
  /** Set when the last run could not list it. */
  failure: LinkResultCode | null;
}

export interface ConnectionOption {
  id: string;
  kind: TrackerKind;
  label: string;
  /** False for tools that cannot list tickets yet. */
  listable: boolean;
}

const field =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** The boards a project's requests come from, and the form to link one. */
export function BoardLinks({
  repositoryId,
  links,
  connections,
  mayLink,
}: {
  repositoryId: string;
  links: BoardLinkView[];
  connections: ConnectionOption[];
  mayLink: boolean;
}) {
  const t = useTranslations("traceability.boards");
  const tr = useTranslations("traceability.link.result");
  const listable = connections.filter((c) => c.listable);
  const [connectionId, setConnectionId] = useState(listable[0]?.id ?? "");
  const [scope, setScope] = useState("");
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [pending, start] = useTransition();
  const selected = listable.find((c) => c.id === connectionId)?.kind;
  const kind = selected && isListable(selected) ? selected : undefined;

  const submit = () =>
    start(async () => {
      const result = await linkBoardAction(repositoryId, connectionId, scope);
      setOutcome(result);
      if (result.ok) setScope("");
    });

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y rounded-lg border">
        <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
          <TrackerLogo kind="gitlab" size={28} />
          <span className="min-w-0 flex-1">{t("repoIssues")}</span>
          <span className="text-muted-foreground text-xs">{t("always")}</span>
        </li>
        {links.map((link) => (
          <li key={link.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <TrackerLogo kind={link.kind} size={28} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{link.label}</span>
              <span className="truncate font-mono text-muted-foreground text-xs">{link.scope}</span>
              {link.failure ? (
                <span className="flex items-center gap-1 text-destructive text-xs">
                  <AlertCircle className="size-3" aria-hidden />
                  {t("failed", { reason: tr(link.failure) })}
                </span>
              ) : null}
            </span>
            {mayLink ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                aria-label={t("unlink")}
                onClick={() =>
                  start(async () => setOutcome(await unlinkBoardAction(repositoryId, link.id)))
                }
              >
                <Trash2 aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {!mayLink ? (
        <p className="text-muted-foreground text-xs">{t("noAccess")}</p>
      ) : listable.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
          <p className="text-muted-foreground">{t("noConnections")}</p>
          <Link
            href="/settings/integrations"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("openIntegrations")}
          </Link>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="font-medium text-sm">{t("add")}</p>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t("connection")}</span>
            <select
              className={field}
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
            >
              {listable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {kind ? (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{t(`scope.${kind}.label`)}</span>
              <input
                className={cn(field, "font-mono")}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder={t(`scope.${kind}.placeholder`)}
                required
              />
              <span className="text-muted-foreground">{t(`scope.${kind}.hint`)}</span>
            </label>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={pending || !scope.trim()}
            className="self-start"
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
            {t("submit")}
          </Button>
        </form>
      )}

      {outcome ? (
        <p
          role="status"
          className={cn("text-xs", outcome.ok ? "text-primary" : "text-destructive")}
        >
          {tr(outcome.code, { count: outcome.count ?? 0 })}
        </p>
      ) : null}
    </div>
  );
}
