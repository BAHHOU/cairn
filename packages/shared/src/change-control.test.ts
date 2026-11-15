import { describe, expect, it } from "vitest";
import {
  type ChangePolicy,
  type ChangeRequest,
  evaluateChange,
  globToRegExp,
  isIban,
  type Person,
  proseNumbers,
  type Spec,
  ticketKeys,
} from "./change-control";
import { SEVERITIES } from "./domain";

const policy: ChangePolicy = {
  zones: [
    {
      id: "payments",
      name: "Paiements",
      paths: ["src/main/java/**/payment/**"],
      keywords: ["virement", "paiement", "payment", "plafond"],
      requires: ["business", "techLead"],
    },
  ],
  approvedStatuses: ["Validé", "Ready for dev"],
  ticketProjects: ["PAY"],
};

const people = new Map<string, Person>(
  [
    { id: "biz", roles: ["business"] },
    { id: "lead", roles: ["techLead"] },
    { id: "dev", roles: [] },
    { id: "peer", roles: [] },
  ].map((p) => [p.id, p as Person]),
);

const LIMIT_FILE = "src/main/java/com/bank/payment/TransferLimits.java";

/** The approved spec: business signed off a 50 000 € daily ceiling. */
const approvedSpec = (overrides: Partial<Spec> = {}): Spec => ({
  key: "PAY-42",
  status: "Validé",
  approved: {
    at: "2026-10-01T09:00:00Z",
    byId: "biz",
    text: "Plafond des virements : 50 000 € par jour pour les comptes professionnels.",
  },
  revisions: [{ at: "2026-09-28T10:00:00Z", authorId: "biz" }],
  ...overrides,
});

const raiseLimit = (overrides: Partial<ChangeRequest> = {}): ChangeRequest => ({
  id: "!128",
  authorId: "dev",
  title: "PAY-42 plafond des virements",
  description: "",
  sourceBranch: "feature/pay-42-plafond",
  commitMessages: ["PAY-42 update limit"],
  files: [
    {
      path: LIMIT_FILE,
      removed: [{ line: 12, text: "  private static final long DAILY_LIMIT = 50_000L;" }],
      added: [{ line: 12, text: "  private static final long DAILY_LIMIT = 2_000_000L;" }],
    },
  ],
  approvals: ["peer"],
  ...overrides,
});

