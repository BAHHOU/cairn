import { describe, expect, it } from "vitest";
import type { ChangePolicy, SpecView } from "./change-control";
import {
  type DeliveryInput,
  detectAgent,
  type TicketItem,
  type TraceInput,
  traceProject,
} from "./traceability";

const POLICY: ChangePolicy = {
  zones: [
    {
      id: "payments",
      name: "Paiements",
      paths: ["**/payment/**"],
      keywords: ["virement", "plafond"],
      requires: ["business", "techLead"],
    },
  ],
  approvedStatuses: ["Validé"],
  ticketProjects: ["PAY"],
};

const PEOPLE = [
  { id: "biz", roles: ["business" as const] },
  { id: "lead", roles: ["techLead" as const] },
  { id: "dev", roles: [] },
];

const SPEC: SpecView = {
  key: "PAY-1",
  title: "Plafond des virements",
  status: "Validé",
  url: null,
  text: "Plafond de virement : 10 000 €",
  approved: { at: "2026-11-01T09:00:00Z", byId: "biz", text: "Plafond de virement : 10 000 €" },
  revisions: [],
};

function merge(over: Partial<DeliveryInput> = {}): DeliveryInput {
  return {
    kind: "merge",
    ref: "!10",
    sha: "aaaaaaa",
    title: "PAY-1 plafond",
    authorId: "dev",
    at: "2026-11-05T10:00:00Z",
    url: null,
    tickets: ["PAY-1"],
    approvals: [
      { by: "biz", at: "2026-11-04T10:00:00Z" },
      { by: "lead", at: "2026-11-04T11:00:00Z" },
    ],
    commits: [
      {
        sha: "c1",
        at: "2026-11-03T10:00:00Z",
        authorName: "Dev",
        authorEmail: "dev@bank.fr",
        message: "PAY-1 plafond",
      },
    ],
    change: {
      id: "p!10",
      authorId: "dev",
      title: "PAY-1 plafond",
      description: "",
      sourceBranch: "feature/PAY-1",
      commitMessages: ["PAY-1 plafond"],
      approvals: ["biz", "lead"],
      files: [
        {
          path: "src/payment/Limits.java",
          added: [{ line: 3, text: "static final long PLAFOND = 10_000;" }],
          removed: [],
        },
      ],
    },
    ...over,
  };
}

const input = (over: Partial<TraceInput> = {}): TraceInput => ({
  tickets: [],
  specs: [SPEC],
  deliveries: [merge()],
  policy: POLICY,
  people: PEOPLE,
  since: "2026-10-16T00:00:00Z",
  ...over,
});

const kinds = (t: ReturnType<typeof traceProject>) =>
  t.rows.flatMap((r) => r.findings.map((f) => f.kind));

describe("detectAgent", () => {
  it("reads co-author trailers, agent accounts and agent branches", () => {
    expect(
      detectAgent({ messages: ["fix\n\nCo-Authored-By: Claude <noreply@anthropic.com>"] }),
    ).toEqual({ agent: "Claude", via: "coAuthor" });
    expect(
      detectAgent({ authorName: "Copilot", authorEmail: "x@github.com", messages: [] }),
    ).toEqual({ agent: "GitHub Copilot", via: "author" });
    expect(detectAgent({ branch: "cursor/fix-limit", messages: [] })?.via).toBe("branch");
  });

  it("ignores a human writing about a tool", () => {
    expect(detectAgent({ authorName: "Ana", messages: ["Update Copilot settings"] })).toBeNull();
  });
});

describe("traceProject", () => {
  it("finds nothing when an approved ticket shipped with its sign-offs", () => {
    const t = traceProject(input());
    expect(kinds(t)).toEqual([]);
    expect(t.rows[0]?.state).toBe("shipped");
  });

  it("flags a merge with no ticket, harder on a critical zone", () => {
    const t = traceProject(input({ deliveries: [merge({ tickets: [] })] }));
    expect(t.rows[0]).toMatchObject({ state: "unrequested", key: "!10" });
    expect(t.rows[0]?.findings[0]).toMatchObject({ kind: "trace.noTicket", severity: "blocker" });
    expect(t.counts.unrequested).toBe(1);
  });

  it("flags a direct push to main", () => {
    const t = traceProject(
      input({ deliveries: [merge({ kind: "push", ref: "bbbbbbb", tickets: [], approvals: [] })] }),
    );
    expect(kinds(t)).toContain("trace.directPush");
  });

  it("flags tickets done in the tracker that never reached main", () => {
    const done: TicketItem = {
      key: "PAY-2",
      title: "Export",
      status: "Done",
      done: true,
      url: null,
      updatedAt: "2026-11-02T00:00:00Z",
    };
    const t = traceProject(input({ tickets: [done] }));
    const row = t.rows.find((r) => r.key === "PAY-2");
    expect(row?.state).toBe("notShipped");
    expect(row?.findings[0]?.kind).toBe("trace.doneNotShipped");
  });

  it("flags commits pushed after the last approval", () => {
    const late = {
      sha: "c2",
      at: "2026-11-04T12:00:00Z",
      authorName: "Dev",
      authorEmail: "dev@bank.fr",
      message: "raise limit",
    };
    const d = merge();
    const t = traceProject(input({ deliveries: [{ ...d, commits: [...d.commits, late] }] }));
    expect(t.rows[0]?.findings[0]).toMatchObject({
      kind: "trace.commitsAfterApproval",
      params: { count: 1 },
    });
  });

  it("flags a spec edited after the code shipped", () => {
    const edited = { ...SPEC, revisions: [{ at: "2026-11-06T00:00:00Z", authorId: "biz" }] };
    const t = traceProject(input({ specs: [edited] }));
    expect(kinds(t)).toContain("trace.specEditedAfterDelivery");
  });

  it("requires a human review of an agent's change", () => {
    const d = merge({ approvals: [] });
    const agentCommit = {
      sha: "c1",
      at: "2026-11-03T10:00:00Z",
      authorName: "Dev",
      authorEmail: "dev@bank.fr",
      message: "raise limit\n\nCo-authored-by: Claude <noreply@anthropic.com>",
    };
    const t = traceProject(
      input({
        deliveries: [{ ...d, commits: [agentCommit], change: { ...d.change, approvals: [] } }],
      }),
    );
    expect(t.rows[0]?.deliveries[0]?.agent?.agent).toBe("Claude");
    expect(kinds(t)).toContain("trace.agentNoHumanReview");
    expect(t.totals.agentDeliveries).toBe(1);
  });

  it("requires every human sign-off when an agent touches a critical zone", () => {
    const d = merge({ approvals: [{ by: "lead", at: "2026-11-04T11:00:00Z" }] });
    const t = traceProject(
      input({
        deliveries: [
          {
            ...d,
            change: { ...d.change, sourceBranch: "claude/raise-limit", approvals: ["lead"] },
          },
        ],
      }),
    );
    expect(kinds(t)).toContain("trace.agentCriticalZone");
  });
});
