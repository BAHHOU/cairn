"use client";

import {
  APPROVER_ROLES,
  type ApproverRole,
  type ChangePolicy,
  type CriticalZone,
  globToRegExp,
  type PersonView,
} from "@cairn/shared";
import {
  CircleCheck,
  CircleX,
  LayoutTemplate,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { type PolicyResultCode, savePolicyAction } from "./actions";

const FIELD =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-70";

/** Lists are edited as text: one path per line, words separated by commas. */
const lines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const words = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** A zone id that stays stable while its name is edited. */
const newZoneId = (zones: CriticalZone[]) => {
  let n = zones.length + 1;
  while (zones.some((z) => z.id === `zone-${n}`)) n++;
  return `zone-${n}`;
};

export function PolicyEditor({
  initialPolicy,
  initialPeople,
  editable,
  template = [],
}: {
  initialPolicy: ChangePolicy;
  initialPeople: PersonView[];
  editable: boolean;
  /** Zones offered as a starting point when the policy has none. */
  template?: CriticalZone[];
}) {
  const t = useTranslations("policies");
  const tr = useTranslations("domain.change.approverRole");
  const [zones, setZones] = useState(initialPolicy.zones);
  const [statuses, setStatuses] = useState(initialPolicy.approvedStatuses.join(", "));
  const [projects, setProjects] = useState(initialPolicy.ticketProjects.join(", "));
  const [people, setPeople] = useState(initialPeople);
  const [probe, setProbe] = useState("");
  const [result, setResult] = useState<{ ok: boolean; code: PolicyResultCode } | null>(null);
  const [pending, start] = useTransition();
  const probeId = useId();

  const updateZone = (i: number, patch: Partial<CriticalZone>) =>
    setZones((zs) => zs.map((z, k) => (k === i ? { ...z, ...patch } : z)));
  const updatePerson = (i: number, patch: Partial<PersonView>) =>
    setPeople((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const toggle = (roles: ApproverRole[], role: ApproverRole, on: boolean) =>
    on ? [...new Set([...roles, role])] : roles.filter((r) => r !== role);

  const matching = probe.trim()
    ? zones.filter((z) => z.paths.some((p) => globToRegExp(p).test(probe.trim())))
    : null;

  const save = () =>
    start(async () => {
      setResult(
        await savePolicyAction({
          policy: {
            zones,
            approvedStatuses: words(statuses),
            ticketProjects: words(projects).map((p) => p.toUpperCase()),
          },
          people: people.filter((p) => p.id.trim() && p.name.trim()),
        }),
      );
    });

  const label = "font-medium text-muted-foreground text-xs";
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("zones.title")}</CardTitle>
          <CardDescription>{t("zones.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={probeId} className={label}>
              {t("probe.label")}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
                aria-hidden
              />
              <input
                id={probeId}
                className={cn(FIELD, "pl-8 font-mono")}
                value={probe}
                placeholder="src/main/java/com/bank/payment/TransferService.java"
                onChange={(e) => setProbe(e.target.value)}
                spellCheck={false}
              />
            </div>
            {matching ? (
              <p className="text-xs" aria-live="polite">
                {matching.length > 0
                  ? t("probe.match", { zones: matching.map((z) => z.name).join(", ") })
                  : t("probe.none")}
              </p>
            ) : null}
          </div>

          {zones.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
              <p className="text-muted-foreground text-sm">{t("zones.empty")}</p>
              {editable && template.length > 0 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setZones(template)}
                  >
                    <LayoutTemplate aria-hidden />
                    {t("zones.template")}
                  </Button>
                  <span className="text-muted-foreground text-xs">{t("zones.templateHint")}</span>
                </>
              ) : null}
            </div>
          ) : null}

          {zones.map((zone, i) => (
            <fieldset
              key={zone.id}
              disabled={!editable}
              className="grid gap-3 rounded-lg border p-4 md:grid-cols-2"
            >
              <legend className="sr-only">{zone.name || zone.id}</legend>
              <div className="flex flex-col gap-1.5">
                <span className={label}>{t("zones.name")}</span>
                <input
                  aria-label={t("zones.name")}
                  className={FIELD}
                  value={zone.name}
                  onChange={(e) => updateZone(i, { name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={label}>{t("zones.requires")}</span>
                <div className="flex h-9 flex-wrap items-center gap-4">
                  {APPROVER_ROLES.map((role) => (
                    <LabelledCheck
                      key={role}
                      label={tr(role)}
                      checked={zone.requires.includes(role)}
                      onChange={(on) =>
                        updateZone(i, { requires: toggle(zone.requires, role, on) })
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={label}>{t("zones.paths")}</span>
                <textarea
                  aria-label={t("zones.paths")}
                  className={cn(FIELD, "h-24 py-2 font-mono text-xs")}
                  value={zone.paths.join("\n")}
                  onChange={(e) => updateZone(i, { paths: lines(e.target.value) })}
                  spellCheck={false}
                />
                <span className="text-[11px] text-muted-foreground">{t("zones.pathsHint")}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={label}>{t("zones.keywords")}</span>
                <textarea
                  aria-label={t("zones.keywords")}
                  className={cn(FIELD, "h-24 py-2")}
                  value={zone.keywords.join(", ")}
                  onChange={(e) => updateZone(i, { keywords: words(e.target.value) })}
                />
                <span className="text-[11px] text-muted-foreground">{t("zones.keywordsHint")}</span>
              </div>
              {editable ? (
                <div className="md:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setZones((zs) => zs.filter((_, k) => k !== i))}
                  >
                    <Trash2 aria-hidden />
                    {t("zones.remove")}
                  </Button>
                </div>
              ) : null}
            </fieldset>
          ))}

          {editable ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() =>
                setZones((zs) => [
                  ...zs,
                  { id: newZoneId(zs), name: "", paths: [], keywords: [], requires: ["techLead"] },
                ])
              }
            >
              <Plus aria-hidden />
              {t("zones.add")}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("tickets.title")}</CardTitle>
          <CardDescription>{t("tickets.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={label}>{t("tickets.statuses")}</span>
            <input
              className={FIELD}
              value={statuses}
              disabled={!editable}
              onChange={(e) => setStatuses(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>{t("tickets.projects")}</span>
            <input
              className={cn(FIELD, "font-mono uppercase")}
              value={projects}
              placeholder="PAY, TRE"
              disabled={!editable}
              onChange={(e) => setProjects(e.target.value)}
            />
          </label>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle className="flex items-center gap-2">
            {t("people.title")}
            <Badge variant="outline">{people.length}</Badge>
          </CardTitle>
          <CardDescription>{t("people.hint")}</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">{t("people.id")}</th>
                <th className="px-3 py-2 font-medium">{t("people.name")}</th>
                {APPROVER_ROLES.map((role) => (
                  <th key={role} className="px-3 py-2 text-center font-medium">
                    {tr(role)}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {people.map((person, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place, ids may be blank
                <tr key={i}>
                  <td className="px-4 py-1.5">
                    <input
                      aria-label={t("people.id")}
                      className={cn(FIELD, "h-8 font-mono")}
                      value={person.id}
                      disabled={!editable}
                      onChange={(e) => updatePerson(i, { id: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      aria-label={t("people.name")}
                      className={cn(FIELD, "h-8")}
                      value={person.name}
                      disabled={!editable}
                      onChange={(e) => updatePerson(i, { name: e.target.value })}
                    />
                  </td>
                  {APPROVER_ROLES.map((role) => (
                    <td key={role} className="px-3 py-1.5 text-center">
                      <Checkbox
                        aria-label={`${tr(role)} · ${person.name || person.id}`}
                        checked={person.roles.includes(role)}
                        disabled={!editable}
                        onCheckedChange={(on) =>
                          updatePerson(i, { roles: toggle(person.roles, role, on === true) })
                        }
                      />
                    </td>
                  ))}
                  <td className="pr-2">
                    {editable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("people.remove")}
                        onClick={() => setPeople((ps) => ps.filter((_, k) => k !== i))}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable ? (
          <div className="border-t px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPeople((ps) => [...ps, { id: "", name: "", roles: [] }])}
            >
              <Plus aria-hidden />
              {t("people.add")}
            </Button>
          </div>
        ) : null}
      </Card>

      {editable ? (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background/95 py-3 backdrop-blur">
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {t("save")}
          </Button>
          {result ? (
            <output
              className={cn(
                "flex items-center gap-1.5 text-sm",
                result.ok ? "text-success" : "text-destructive",
              )}
            >
              {result.ok ? (
                <CircleCheck className="size-4" aria-hidden />
              ) : (
                <CircleX className="size-4" aria-hidden />
              )}
              {t(`result.${result.code}`)}
            </output>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("readOnly")}</p>
      )}
    </div>
  );
}

function LabelledCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <Checkbox id={id} checked={checked} onCheckedChange={(on) => onChange(on === true)} />
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
    </span>
  );
}
