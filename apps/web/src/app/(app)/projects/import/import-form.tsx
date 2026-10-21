"use client";

import { GitBranch, Globe, Loader2, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const router = useRouter();
  const ids = { provider: useId(), url: useId(), token: useId(), branch: useId(), team: useId() };

  const [provider, setProvider] = useState<Provider>(initial.provider ?? "gitlab");
  const [url, setUrl] = useState(initial.url ?? "");
  const [token, setToken] = useState("");
  const [branch, setBranch] = useState(initial.branch ?? "");
  const [team, setTeam] = useState(teams[0] ?? "");
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
  const canVerify = url.trim().length > 0 && !verifying && !importing;
  const canImport = Boolean(inspected && branch.trim() && team.trim()) && !importing && !verifying;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Dépôt à importer</CardTitle>
          <CardDescription>
            Cairn interroge réellement le fournisseur pour vérifier le jeton, le dépôt et ses
            branches.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[180px_1fr]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.provider} className="text-xs font-medium text-muted-foreground">
              Fournisseur
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
              <span className="text-[11px] text-muted-foreground">Détecté d'après l'hôte.</span>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.url} className="text-xs font-medium text-muted-foreground">
              URL du dépôt
            </label>
            <input
              id={ids.url}
              className={FIELD}
              value={url}
              placeholder="https://gitlab.exemple.com/groupe/sous-groupe/projet"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setUrl(e.target.value);
                resetResult();
              }}
            />
            <span className="text-[11px] text-muted-foreground">
              Hôtes autorisés : {hosts.join(", ")}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor={ids.token} className="text-xs font-medium text-muted-foreground">
              Jeton d'accès (facultatif pour un dépôt public)
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
              Lecture seule suffit : GitLab <code>read_api</code> + <code>read_repository</code>,
              GitHub « Contents : Read ». Le jeton est chiffré (AES-256-GCM) avant stockage et n'est
              jamais réaffiché.
            </span>
          </div>

          <div className="md:col-span-2">
            <Button onClick={verify} disabled={!canVerify}>
              {verifying ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <ShieldCheck aria-hidden />
              )}
              Vérifier le dépôt
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
            <span className="font-medium">{error.message}</span>
            {error.detail ? (
              <span className="text-xs text-muted-foreground">{error.detail}</span>
            ) : null}
            {error.importId ? (
              <Link href={`/projects/import/${error.importId}`} className="text-xs underline">
                Voir l'import en cours
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {inspected ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              2 · Branche à importer
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{inspected.repo.fullPath}</span>
              <Badge variant="outline">
                {inspected.repo.isPrivate ? (
                  <Lock className="size-3" aria-hidden />
                ) : (
                  <Globe className="size-3" aria-hidden />
                )}
                {inspected.repo.isPrivate ? "Privé" : "Public"}
              </Badge>
              <Badge variant="outline">{PROVIDER_LABEL[inspected.provider]}</Badge>
              <span>
                {inspected.branches.length}
                {inspected.truncated ? "+" : ""} branches · défaut :{" "}
                {inspected.repo.defaultBranch || "—"}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.branch} className="text-xs font-medium text-muted-foreground">
                Branche
              </label>
              <div className="relative">
                <GitBranch
                  className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id={ids.branch}
                  className={cn(FIELD, "pl-8 font-mono")}
                  value={branch}
                  list={`${ids.branch}-list`}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setBranch(e.target.value)}
                />
                <datalist id={`${ids.branch}-list`}>
                  {inspected.branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.isDefault ? "branche par défaut" : b.sha.slice(0, 8)}
                    </option>
                  ))}
                </datalist>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {head
                  ? `Dernier commit : ${head.sha.slice(0, 10)}`
                  : inspected.truncated
                    ? "Liste tronquée : saisissez le nom exact, il sera vérifié à l'import."
                    : "Cette branche sera vérifiée à l'import."}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.team} className="text-xs font-medium text-muted-foreground">
                Équipe propriétaire
              </label>
              <input
                id={ids.team}
                className={FIELD}
                value={team}
                list={`${ids.team}-list`}
                placeholder="Ex. Paiements"
                autoComplete="off"
                onChange={(e) => setTeam(e.target.value)}
              />
              <datalist id={`${ids.team}-list`}>
                {teams.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <span className="text-[11px] text-muted-foreground">
                Obligatoire · créée si elle n'existe pas encore.
              </span>
            </div>

            <div className="md:col-span-2">
              <Button onClick={launch} disabled={!canImport}>
                {importing ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <GitBranch aria-hidden />
                )}
                Importer la branche
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Le worker clone uniquement cette branche (historique tronqué au dernier commit),
                analyse la pile technique, puis supprime la copie de travail.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
