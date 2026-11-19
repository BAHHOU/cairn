import type { ChangeRequest } from "@cairn/shared";
import { describe, expect, it } from "vitest";
import { createTracker } from "./create";

const QUERY = { since: "2026-10-16T00:00:00.000Z", doneStatuses: ["Done", "Livré"] };
const APPROVED = ["Validé", "Approved", "CONFIRMED"];

function fakeFetch(routes: [string, unknown][]) {
  const calls: { url: string; body?: string }[] = [];
  const doFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    const hit = routes.find(([part]) => url.includes(part));
    return new Response(JSON.stringify(hit?.[1] ?? {}), { status: hit ? 200 : 404 });
  }) as typeof fetch;
  return { doFetch, calls };
}

const change = (text: string, branch = "feature/x"): ChangeRequest => ({
  id: "1",
  authorId: "dev",
  title: "Change",
  description: text,
  sourceBranch: branch,
  commitMessages: [],
  files: [],
  approvals: [],
});

describe("finding references", () => {
  it("reads each tool's own citation style", () => {
    const find = (c: Parameters<typeof createTracker>[0], text: string, branch?: string) =>
      createTracker(c).find(change(text, branch));
    expect(
      find(
        {
          kind: "taiga",
          baseUrl: "https://api.taiga.io",
          username: "u",
          password: "p",
          project: "acme",
        },
        "TG-12 #closed",
      ),
    ).toEqual(["TG-12"]);
    expect(
      find(
        { kind: "gitea", baseUrl: "https://codeberg.org", token: "t", defaultRepo: "acme/pay" },
        "https://codeberg.org/acme/web/issues/4 and #9",
      ),
    ).toEqual(["acme/web#4", "acme/pay#9"]);
    expect(
      find(
        { kind: "bugzilla", baseUrl: "https://bz.example", token: "t" },
        "Fix bug 1234, see https://bz.example/show_bug.cgi?id=99",
      ),
    ).toEqual(["BZ#1234", "BZ#99"]);
    expect(
      find({ kind: "mantis", baseUrl: "https://mt.example", token: "t" }, "fixes issue #77"),
    ).toEqual(["MT#77"]);
  });
});

describe("reading a specification", () => {
  it("Taiga: signs in once, resolves the reference, rebuilds the approved text", async () => {
    const { doFetch, calls } = fakeFetch([
      ["/auth", { auth_token: "session" }],
      ["/resolver", { project: 1, us: 55 }],
      [
        "/history/userstory/55",
        [
          {
            created_at: "2026-11-02T09:00:00Z",
            user: { username: "lead" },
            values_diff: { status: ["New", "Validé"] },
          },
          {
            created_at: "2026-11-03T09:00:00Z",
            user: { username: "dev" },
            diff: { description: ["Plafond 50 000", "Plafond 2 000 000"] },
          },
        ],
      ],
      [
        "/userstories/55",
        {
          id: 55,
          ref: 12,
          subject: "Plafond",
          description: "Plafond 2 000 000",
          modified_date: "2026-11-03T09:00:00Z",
          status_extra_info: { name: "Validé" },
        },
      ],
    ]);
    const spec = await createTracker(
      {
        kind: "taiga",
        baseUrl: "https://api.taiga.io",
        username: "u",
        password: "p",
        project: "acme",
      },
      { fetch: doFetch },
    ).read("TG-12", APPROVED);
    expect(spec.approved).toMatchObject({ byId: "lead", text: "Plafond 50 000", exact: true });
    expect(spec.url).toBe("https://tree.taiga.io/project/acme/us/12");
    expect(calls.filter((c) => c.url.endsWith("/auth"))).toHaveLength(1);
  });

  it("Gitea: approval from the label event; a later update counts as an edit", async () => {
    const { doFetch } = fakeFetch([
      [
        "/timeline",
        [
          {
            type: "comment",
            body: "LGTM",
            created_at: "2026-11-01T09:00:00Z",
            user: { login: "x" },
          },
          {
            type: "label",
            body: "1",
            created_at: "2026-11-02T09:00:00Z",
            user: { login: "lead" },
            label: { name: "Approved" },
          },
        ],
      ],
      [
        "/issues/9",
        {
          number: 9,
          title: "Plafond",
          body: "Plafond 50 000",
          state: "open",
          html_url: "https://codeberg.org/acme/pay/issues/9",
          created_at: "2026-11-01T08:00:00Z",
          updated_at: "2026-11-04T09:00:00Z",
          labels: [{ name: "Approved" }],
        },
      ],
    ]);
    const spec = await createTracker(
      { kind: "gitea", baseUrl: "https://codeberg.org", token: "t" },
      { fetch: doFetch },
    ).read("acme/pay#9", APPROVED);
    expect(spec.approved).toMatchObject({
      at: "2026-11-02T09:00:00.000Z",
      byId: "lead",
      exact: false,
    });
    expect(spec.revisions).toEqual([{ at: "2026-11-04T09:00:00.000Z", authorId: "unknown" }]);
  });

  it("Bugzilla: the first comment is the spec; status history dates the approval", async () => {
    const { doFetch } = fakeFetch([
      [
        "/comment",
        { bugs: { "1234": { comments: [{ text: "Plafond 50 000" }, { text: "+1" }] } } },
      ],
      [
        "/history",
        {
          bugs: [
            {
              history: [
                {
                  when: "2026-11-02T09:00:00Z",
                  who: "lead@bank.fr",
                  changes: [{ field_name: "status", added: "CONFIRMED", removed: "UNCONFIRMED" }],
                },
              ],
            },
          ],
        },
      ],
      ["/bug/1234?", { bugs: [{ id: 1234, summary: "Plafond", status: "CONFIRMED" }] }],
    ]);
    const spec = await createTracker(
      { kind: "bugzilla", baseUrl: "https://bz", token: "t" },
      { fetch: doFetch },
    ).read("BZ#1234", APPROVED);
    expect(spec.approved).toMatchObject({ byId: "lead", text: "Plafond 50 000", exact: true });
    expect(spec.url).toBe("https://bz/show_bug.cgi?id=1234");
  });

  it("MantisBT: status by label or name; description edits named, not their text", async () => {
    const { doFetch } = fakeFetch([
      [
        "/issues/77",
        {
          issues: [
            {
              id: 77,
              summary: "Plafond",
              description: "Plafond",
              status: { name: "confirmed", label: "Validé" },
              updated_at: "2026-11-03T09:00:00Z",
              history: [
                {
                  created_at: "2026-11-02T09:00:00Z",
                  user: { name: "lead" },
                  field: { name: "status" },
                  new_value: { name: "confirmed", label: "Validé" },
                },
                {
                  created_at: "2026-11-03T09:00:00Z",
                  user: { name: "dev" },
                  type: { name: "description-updated" },
                },
              ],
            },
          ],
        },
      ],
    ]);
    const spec = await createTracker(
      { kind: "mantis", baseUrl: "https://mt", token: "t" },
      { fetch: doFetch },
    ).read("MT#77", APPROVED);
    expect(spec.approved).toMatchObject({ byId: "lead", exact: false });
    expect(spec.revisions).toEqual([{ at: "2026-11-03T09:00:00.000Z", authorId: "dev" }]);
  });
});

