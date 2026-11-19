"use client";

import { SPEC_EVIDENCE, type SpecEvidence, TRACKERS, type TrackerKind } from "@cairn/shared";
import { CircleCheck, CircleX, History, Loader2, PlugZap, ShieldCheck, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { TrackerLogo } from "@/components/changes/tracker-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Field,
  isLiveTracker,
  type LiveTracker,
  TRACKER_FIELDS,
} from "@/lib/changes/tracker-fields";
import { cn } from "@/lib/utils";
import {
  connectTrackerAction,
  removeTrackerAction,
  type TrackerOutcome,
  testTrackerAction,
} from "./actions";

const FIELD =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

export interface ConnectionRow {
  id: string;
  kind: TrackerKind;
  label: string;
  /** Not secret: the address, the default project. */
  detail: string | null;
  createdBy: string;
  createdAt: string;
}

/** Evidence levels, strongest first: the catalog is sorted by what a tool can prove. */
const EVIDENCE_RANK = Object.fromEntries(SPEC_EVIDENCE.map((e, i) => [e, i])) as Record<
  SpecEvidence,
  number
>;
const EVIDENCE_TONE: Record<SpecEvidence, "success" | "warning" | "outline"> = {
  fullHistory: "success",
  editors: "warning",
  lastEdit: "outline",
};

function Outcome({ outcome }: { outcome: TrackerOutcome }) {
  const t = useTranslations("integrations.result");
  return (
    <output
      className={cn(
        "flex items-center gap-1.5 text-sm",
        outcome.ok ? "text-success" : "text-destructive",
      )}
    >
      {outcome.ok ? (
        <CircleCheck className="size-4 shrink-0" aria-hidden />
      ) : (
        <CircleX className="size-4 shrink-0" aria-hidden />
      )}
      {t(outcome.code, { who: outcome.who ?? "" })}
    </output>
  );
}

function EvidenceBadge({ evidence }: { evidence: SpecEvidence }) {
  const t = useTranslations("integrations.evidence");
  return (
    <Badge variant={EVIDENCE_TONE[evidence]} className="gap-1" title={t(`${evidence}.hint`)}>
      <History className="size-3" aria-hidden />
      {t(`${evidence}.label`)}
    </Badge>
  );
}

export function TrackerSettings({ connections }: { connections: ConnectionRow[] }) {
  const t = useTranslations("integrations");
  const [connecting, setConnecting] = useState<LiveTracker | null>(null);
  const catalog = [...(Object.keys(TRACKERS) as TrackerKind[])].sort(
    (a, b) =>
      Number(TRACKERS[b].status === "live") - Number(TRACKERS[a].status === "live") ||
      EVIDENCE_RANK[TRACKERS[a].evidence] - EVIDENCE_RANK[TRACKERS[b].evidence],
  );

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle className="flex items-center gap-2">
            {t("connected.title")}
            <Badge variant="outline">{connections.length}</Badge>
          </CardTitle>
          <CardDescription>{t("connected.hint")}</CardDescription>
        </CardHeader>
        <ul className="divide-y border-t">
          <li className="flex items-center gap-3 px-6 py-3">
            <TrackerLogo kind="gitlab" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-sm">{t("repository.title")}</span>
              <span className="text-muted-foreground text-xs">{t("repository.body")}</span>
            </div>
            <Badge variant="success">{t("repository.always")}</Badge>
          </li>
          {connections.map((c) => (
            <ConnectionItem key={c.id} connection={c} />
          ))}
        </ul>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="catalog-title">
        <div className="flex flex-col gap-1">
          <h2 id="catalog-title" className="font-semibold text-lg">
            {t("catalog.title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("catalog.hint")}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.map((kind) => {
            const info = TRACKERS[kind];
            const live = info.status === "live" && isLiveTracker(kind) ? kind : null;
            return (
              <li
                key={kind}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border bg-card p-4",
                  !live && "bg-muted/30",
                )}
              >
                <div className="flex items-center gap-3">
                  <TrackerLogo kind={kind} size={36} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-sm">{info.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {t(`approval.${info.approval}`)}
                    </span>
                  </div>
                  {live ? (
                    <Button size="sm" variant="outline" onClick={() => setConnecting(live)}>
                      {t("catalog.connect")}
                    </Button>
                  ) : (
                    <Badge variant="outline">{t("catalog.soon")}</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <EvidenceBadge evidence={info.evidence} />
                  {info.free ? <Badge variant="info">{t("catalog.free")}</Badge> : null}
                  {info.openSource ? (
                    <Badge variant="outline">{t("catalog.openSource")}</Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t(`evidence.${info.evidence}.hint`)}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {connecting ? <ConnectDialog kind={connecting} onClose={() => setConnecting(null)} /> : null}
    </>
  );
}

function ConnectionItem({ connection: c }: { connection: ConnectionRow }) {
  const t = useTranslations("integrations.connected");
  const [outcome, setOutcome] = useState<TrackerOutcome | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-3 px-6 py-3">
      <TrackerLogo kind={c.kind} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2 font-medium text-sm">
          {c.label}
          <span className="font-normal text-muted-foreground text-xs">{TRACKERS[c.kind].name}</span>
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {c.detail ? `${c.detail} · ` : ""}
          {t("by", { who: c.createdBy, date: c.createdAt })}
        </span>
        {outcome ? <Outcome outcome={outcome} /> : null}
      </div>
      <EvidenceBadge evidence={TRACKERS[c.kind].evidence} />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => start(async () => setOutcome(await testTrackerAction(c.id)))}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
          {t("test")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("confirmRemove", { name: c.label }))) {
              start(async () => setOutcome(await removeTrackerAction(c.id)));
            }
          }}
        >
          <Unplug aria-hidden />
          {t("remove")}
        </Button>
      </div>
    </li>
  );
}

