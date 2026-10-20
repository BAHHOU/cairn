import type { BlastRadius, ProjectArchitecture } from "./architecture";
import type { Issue, OrgOverview, Project, Severity, TokenSummary } from "./domain";

/**
 * The single contract between the UI and its data.
 * Two implementations exist: a mock (demo) and an HTTP client (real backend).
 * Permission filtering belongs to the implementation that sits next to the data:
 * the UI never decides what a role may see by hiding a field it already received.
 */
export interface CairnApi {
  overview(): Promise<OrgOverview>;
  projects: {
    list(): Promise<Project[]>;
    get(id: string): Promise<Project | null>;
    /** The architecture graph, its contract and its violations. null when unknown. */
    architecture(id: string): Promise<ProjectArchitecture | null>;
    /** What breaks if the given node changes. Computed next to the data, never in the UI. */
    blastRadius(id: string, nodeId: string): Promise<BlastRadius | null>;
  };
  issues: {
    list(filter?: { projectId?: string; severity?: Severity }): Promise<Issue[]>;
  };
  tokens: {
    /** null means "not allowed for this role". */
    summary(): Promise<TokenSummary | null>;
  };
}
