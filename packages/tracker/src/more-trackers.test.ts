import type { ChangeRequest } from "@cairn/shared";
import { describe, expect, it } from "vitest";
import { createTracker } from "./create";

const QUERY = { since: "2026-10-16T00:00:00.000Z", doneStatuses: ["Done", "Livré"] };
const APPROVED = ["Validé", "Approved"];

function fakeFetch(routes: [string, unknown][]) {
  const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
  const doFetch = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    });
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
    const opts = {};
    const find = (c: Parameters<typeof createTracker>[0], text: string, branch?: string) =>
      createTracker(c, opts).find(change(text, branch));
    expect(
      find({ kind: "azure", orgUrl: "https://dev.azure.com/acme", token: "t" }, "Fixes AB#42"),
    ).toEqual(["AB#42"]);
    expect(
      find(
        { kind: "openproject", baseUrl: "https://op", token: "t" },
        "OP#7 and https://op/work_packages/8",
      ),
    ).toEqual(["OP#7", "OP#8"]);
    expect(
      find(
        { kind: "redmine", baseUrl: "https://rm.example", token: "t" },
        "refs #12, see https://rm.example/issues/13 and gitlab.com/g/p/-/issues/14",
      ),
    ).toEqual(["RM#12", "RM#13"]);
    expect(find({ kind: "asana", token: "t" }, "https://app.asana.com/0/120/1234567")).toEqual([
      "asana:1234567",
    ]);
    expect(find({ kind: "clickup", token: "t" }, "CU-86ABC12x")).toEqual(["CU-86abc12x"]);
    expect(find({ kind: "shortcut", token: "t" }, "fix", "nour/sc-381/limits")).toEqual(["sc-381"]);
    expect(
      find({ kind: "monday", token: "t" }, "https://acme.monday.com/boards/111/pulses/222"),
    ).toEqual(["monday:222"]);
    expect(
      find(
        { kind: "youtrack", baseUrl: "https://yt", token: "t", projects: ["PAY"] },
        "PAY-3 and OPS-4",
      ),
    ).toEqual(["PAY-3"]);
  });
});