describe("listing a board's tickets", () => {
  it("GitHub: pull requests are left out; closed as not planned is not done", async () => {
    const { doFetch } = fakeFetch([
      [
        "/repos/acme/pay/issues",
        [
          {
            number: 1,
            title: "A",
            state: "closed",
            state_reason: "completed",
            html_url: "u1",
            updated_at: "2026-11-02T00:00:00Z",
            labels: [],
          },
          {
            number: 2,
            title: "B",
            state: "closed",
            state_reason: "not_planned",
            html_url: "u2",
            updated_at: "2026-11-02T00:00:00Z",
            labels: [],
          },
          {
            number: 3,
            title: "PR",
            state: "closed",
            html_url: "u3",
            updated_at: "2026-11-02T00:00:00Z",
            labels: [],
            pull_request: {},
          },
        ],
      ],
    ]);
    const items = await createTracker(
      { kind: "github", apiUrl: "https://api.github.com", token: "t" },
      { fetch: doFetch },
    ).list?.({ repo: "acme/pay" }, QUERY);
    expect(items?.map((i) => [i.key, i.done])).toEqual([
      ["acme/pay#1", true],
      ["acme/pay#2", false],
    ]);
  });

  it("Linear: done is the completed state type", async () => {
    const { doFetch, calls } = fakeFetch([
      [
        "api.linear.app",
        {
          data: {
            issues: {
              nodes: [
                {
                  identifier: "ENG-1",
                  title: "A",
                  url: "u",
                  updatedAt: "2026-11-02T00:00:00Z",
                  state: { name: "Shipped", type: "completed" },
                },
                {
                  identifier: "ENG-2",
                  title: "B",
                  url: "u",
                  updatedAt: "2026-11-02T00:00:00Z",
                  state: { name: "Todo", type: "unstarted" },
                },
              ],
            },
          },
        },
      ],
    ]);
    const items = await createTracker({ kind: "linear", apiKey: "k" }, { fetch: doFetch }).list?.(
      { team: "eng" },
      QUERY,
    );
    expect(items?.map((i) => [i.key, i.done])).toEqual([
      ["ENG-1", true],
      ["ENG-2", false],
    ]);
    expect(JSON.parse(calls[0]?.body ?? "{}").variables.team).toBe("ENG");
  });

  it("Bugzilla: only bugs resolved as fixed are done", async () => {
    const { doFetch } = fakeFetch([
      [
        "/rest/bug?product=Payments",
        {
          bugs: [
            {
              id: 1,
              summary: "A",
              status: "RESOLVED",
              resolution: "FIXED",
              last_change_time: "2026-11-02T00:00:00Z",
            },
            {
              id: 2,
              summary: "B",
              status: "RESOLVED",
              resolution: "WONTFIX",
              last_change_time: "2026-11-02T00:00:00Z",
            },
          ],
        },
      ],
    ]);
    const items = await createTracker(
      { kind: "bugzilla", baseUrl: "https://bz", token: "t" },
      { fetch: doFetch },
    ).list?.({ product: "Payments" }, QUERY);
    expect(items?.map((i) => [i.key, i.done])).toEqual([
      ["BZ#1", true],
      ["BZ#2", false],
    ]);
  });
});