describe("evaluateChange — a payment ceiling raised through an edited spec", () => {
  // The developer rewrote the approved ticket to 2 000 000 €, then shipped code matching it, with
  // a colleague's approval only.
  const result = evaluateChange({
    change: raiseLimit(),
    policy,
    specs: new Map([
      ["PAY-42", approvedSpec({ revisions: [{ at: "2026-10-10T18:00:00Z", authorId: "dev" }] })],
    ]),
    people,
  });

  it("blocks the merge", () => {
    expect(result.verdict).toBe("blocked");
    expect(result.zones).toEqual([{ id: "payments", files: [LIMIT_FILE] }]);
  });

  it("says the author rewrote the spec after it was approved", () => {
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        kind: "spec.rewrittenByAuthor",
        ticket: "PAY-42",
        severity: "blocker",
      }),
    );
  });

  it("compares the new amount with the spec as approved, not as edited", () => {
    expect(result.findings).toContainEqual({
      kind: "change.amountNotInSpec",
      severity: "blocker",
      file: LIMIT_FILE,
      line: 12,
      zone: "payments",
      params: { from: 50_000, to: 2_000_000 },
    });
  });

  it("requires the business and the tech lead; a peer's approval meets neither", () => {
    expect(result.requirements).toEqual([
      { zone: "payments", role: "business", approvedBy: [] },
      { zone: "payments", role: "techLead", approvedBy: [] },
    ]);
    expect(result.findings.filter((f) => f.kind === "approval.missing")).toHaveLength(2);
  });

  it("lists the worst findings first", () => {
    const ranks = result.findings.map((f) => SEVERITIES.indexOf(f.severity));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("evaluateChange — the same change done properly", () => {
  it("passes when the approved spec states the new amount and both roles approved", () => {
    const spec = approvedSpec({
      approved: {
        at: "2026-10-01T09:00:00Z",
        byId: "biz",
        text: "Le plafond des virements passe à 2 000 000 € par jour.",
      },
    });
    const result = evaluateChange({
      change: raiseLimit({ approvals: ["biz", "lead"] }),
      policy,
      specs: new Map([["PAY-42", spec]]),
      people,
    });
    expect(result.verdict).toBe("pass");
    // Still shown to the reviewer, as evidence that code and spec agree.
    expect(result.findings).toEqual([
      expect.objectContaining({ kind: "change.amount", severity: "minor" }),
    ]);
  });
});

describe("evaluateChange — other ways around the review", () => {
  const specs = new Map([["PAY-42", approvedSpec()]]);

  it("does not count the author's own approval", () => {
    const result = evaluateChange({
      change: raiseLimit({ approvals: ["dev", "lead"] }),
      policy,
      specs,
      people: new Map([...people, ["dev", { id: "dev", roles: ["business"] }]]),
    });
    expect(result.findings).toContainEqual({ kind: "approval.self", severity: "major" });
    expect(result.requirements.find((r) => r.role === "business")?.approvedBy).toEqual([]);
  });

  it("blocks a critical change that references no ticket", () => {
    const result = evaluateChange({
      change: raiseLimit({ title: "tweak", sourceBranch: "fix/tweak", commitMessages: ["wip"] }),
      policy,
      specs,
      people,
    });
    expect(result.findings[0]).toEqual({ kind: "ticket.missing", severity: "blocker" });
  });

  it("flags a spec edited by someone else after approval", () => {
    const result = evaluateChange({
      change: raiseLimit({ approvals: ["biz", "lead"] }),
      policy,
      specs: new Map([
        ["PAY-42", approvedSpec({ revisions: [{ at: "2026-10-05T00:00:00Z", authorId: "lead" }] })],
      ]),
      people,
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ kind: "spec.changedAfterApproval", params: { count: 1 } }),
    );
  });

  it("flags a payment change justified by a ticket about something else", () => {
    const result = evaluateChange({
      change: raiseLimit({ approvals: ["biz", "lead"] }),
      policy,
      specs: new Map([
        [
          "PAY-42",
          approvedSpec({
            approved: { at: "2026-10-01T09:00:00Z", byId: "biz", text: "Export PDF des relevés." },
          }),
        ],
      ]),
      people,
    });
    expect(result.findings).toContainEqual({
      kind: "zone.notInSpec",
      severity: "critical",
      zone: "payments",
    });
  });

  it("flags removed checks, opened permissions and a hardcoded beneficiary account", () => {
    const result = evaluateChange({
      change: raiseLimit({
        approvals: ["biz", "lead"],
        files: [
          {
            path: "src/main/java/com/bank/payment/TransferService.java",
            removed: [
              { line: 40, text: '    if (amount > limit) throw new LimitExceeded("daily");' },
              { line: 55, text: "  @PreAuthorize(\"hasRole('TREASURY')\")" },
            ],
            added: [
              { line: 55, text: '  @PreAuthorize("permitAll()")' },
              {
                line: 60,
                text: '  private static final String FALLBACK = "FR76 3000 6000 0112 3456 7890 189";',
              },
            ],
          },
        ],
      }),
      policy,
      specs,
      people,
    });
    const kinds = result.findings.map((f) => f.kind);
    expect(kinds).toContain("change.validationRemoved");
    expect(kinds).toContain("change.authorization");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        kind: "change.hardcodedAccount",
        params: { account: "FR76…0189" },
      }),
    );
    expect(result.verdict).toBe("blocked");
  });

  it("asks for a look, without blocking, outside critical zones", () => {
    const result = evaluateChange({
      change: raiseLimit({
        sourceBranch: "chore/readme",
        title: "README",
        commitMessages: ["docs"],
        files: [{ path: "README.md", removed: [], added: [{ line: 1, text: "# Bank" }] }],
      }),
      policy,
      specs,
      people,
    });
    expect(result.verdict).toBe("review");
    expect(result.findings).toEqual([{ kind: "ticket.missing", severity: "major" }]);
  });
});