describe("reading a specification", () => {
  it("Azure Boards: the snapshot at approval is the text as approved, exactly", async () => {
    const rev = (rev: number, state: string, desc: string, at: string) => ({
      rev,
      fields: {
        "System.Title": "Plafond",
        "System.State": state,
        "System.TeamProject": "Payments",
        "System.Description": desc,
        "System.ChangedDate": at,
        "System.ChangedBy": {
          uniqueName: `${rev === 2 ? "lead" : "dev"}@bank.fr`,
          displayName: "X",
        },
      },
    });
    const { doFetch, calls } = fakeFetch([
      [
        "/revisions",
        {
          value: [
            rev(1, "New", "<p>Plafond 50 000</p>", "2026-11-01T09:00:00Z"),
            rev(2, "Approved", "<p>Plafond 50 000</p>", "2026-11-02T09:00:00Z"),
            rev(3, "Approved", "<p>Plafond 2 000 000</p>", "2026-11-03T09:00:00Z"),
          ],
        },
      ],
    ]);
    const spec = await createTracker(
      { kind: "azure", orgUrl: "https://dev.azure.com/acme", token: "pat" },
      { fetch: doFetch },
    ).read("AB#42", APPROVED);
    expect(spec.approved).toEqual({
      at: "2026-11-02T09:00:00.000Z",
      byId: "lead",
      text: "Plafond 50 000",
      exact: true,
    });
    expect(spec.text).toBe("Plafond 2 000 000");
    expect(spec.revisions).toEqual([{ at: "2026-11-03T09:00:00.000Z", authorId: "dev" }]);
    expect(spec.url).toBe("https://dev.azure.com/acme/Payments/_workitems/edit/42");
    expect(calls[0]?.headers.authorization).toBe(`Basic ${Buffer.from(":pat").toString("base64")}`);
  });

  it("YouTrack: later description edits are undone to rebuild the approved text", async () => {
    const { doFetch } = fakeFetch([
      [
        "/activities",
        [
          {
            timestamp: Date.parse("2026-11-02T09:00:00Z"),
            author: { login: "lead" },
            category: { id: "CustomFieldCategory" },
            field: { name: "State" },
            added: [{ name: "Validé" }],
            removed: [{ name: "Open" }],
          },
          {
            timestamp: Date.parse("2026-11-03T09:00:00Z"),
            author: { login: "dev" },
            category: { id: "DescriptionCategory" },
            added: "Plafond 2 000 000",
            removed: "Plafond 50 000",
          },
        ],
      ],
      [
        "/issues/PAY-42",
        {
          idReadable: "PAY-42",
          summary: "Plafond",
          description: "Plafond 2 000 000",
          customFields: [{ name: "State", value: { name: "Validé" } }],
        },
      ],
    ]);
    const spec = await createTracker(
      { kind: "youtrack", baseUrl: "https://yt.bank", token: "t" },
      { fetch: doFetch },
    ).read("PAY-42", APPROVED);
    expect(spec.approved).toMatchObject({ byId: "lead", text: "Plafond 50 000", exact: true });
    expect(spec.status).toBe("Validé");
    expect(spec.url).toBe("https://yt.bank/issue/PAY-42");
  });

  it("Redmine: status ids are named, and journals give the old description", async () => {
    const { doFetch } = fakeFetch([
      [
        "/issue_statuses.json",
        {
          issue_statuses: [
            { id: 1, name: "New" },
            { id: 3, name: "Validé" },
            { id: 5, name: "Closed", is_closed: true },
          ],
        },
      ],
      [
        "/issues/12.json",
        {
          issue: {
            id: 12,
            subject: "Plafond",
            description: "Plafond 2 000 000",
            status: { id: 3, name: "Validé" },
            journals: [
              {
                created_on: "2026-11-02T09:00:00Z",
                user: { name: "Lead" },
                details: [{ property: "attr", name: "status_id", old_value: "1", new_value: "3" }],
              },
              {
                created_on: "2026-11-03T09:00:00Z",
                user: { name: "Dev" },
                details: [
                  {
                    property: "attr",
                    name: "description",
                    old_value: "Plafond 50 000",
                    new_value: "Plafond 2 000 000",
                  },
                ],
              },
            ],
          },
        },
      ],
    ]);
    const spec = await createTracker(
      { kind: "redmine", baseUrl: "https://rm", token: "t" },
      { fetch: doFetch },
    ).read("RM#12", APPROVED);
    expect(spec.approved).toMatchObject({ byId: "Lead", text: "Plafond 50 000", exact: true });
    expect(spec.revisions).toEqual([{ at: "2026-11-03T09:00:00.000Z", authorId: "Dev" }]);
  });

  it("OpenProject: approval from the activity log, text flagged inexact", async () => {
    const { doFetch } = fakeFetch([
      [
        "/activities",
        {
          _embedded: {
            elements: [
              {
                createdAt: "2026-11-02T09:00:00Z",
                details: [{ raw: "**Status** changed from *New* to *Approved*" }],
                _links: { user: { title: "Lead" } },
              },
              {
                createdAt: "2026-11-03T09:00:00Z",
                details: [{ raw: "Description changed (Details)" }],
                _links: { user: { title: "Dev" } },
              },
            ],
          },
        },
      ],
      [
        "/work_packages/7",
        {
          id: 7,
          subject: "Plafond",
          description: { raw: "Plafond" },
          updatedAt: "2026-11-03T09:00:00Z",
          _links: { status: { title: "Approved" } },
        },
      ],
    ]);
    const spec = await createTracker(
      { kind: "openproject", baseUrl: "https://op", token: "t" },
      { fetch: doFetch },
    ).read("OP#7", APPROVED);
    expect(spec.approved).toMatchObject({
      at: "2026-11-02T09:00:00.000Z",
      byId: "Lead",
      exact: false,
    });
    expect(spec.revisions).toHaveLength(1);
  });

  it("ClickUp: approval date from time in status, nobody named", async () => {
    const { doFetch } = fakeFetch([
      [
        "/time_in_status",
        {
          current_status: {
            status: "validé",
            total_time: { since: `${Date.parse("2026-11-02T09:00:00Z")}` },
          },
          status_history: [
            { status: "to do", total_time: { since: `${Date.parse("2026-11-01T09:00:00Z")}` } },
          ],
        },
      ],
      [
        "/task/86abc12",
        {
          id: "86abc12",
          name: "Plafond",
          text_content: "Plafond",
          url: "https://app.clickup.com/t/86abc12",
          date_created: `${Date.parse("2026-11-01T09:00:00Z")}`,
          date_updated: `${Date.parse("2026-11-02T09:00:01Z")}`,
          status: { status: "validé" },
        },
      ],
    ]);
    const spec = await createTracker({ kind: "clickup", token: "pk_x" }, { fetch: doFetch }).read(
      "CU-86abc12",
      APPROVED,
    );
    expect(spec.approved).toMatchObject({
      at: "2026-11-02T09:00:00.000Z",
      byId: "unknown",
      exact: false,
    });
    // The update a second later is the status change itself, not an edit.
    expect(spec.revisions).toEqual([]);
  });

  it("monday.com: status and approval date from named columns", async () => {
    const { doFetch, calls } = fakeFetch([
      [
        "api.monday.com",
        {
          data: {
            items: [
              {
                id: "222",
                name: "Plafond",
                url: "https://acme.monday.com/boards/111/pulses/222",
                created_at: "2026-11-01T09:00:00Z",
                updated_at: "2026-11-03T09:00:00Z",
                column_values: [
                  { type: "status", text: "Validé", column: { title: "Statut" } },
                  { type: "date", text: "2026-11-02", column: { title: "Validé le" } },
                  { type: "long_text", text: "Plafond 50 000", column: { title: "Spécification" } },
                ],
              },
            ],
          },
        },
      ],
    ]);
    const spec = await createTracker(
      { kind: "monday", token: "t", statusProperty: "Statut", approvedAtProperty: "Validé le" },
      { fetch: doFetch },
    ).read("monday:222", APPROVED);
    expect(spec.approved).toMatchObject({
      at: "2026-11-02T23:59:59.000Z",
      text: "Plafond 50 000",
      exact: false,
    });
    expect(spec.revisions).toEqual([{ at: "2026-11-03T09:00:00.000Z", authorId: "unknown" }]);
    expect(JSON.parse(calls[0]?.body ?? "{}").variables).toEqual({ ids: ["222"] });
  });
});

