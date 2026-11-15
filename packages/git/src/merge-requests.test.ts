import { describe, expect, it } from "vitest";
import { GitError } from "./errors";
import { getMergeRequest, listOpenMergeRequests, parseUnifiedDiff } from "./merge-requests";
import type { RemoteRepo } from "./remote";

const remote: RemoteRepo = {
  provider: "gitlab",
  host: "gitlab.example.com",
  scheme: "https",
  fullPath: "bank/payments/qis",
};

const DIFF = [
  "@@ -16,4 +16,4 @@ public final class TransferLimits {",
  " ",
  "     /** Daily ceiling for business accounts. */",
  "-    private static final long DAILY_LIMIT_PRO = 50_000L;",
  "+    private static final long DAILY_LIMIT_PRO = 2_000_000L;",
  " }",
  "\\ No newline at end of file",
  "@@ -40,2 +40,3 @@",
  "   payment:",
  "+    audit: true",
  "     daily-limit-pro: 50000",
].join("\n");

/** A fake GitLab answering by URL; `missing` paths answer 404, like an instance without `/diffs`. */
function fakeGitlab(routes: Record<string, unknown>, missing: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const path = url.replace(
      "https://gitlab.example.com/api/v4/projects/bank%2Fpayments%2Fqis",
      "",
    );
    const route = Object.keys(routes).find((r) => path.startsWith(r));
    if (missing.some((m) => path.startsWith(m)) || !route) {
      return new Response("{}", { status: 404 });
    }
    return Response.json(routes[route]);
  }) as typeof fetch;
}

const MR = {
  iid: 128,
  title: "PAY-42 Relever le plafond",
  description: null,
  source_branch: "feature/pay-42",
  target_branch: "main",
  updated_at: "2026-11-04T18:05:00Z",
  web_url: "https://gitlab.example.com/bank/payments/qis/-/merge_requests/128",
  author: { username: "t.renaud" },
};

describe("parseUnifiedDiff", () => {
  it("numbers added lines in the new file and removed lines in the old one", () => {
    expect(parseUnifiedDiff(DIFF)).toEqual({
      removed: [{ line: 18, text: "    private static final long DAILY_LIMIT_PRO = 50_000L;" }],
      added: [
        { line: 18, text: "    private static final long DAILY_LIMIT_PRO = 2_000_000L;" },
        { line: 41, text: "    audit: true" },
      ],
    });
  });

  it("ignores file headers before the first hunk", () => {
    const withHeaders = `--- a/x.java\n+++ b/x.java\n${DIFF}`;
    expect(parseUnifiedDiff(withHeaders).added).toHaveLength(2);
  });
});

describe("getMergeRequest", () => {
  it("reads meta, diffs, commits and approvals into the change-control shape", async () => {
    const mr = await getMergeRequest(remote, "token", "qis", 128, {
      fetch: fakeGitlab({
        "/merge_requests/128/diffs": [
          { new_path: "src/payment/TransferLimits.java", diff: DIFF },
          { new_path: "big.sql", diff: "", too_large: true },
        ],
        "/merge_requests/128/commits": [{ title: "PAY-42 update", message: "PAY-42 update\n" }],
        "/merge_requests/128/approvals": { approved_by: [{ user: { username: "a.martin" } }] },
        "/merge_requests/128": MR,
      }),
    });
    expect(mr).toMatchObject({
      id: "qis!128",
      authorId: "t.renaud",
      description: "",
      approvals: ["a.martin"],
      commitMessages: ["PAY-42 update\n"],
      url: MR.web_url,
    });
    expect(mr.files.map((f) => f.path)).toEqual(["src/payment/TransferLimits.java"]);
  });

  it("falls back to /changes on GitLab versions without /diffs", async () => {
    const mr = await getMergeRequest(remote, "token", "qis", 128, {
      fetch: fakeGitlab(
        {
          "/merge_requests/128/changes": { changes: [{ new_path: "a.java", diff: DIFF }] },
          "/merge_requests/128/commits": [],
          "/merge_requests/128/approvals": {},
          "/merge_requests/128": MR,
        },
        ["/merge_requests/128/diffs"],
      ),
    });
    expect(mr.files).toHaveLength(1);
    expect(mr.approvals).toEqual([]);
  });

  it("refuses GitHub until pull requests are supported", async () => {
    await expect(
      listOpenMergeRequests({ ...remote, provider: "github" }, undefined),
    ).rejects.toBeInstanceOf(GitError);
  });
});
