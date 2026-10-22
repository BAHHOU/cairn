import { type ImportStatus, type ImportView, isImportActive } from "@cairn/shared";
import { Check, CircleDashed, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<ImportStatus, string> = {
  queued: "En file d'attente",
  cloning: "Clonage en cours",
  scanning: "Analyse en cours",
  done: "Importé",
  failed: "Échec",
};

const STATUS_VARIANT: Record<ImportStatus, "secondary" | "info" | "success" | "destructive"> = {
  queued: "secondary",
  cloning: "info",
  scanning: "info",
  done: "success",
  failed: "destructive",
};

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {isImportActive(status) ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const STEPS = [
  { key: "queued", label: "Demande enregistrée" },
  { key: "cloning", label: "Clonage de la branche" },
  { key: "scanning", label: "Analyse de la pile technique" },
  { key: "done", label: "Résultat enregistré" },
] as const;

type StepState = "done" | "active" | "failed" | "todo";

function stepStates(view: ImportView): StepState[] {
  if (view.status === "done") return STEPS.map(() => "done");
  if (view.status === "failed") {
    // A failure is attributed to the last stage that was actually reached.
    const failedAt = view.commitSha ? 2 : view.startedAt ? 1 : 0;
    return STEPS.map((_, i) => (i < failedAt ? "done" : i === failedAt ? "failed" : "todo"));
  }
  const current = STEPS.findIndex((s) => s.key === view.status);
  return STEPS.map((_, i) => (i < current ? "done" : i === current ? "active" : "todo"));
}

export function ImportTimeline({ view }: { view: ImportView }) {
  const states = stepStates(view);
  return (
    <ol className="flex flex-col gap-3" aria-label="Progression de l'import">
      {STEPS.map((step, i) => {
        const state = states[i] ?? "todo";
        return (
          <li key={step.key} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border",
                state === "done" && "border-transparent bg-primary text-primary-foreground",
                state === "active" && "border-info text-info",
                state === "failed" && "border-transparent bg-destructive text-white",
                state === "todo" && "text-muted-foreground",
              )}
            >
              {state === "done" ? (
                <Check className="size-3.5" aria-hidden />
              ) : state === "active" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : state === "failed" ? (
                <X className="size-3.5" aria-hidden />
              ) : (
                <CircleDashed className="size-3.5" aria-hidden />
              )}
            </span>
            <span
              className={cn(
                state === "todo" && "text-muted-foreground",
                state === "active" && "font-medium",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
