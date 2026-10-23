"use client";

import { GitBranch, Globe, Loader2, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { importErrorCode } from "@/lib/import/messages";
import { cn } from "@/lib/utils";
import {
  type ActionFailure,
  type InspectOutcome,
  inspectRepositoryAction,
  startImportAction,
} from "./actions";

const FIELD =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60";

type Provider = "github" | "gitlab";
type Inspected = Extract<InspectOutcome, { ok: true }>;

const hostOf = (url: string): string =>
  /^(?:[a-z]+:\/\/)?(?:[^@/]+@)?([^/:]+)/i.exec(url.trim())?.[1]?.toLowerCase() ?? "";

const PROVIDER_LABEL: Record<Provider, string> = { github: "GitHub", gitlab: "GitLab" };

const toForm = (fields: Record<string, string>): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
};

export interface ImportFormProps {
  teams: string[];
  hosts: string[];
  initial: { provider?: Provider; url?: string; branch?: string };
}

export function ImportForm({ teams, hosts, initial }: ImportFormProps) {
  const t = useTranslations("import.form");
  const te = useTranslations("importErrors");
  const router = useRouter();
  const ids = { provider: useId(), url: useId(), token: useId(), branch: useId(), team: useId() };

  const [provider, setProvider] = useState<Provider>(initial.provider ?? "gitlab");
  const [url, setUrl] = useState(initial.url ?? "");
  const [token, setToken] = useState("");
  const [branch, setBranch] = useState(initial.branch ?? "");
  const [team, setTeam] = useState(teams[0] ?? "Cairn");
  const [inspected, setInspected] = useState<Inspected | null>(null);
  const [error, setError] = useState<ActionFailure | null>(null);
  const [verifying, startVerify] = useTransition();
  const [importing, startImport] = useTransition();

  const known = hostOf(url);
  const forced: Provider | undefined =
    known === "github.com" ? "github" : known === "gitlab.com" ? "gitlab" : undefined;
  const effectiveProvider = forced ?? provider;

  const resetResult = () => {
    setInspected(null);
    setError(null);
  };

  const verify = () => {
    setError(null);
    setInspected(null);
    startVerify(async () => {
      const result = await inspectRepositoryAction(
        toForm({ provider: effectiveProvider, url, token }),
      );
      if (!result.ok) {
        setError(result);
        return;
      }
      setInspected(result);
      if (!branch || !result.branches.some((b) => b.name === branch)) {
        setBranch(result.repo.defaultBranch || result.branches[0]?.name || "");
      }
    });
  };

  const launch = () => {
    setError(null);
    startImport(async () => {
      const result = await startImportAction(
        toForm({ provider: effectiveProvider, url, token, branch, team }),
      );
      if (!result.ok) {
        setError(result);
        return;
      }
      router.push(`/projects/import/${result.importId}`);
    });
  };

  const head = inspected?.branches.find((b) => b.name === branch);
  const branchIsListed = Boolean(head);
  const canVerify = url.trim().length > 0 && !verifying && !importing;
  const canImport = Boolean(inspected && branch.trim() && team.trim()) && !importing && !verifying;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step1")}</CardTitle>
          <CardDescription>{t("step1Hint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[180px_1fr]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.provider} className="text-xs font-medium text-muted-foreground">
              {t("provider")}
            </label>
            <select
              id={ids.provider}
              className={FIELD}
              value={effectiveProvider}
              disabled={Boolean(forced)}
              onChange={(e) => {
                setProvider(e.target.value as Provider);
                resetResult();
              }}
            >
              <option value="gitlab">GitLab</option>
              <option value="github">GitHub</option>
            </select>
            {forced ? (
              <span className="text-[11px] text-muted-foreground">{t("providerDetected")}</span>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.url} className="text-xs font-medium text-muted-foreground">
              {t("url")}
            </label>
            <input
              id={ids.url}
              className={FIELD}
              value={url}
              placeholder={t("urlPlaceholder")}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setUrl(e.target.value);
                resetResult();
              }}
            />
            <span className="text-[11px] text-muted-foreground">
              {t("allowedHosts", { hosts: hosts.join(", ") })}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor={ids.token} className="text-xs font-medium text-muted-foreground">
              {t("token")}
            </label>
            <input
              id={ids.token}
              type="password"
              className={cn(FIELD, "font-mono")}
              value={token}
              placeholder="glpat-…  ou  github_pat_…"
              autoComplete="new-password"
              spellCheck={false}
              onChange={(e) => {
                setToken(e.target.value);
                resetResult();
              }}
            />
            <span className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
              {t.rich("tokenHint", { code: (chunks) => <code>{chunks}</code> })}
            </span>
          </div>

          <div className="md:col-span-2">
            <Button onClick={verify} disabled={!canVerify}>
              {verifying ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <ShieldCheck aria-hidden />
              )}
              {t("verify")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="font-medium">{te(importErrorCode(error.code))}</span>
            {error.detail ? (
              <span className="text-xs text-muted-foreground">{error.detail}</span>
            ) : null}
            {error.importId ? (
              <Link href={`/projects/import/${error.importId}`} className="text-xs underline">
                {t("seeRunning")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {inspected ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {t("step2")}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{inspected.repo.fullPath}</span>
              <Badge variant="outline">
                {inspected.repo.isPrivate ? (
                  <Lock className="size-3" aria-hidden />
                ) : (
                  <Globe className="size-3" aria-hidden />
                )}
                {inspected.repo.isPrivate ? t("private") : t("public")}
              </Badge>
              <Badge variant="outline">{PROVIDER_LABEL[inspected.provider]}</Badge>
              <span>
                {t("branchSummary", {
                  count: inspected.branches.length,
                  more: inspected.truncated ? "+" : "",
                  defaultBranch: inspected.repo.defaultBranch || "—",
                })}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.branch} className="text-xs font-medium text-muted-foreground">
                {t("branch")}
              </label>
              <div className="relative">
                <GitBranch
                  className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                  aria-hidden
                />
                <select
                  id={ids.branch}
                  className={cn(FIELD, "pl-8 font-mono")}
                  value={branchIsListed ? branch : "__custom__"}
                  onChange={(e) => setBranch(e.target.value === "__custom__" ? "" : e.target.value)}
                >
                  {inspected.branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.isDefault ? t("branchDefault", { name: b.name }) : b.name}
                    </option>
                  ))}
                  {inspected.truncated || !branchIsListed ? (
                    <option value="__custom__">{t("branchOther")}</option>
                  ) : null}
                </select>
              </div>
              {!branchIsListed ? (
                <input
                  className={cn(FIELD, "font-mono")}
                  value={branch}
                  placeholder={t("branchExact")}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={t("branchExact")}
                  onChange={(e) => setBranch(e.target.value)}
                />
              ) : null}
              <span className="text-[11px] text-muted-foreground">
                {head
                  ? t("lastCommit", { sha: head.sha.slice(0, 10) })
                  : inspected.truncated
                    ? t("listTruncated")
                    : t("checkedOnImport")}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.team} className="text-xs font-medium text-muted-foreground">
                {t("team")}
              </label>
              <input
                id={ids.team}
                className={FIELD}
                value={team}
                list={`${ids.team}-list`}
                placeholder={t("teamPlaceholder")}
                autoComplete="off"
                onChange={(e) => setTeam(e.target.value)}
              />
              <datalist id={`${ids.team}-list`}>
                {teams.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <span className="text-[11px] text-muted-foreground">{t("teamHint")}</span>
            </div>

            <div className="md:col-span-2">
              <Button onClick={launch} disabled={!canImport}>
                {importing ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <GitBranch aria-hidden />
                )}
                {t("importBranch")}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">{t("importHint")}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
