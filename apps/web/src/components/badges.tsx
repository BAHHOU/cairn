import type { GateStatus, IssueType, Provenance, Severity } from "@cairn/shared";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const SEVERITY_VARIANT: Record<Severity, "destructive" | "warning" | "secondary"> = {
  blocker: "destructive",
  critical: "destructive",
  major: "warning",
  minor: "secondary",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const t = useTranslations("domain.severity");
  return <Badge variant={SEVERITY_VARIANT[severity]}>{t(severity)}</Badge>;
}

const GATE_VARIANT: Record<GateStatus, "success" | "warning" | "destructive"> = {
  passed: "success",
  warning: "warning",
  failed: "destructive",
};

export function GateBadge({ status }: { status: GateStatus }) {
  const t = useTranslations("domain.gate");
  return <Badge variant={GATE_VARIANT[status]}>{t(status)}</Badge>;
}

export function TypeBadge({ type }: { type: IssueType }) {
  const t = useTranslations("domain.issueType");
  return <Badge variant="outline">{t(type)}</Badge>;
}

const PROVENANCE_VARIANT: Record<Provenance, "success" | "info" | "warning"> = {
  measured: "success",
  declared: "info",
  estimated: "warning",
};

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const t = useTranslations("domain");
  return (
    <Badge variant={PROVENANCE_VARIANT[provenance]} title={t(`provenanceHint.${provenance}`)}>
      {t(`provenance.${provenance}`)}
    </Badge>
  );
}
