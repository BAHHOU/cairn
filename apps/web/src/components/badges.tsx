import {
  type GateStatus,
  ISSUE_TYPE_LABEL,
  type IssueType,
  type Provenance,
  type Severity,
} from "@cairn/shared";
import { Badge } from "@/components/ui/badge";

const SEVERITY: Record<
  Severity,
  { label: string; variant: "destructive" | "warning" | "secondary" }
> = {
  blocker: { label: "Bloquant", variant: "destructive" },
  critical: { label: "Critique", variant: "destructive" },
  major: { label: "Majeur", variant: "warning" },
  minor: { label: "Mineur", variant: "secondary" },
};

export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <Badge variant={SEVERITY[severity].variant}>{SEVERITY[severity].label}</Badge>
);

const GATE: Record<GateStatus, { label: string; variant: "success" | "warning" | "destructive" }> =
  {
    passed: { label: "Validé", variant: "success" },
    warning: { label: "Avertissement", variant: "warning" },
    failed: { label: "Échec", variant: "destructive" },
  };

export const GateBadge = ({ status }: { status: GateStatus }) => (
  <Badge variant={GATE[status].variant}>{GATE[status].label}</Badge>
);

export const TypeBadge = ({ type }: { type: IssueType }) => (
  <Badge variant="outline">{ISSUE_TYPE_LABEL[type]}</Badge>
);

const PROVENANCE: Record<
  Provenance,
  { label: string; variant: "success" | "info" | "warning"; hint: string }
> = {
  measured: {
    label: "Mesuré",
    variant: "success",
    hint: "Compté par la passerelle IA interne ou la télémétrie de l'outil",
  },
  declared: {
    label: "Déclaré",
    variant: "info",
    hint: "Rapporté par un fournisseur ou un signal Git, agrégé",
  },
  estimated: {
    label: "Estimé",
    variant: "warning",
    hint: "Calculé à partir de la taille du contexte",
  },
};

export const ProvenanceBadge = ({ provenance }: { provenance: Provenance }) => (
  <Badge variant={PROVENANCE[provenance].variant} title={PROVENANCE[provenance].hint}>
    {PROVENANCE[provenance].label}
  </Badge>
);