describe("helpers", () => {
  it("matches globs across folders", () => {
    const re = globToRegExp("src/main/java/**/payment/**");
    expect(re.test("src/main/java/com/bank/payment/TransferLimits.java")).toBe(true);
    expect(re.test("src/main/java/payment/A.java")).toBe(true);
    expect(re.test("src/main/java/com/bank/payments/A.java")).toBe(false);
    expect(globToRegExp("*.yml").test("config/app.yml")).toBe(false);
  });

  it("finds ticket keys, ignoring standards that look like them", () => {
    const keys = ticketKeys(
      {
        ...raiseLimit(),
        sourceBranch: "feature/pay-7-x",
        title: "Fix UTF-8 export for PAY-9",
        commitMessages: ["see SHA-256 and PAY-9"],
      },
      [],
    );
    expect(keys).toEqual(["PAY-7", "PAY-9"]);
  });

  it("reads amounts the way specs write them", () => {
    expect(proseNumbers("50 000 €")).toEqual([50_000]);
    expect(proseNumbers("2,000,000 USD")).toEqual([2_000_000]);
    expect(proseNumbers("50k par jour")).toEqual([50_000]);
    expect(proseNumbers("2 millions")).toEqual([2_000_000]);
    expect(proseNumbers("1,5 M")).toEqual([1_500_000]);
  });

  it("recognises real IBANs only", () => {
    expect(isIban("FR76 3000 6000 0112 3456 7890 189")).toBe(true);
    expect(isIban("FR76 3000 6000 0112 3456 7890 188")).toBe(false);
  });
});

describe("evaluateChange — references and tools without old versions", () => {
  it("uses the references the trackers found instead of looking for keys itself", () => {
    const result = evaluateChange({
      change: raiseLimit({ approvals: ["biz", "lead"] }),
      policy,
      specs: new Map([["#12", { ...approvedSpec(), key: "#12" }]]),
      people,
      tickets: ["#12"],
    });
    expect(result.tickets).toEqual(["#12"]);
    expect(result.findings.some((f) => f.kind === "ticket.unavailable")).toBe(false);
  });

  it("does not take today's text as the approved one when the tool lost the old version", () => {
    // GitLab Free knows the ticket was edited after approval, not what it said before: the new
    // amount must not count as approved just because today's text mentions it.
    const spec: Spec = {
      ...approvedSpec(),
      approved: {
        at: "2026-10-01T09:12:00Z",
        byId: "biz",
        text: "Plafond : 2 000 000 €.",
        exact: false,
      },
      revisions: [{ at: "2026-10-10T18:00:00Z", authorId: "lead" }],
    };
    const result = evaluateChange({
      change: raiseLimit({ approvals: ["biz", "lead"] }),
      policy,
      specs: new Map([["PAY-42", spec]]),
      people,
    });
    expect(result.findings.map((f) => f.kind)).toContain("change.amountNotInSpec");
  });

  it("trusts today's text when nobody edited it since approval", () => {
    const spec: Spec = {
      ...approvedSpec(),
      approved: {
        at: "2026-10-01T09:12:00Z",
        byId: "biz",
        text: "Plafond : 2 000 000 €.",
        exact: false,
      },
      revisions: [],
    };
    const result = evaluateChange({
      change: raiseLimit({ approvals: ["biz", "lead"] }),
      policy,
      specs: new Map([["PAY-42", spec]]),
      people,
    });
    expect(result.verdict).toBe("pass");
  });
});
