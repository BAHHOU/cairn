import { Lock } from "lucide-react";
import type * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  visual,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  visual?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-3", className)}>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tabular-nums leading-none">{value}</span>
          {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        </div>
        {visual}
      </CardContent>
    </Card>
  );
}

/** Shown instead of data the current role may not see. The data itself is never sent. */
export function LockedCard({
  title,
  reason = "Masqué pour votre rôle",
}: {
  title: string;
  reason?: string;
}) {
  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-muted-foreground">
          <Lock className="size-4" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{reason}</CardContent>
    </Card>
  );
}

export function Restricted({ title = "Accès restreint" }: { title?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <div className="rounded-full bg-muted p-3">
        <Lock className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Cette page n'est pas disponible pour votre rôle. La tentative d'accès est consignée dans le
        journal d'audit.
      </p>
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const tone = value >= 70 ? "bg-primary" : value >= 50 ? "bg-warning" : "bg-destructive";
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="presentation"
    >
      <div
        className={cn("h-full rounded-full", tone)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