function ConnectDialog({ kind, onClose }: { kind: LiveTracker; onClose: () => void }) {
  const t = useTranslations("integrations");
  const info = TRACKERS[kind];
  const fields: Field[] = TRACKER_FIELDS[kind];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries([
      ["label", info.name],
      ["edition", "bearer"],
      ...fields.filter((f) => f.defaultValue).map((f) => [f.name, f.defaultValue as string]),
    ]),
  );
  const [outcome, setOutcome] = useState<TrackerOutcome | null>(null);
  const [pending, start] = useTransition();
  const labelId = useId();
  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));
  const shown = fields.filter((f) => !f.edition || f.edition === values.edition);

  return (
    <Modal
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t("dialog.title", { name: info.name })}
      description={t("dialog.description")}
      icon={<TrackerLogo kind={kind} />}
    >
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const result = await connectTrackerAction(kind, values);
            setOutcome(result);
            if (result.ok) setTimeout(onClose, 900);
          });
        }}
      >
        <p className="flex gap-2 rounded-lg bg-muted/50 p-3 text-xs">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {t(`dialog.help.${kind}`)}
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={labelId} className="font-medium text-muted-foreground text-xs">
            {t("dialog.label")}
          </label>
          <input
            id={labelId}
            className={FIELD}
            value={values.label ?? ""}
            onChange={(e) => set("label", e.target.value)}
            maxLength={80}
            required
          />
        </div>
        {shown.map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            value={values[field.name] ?? ""}
            onChange={(v) => set(field.name, v)}
          />
        ))}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
            {t("dialog.submit")}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          {outcome ? <Outcome outcome={outcome} /> : null}
        </div>
      </form>
    </Modal>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("integrations.field");
  const id = useId();
  const label = (
    <label htmlFor={id} className="font-medium text-muted-foreground text-xs">
      {t(`${field.name}.label`)}
      {field.required ? null : ` · ${t("optional")}`}
    </label>
  );
  // Not every field has a hint: looked up dynamically, checked with `has`.
  const optional = t as unknown as { has(key: string): boolean; (key: string): string };
  const hintKey = `${field.name}.hint`;
  const hint = optional.has(hintKey) ? (
    <span className="text-[11px] text-muted-foreground">{optional(hintKey)}</span>
  ) : null;

  if (field.type === "edition") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bearer">{t("edition.bearer")}</SelectItem>
            <SelectItem value="basic">{t("edition.basic")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <input
        id={id}
        className={cn(FIELD, (field.type === "secret" || field.type === "url") && "font-mono")}
        type={field.type === "secret" ? "password" : field.type === "email" ? "email" : "text"}
        value={value}
        placeholder={field.placeholder}
        required={field.required}
        autoComplete={field.type === "secret" ? "new-password" : "off"}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint}
    </div>
  );
}