describe("listing a board's tickets", () => {
  it("Azure Boards: WIQL, then the items", async () => {
    const { doFetch, calls } = fakeFetch([
      ["/wiql", { workItems: [{ id: 1 }, { id: 2 }] }],
      [
        "/workitems?ids=1,2",
        {
          value: [
            {
              id: 1,
              fields: {
                "System.Title": "A",
                "System.State": "Done",
                "System.ChangedDate": "2026-11-02T00:00:00Z",
              },
            },
            {
              id: 2,
              fields: {
                "System.Title": "B",
                "System.State": "Active",
                "System.ChangedDate": "2026-11-03T00:00:00Z",
              },
            },
          ],
        },
      ],
    ]);
    const items = await createTracker(
      { kind: "azure", orgUrl: "https://dev.azure.com/acme", token: "t" },
      { fetch: doFetch },
    ).list?.({ project: "Payments" }, QUERY);
    expect(items?.map((i) => [i.key, i.done])).toEqual([
      ["AB#1", true],
      ["AB#2", false],
    ]);
    expect(calls[0]?.body).toContain("[System.ChangedDate] >= '2026-10-16'");
  });

  it("Redmine: closed statuses count as done", async () => {
    const { doFetch } = fakeFetch([
      [
        "/issue_statuses.json",
        {
          issue_statuses: [
            { id: 5, name: "Fermé", is_closed: true },
            { id: 2, name: "En cours" },
          ],
        },
      ],
      [
        "/issues.json",
        {
          issues: [
            {
              id: 1,
              subject: "A",
              status: { id: 5, name: "Fermé" },
              updated_on: "2026-11-02T00:00:00Z",
            },
            {
              id: 2,
              subject: "B",
              status: { id: 2, name: "En cours" },
              updated_on: "2026-11-02T00:00:00Z",
            },
          ],
        },
      ],
    ]);
    const items = await createTracker(
      { kind: "redmine", baseUrl: "https://rm", token: "t" },
      { fetch: doFetch },
    ).list?.({ project: "pay" }, QUERY);
    expect(items?.map((i) => [i.key, i.done])).toEqual([
      ["RM#1", true],
      ["RM#2", false],
    ]);
  });

  it("Plane: keys from the project identifier, done from the state group", async () => {
    const pid = "0f8c1d2e-3a4b-4c5d-8e9f-001122334455";
    const { doFetch } = fakeFetch([
      [
        `/projects/${pid}/issues/`,
        {
          results: [
            {
              id: "i1",
              project: pid,
              name: "A",
              sequence_id: 3,
              updated_at: "2026-11-02T00:00:00Z",
              state: { name: "Shipped", group: "completed" },
            },
          ],
        },
      ],
      [`/projects/${pid}/`, { identifier: "WEB" }],
    ]);
    const items = await createTracker(
      { kind: "plane", baseUrl: "https://api.plane.so", workspace: "acme", token: "t" },
      { fetch: doFetch },
    ).list?.({ project: pid }, QUERY);
    expect(items?.[0]).toMatchObject({
      key: "WEB-3",
      done: true,
      url: `https://app.plane.so/acme/projects/${pid}/issues/i1`,
    });
  });

  it("ClickUp and Asana: closed or completed tasks are done", async () => {
    const cu = fakeFetch([
      [
        "/list/901/task",
        {
          tasks: [
            {
              id: "abc123",
              name: "A",
              url: "u",
              date_created: "1",
              date_updated: `${Date.parse("2026-11-02T00:00:00Z")}`,
              status: { status: "complete", type: "closed" },
            },
          ],
        },
      ],
    ]);
    const cuItems = await createTracker(
      { kind: "clickup", token: "t" },
      { fetch: cu.doFetch },
    ).list?.({ list: "901" }, QUERY);
    expect(cuItems?.[0]).toMatchObject({ key: "CU-abc123", done: true });

    const as = fakeFetch([
      [
        "/tasks?project=120",
        {
          data: [
            {
              gid: "9",
              name: "A",
              permalink_url: "u",
              completed: true,
              modified_at: "2026-11-02T00:00:00Z",
              memberships: [],
              custom_fields: [],
            },
          ],
        },
      ],
    ]);
    const asItems = await createTracker(
      { kind: "asana", token: "t" },
      { fetch: as.doFetch },
    ).list?.({ project: "120" }, QUERY);
    expect(asItems?.[0]).toMatchObject({ key: "asana:9", done: true, status: "Completed" });
  });
});
