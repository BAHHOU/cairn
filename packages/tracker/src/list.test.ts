import { describe, expect, it } from "vitest";
import { createTracker } from "./create";

const QUERY = { since: "2026-10-16T00:00:00.000Z", doneStatuses: ["Livré", "Done"] };

/** A fetch that answers by URL substring, and records what was asked. */
function fakeFetch(routes: [string, number, unknown][]) {
  const calls: { url: string; body?: string }[] = [];
  const doFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    const hit = routes.find(([part]) => url.includes(part));
    const [, status, body] = hit ?? ["", 404, {}];
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { doFetch, calls };
}

describe("listing a board's tickets", () => {
  it("Jira: done is the status category; Data Center falls back to /search", async () => {
    const { doFetch, calls } = fakeFetch([
      ["/search/jql", 404, {}],
      [
        "/rest/api/2/search?",
        200,
        {
          issues: [
            {
              key: "PAY-1",
              fields: {
                summary: "Plafond",
                updated: "2026-11-02T10:00:00.000+0100",
                status: { name: "Livré en prod", statusCategory: { key: "done" } },
              },
            },
            {
              key: "PAY-2",
              fields: {
                summary: "Export",
                updated: "2026-11-03T10:00:00.000+0100",
                status: { name: "In progress", statusCategory: { key: "indeterminate" } },
              },
            },
          ],
        },
      ],
    ]);
    const jira = createTracker(
      { kind: "jira", baseUrl: "https://jira.bank", auth: { kind: "bearer", token: "t" } },
      { fetch: doFetch },
    );
    const items = await jira.list?.({ jql: "project = PAY" }, QUERY);
    expect(items?.map((i) => [i.key, i.done])).toEqual([
      ["PAY-1", true],
      ["PAY-2", false],
    ]);
    expect(items?.[0]?.url).toBe("https://jira.bank/browse/PAY-1");
    expect(decodeURIComponent(calls.at(-1)?.url ?? "")).toContain(
      '(project = PAY) AND updated >= "2026-10-16"',
    );
  });

  it("GitLab issues: closed or a done label counts as done, keyed like references", async () => {
    const { doFetch } = fakeFetch([
      [
        "/issues?",
        200,
        [
          {
            iid: 4,
            title: "A",
            state: "closed",
            labels: [],
            web_url: "u4",
            updated_at: "2026-11-01T00:00:00Z",
          },
          {
            iid: 5,
            title: "B",
            state: "opened",
            labels: ["Livré"],
            web_url: "u5",
            updated_at: "2026-11-01T00:00:00Z",
          },
          {
            iid: 6,
            title: "C",
            state: "opened",
            labels: [],
            web_url: "u6",
            updated_at: "2026-11-01T00:00:00Z",
          },
        ],
      ],
    ]);
    const gitlab = createTracker(
      { kind: "gitlab", baseUrl: "https://gitlab.bank", project: "team/bank", token: "t" },
      { fetch: doFetch },
    );
    const items = await gitlab.list?.({}, QUERY);
    expect(items?.map((i) => [i.key, i.done, i.status])).toEqual([
      ["#4", true, "closed"],
      ["#5", true, "Livré"],
      ["#6", false, "opened"],
    ]);
  });

  it("Trello: the list name says done; old cards are left out", async () => {
    const { doFetch } = fakeFetch([
      [
        "/lists",
        200,
        [
          { id: "l1", name: "Done" },
          { id: "l2", name: "Doing" },
        ],
      ],
      [
        "/cards/all",
        200,
        [
          {
            name: "A",
            shortLink: "AbCd1234",
            url: "ua",
            dateLastActivity: "2026-11-01T00:00:00Z",
            idList: "l1",
          },
          {
            name: "B",
            shortLink: "EfGh5678",
            url: "ub",
            dateLastActivity: "2026-01-01T00:00:00Z",
            idList: "l2",
          },
        ],
      ],
    ]);
    const trello = createTracker({ kind: "trello", key: "k", token: "t" }, { fetch: doFetch });
    const items = await trello.list?.({ board: "BoArD123" }, QUERY);
    expect(items).toEqual([
      expect.objectContaining({ key: "trello:AbCd1234", done: true, status: "Done" }),
    ]);
  });

  it("Notion: queries the database by last edit and reads the status property", async () => {
    const { doFetch, calls } = fakeFetch([
      [
        "/query",
        200,
        {
          results: [
            {
              id: "0123456789abcdef0123456789abcdef",
              url: "https://notion.so/p",
              created_time: "2026-10-20T00:00:00Z",
              last_edited_time: "2026-11-01T00:00:00Z",
              created_by: { id: "u" },
              last_edited_by: { id: "u" },
              properties: {
                Name: { type: "title", title: [{ plain_text: "Plafond" }] },
                Status: { type: "status", status: { name: "Livré" } },
              },
            },
          ],
        },
      ],
    ]);
    const notion = createTracker({ kind: "notion", token: "t" }, { fetch: doFetch });
    const items = await notion.list?.({ database: "01234567-89ab-cdef-0123-456789abcdef" }, QUERY);
    expect(items?.[0]).toMatchObject({
      key: "notion:0123456789abcdef0123456789abcdef",
      title: "Plafond",
      done: true,
    });
    expect(JSON.parse(calls[0]?.body ?? "{}").filter.last_edited_time.on_or_after).toBe(
      QUERY.since,
    );
  });

  it("refuses a missing scope instead of listing everything", async () => {
    const jira = createTracker(
      { kind: "jira", baseUrl: "https://jira.bank", auth: { kind: "bearer", token: "t" } },
      { fetch: fakeFetch([]).doFetch },
    );
    await expect(async () => jira.list?.({}, QUERY)).rejects.toThrow(/JQL/);
  });
});
