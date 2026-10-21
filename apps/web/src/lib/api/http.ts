import type {
  BlastRadius,
  CairnApi,
  CodeGraph,
  DeliveryPipeline,
  Issue,
  OrgOverview,
  Project,
  ProjectArchitecture,
  ProjectOnboarding,
  TokenSummary,
} from "@cairn/shared";

/**
 * Real backend adapter. Same contract as the mock.
 * The server resolves the viewer from the bearer token and applies permissions itself.
 */
export function createHttpApi(baseUrl: string, token?: string): CairnApi {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      headers: {
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    });
    if (res.status === 403) return null as T;
    if (!res.ok) throw new Error(`Cairn API ${path} failed with ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    overview: () => get<OrgOverview>("/overview"),
    projects: {
      list: () => get<Project[]>("/projects"),
      get: (id) => get<Project | null>(`/projects/${encodeURIComponent(id)}`),
      architecture: (id) =>
        get<ProjectArchitecture | null>(`/projects/${encodeURIComponent(id)}/architecture`),
      blastRadius: (id, nodeId) =>
        get<BlastRadius | null>(
          `/projects/${encodeURIComponent(id)}/architecture/blast-radius?node=${encodeURIComponent(nodeId)}`,
        ),
      codeGraph: (id) => get<CodeGraph | null>(`/projects/${encodeURIComponent(id)}/code-graph`),
      delivery: (id) =>
        get<DeliveryPipeline | null>(`/projects/${encodeURIComponent(id)}/delivery`),
      onboarding: (id) =>
        get<ProjectOnboarding | null>(`/projects/${encodeURIComponent(id)}/onboarding`),
    },
    issues: {
      list: (filter) => {
        const q = new URLSearchParams();
        if (filter?.projectId) q.set("projectId", filter.projectId);
        if (filter?.severity) q.set("severity", filter.severity);
        return get<Issue[]>(`/issues?${q.toString()}`);
      },
    },
    tokens: { summary: () => get<TokenSummary | null>("/tokens/summary") },
  };
}
