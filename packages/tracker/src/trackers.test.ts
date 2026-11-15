import type { ChangeRequest } from "@cairn/shared";
import { describe, expect, it } from "vitest";
import { createTracker } from "./create";
import { findGitHubIssues, toGitHubSpec } from "./github";
import { findGitLabIssues, toGitLabSpec } from "./gitlab";
import { toLinearSpec } from "./linear";
import { findNotionPages, toNotionSpec } from "./notion";
import { findTrelloCards, toTrelloSpec } from "./trello";

const APPROVED = ["approved", "Validé", "Ready"];

const change = (text: string): ChangeRequest => ({
  id: "x",
  authorId: "dev",
  title: "Raise the limit",
  description: text,
  sourceBranch: "feature/limit",
  commitMessages: [],
  files: [],
  approvals: [],
});

describe("finding references", () => {
  it("GitHub: owner/repo#n, issue links, and #n in the default repository", () => {
    const refs = findGitHubIssues(
      change(
        "Fixes #12, see acme/api#7 and https://github.com/acme/web/issues/3. Not &#39; nor PR!5",
      ),
      "acme/bank",
    );
    expect(refs.sort()).toEqual(["acme/api#7", "acme/bank#12", "acme/web#3"]);
  });

  it("GitLab: #n is this project, other projects keep their path, !n is a merge request", () => {
    const refs = findGitLabIssues(
      change("Closes #4 and team/other#9, https://gitlab.com/team/bank/-/issues/5, after !8"),
      "team/bank",
    );
    expect(refs.sort()).toEqual(["#4", "#5", "team/other#9"]);
  });

  it("Trello and Notion: by link", () => {
    const text =
      "Card https://trello.com/c/AbCd1234/12-plafond and https://www.notion.so/acme/Plafond-0f1e2d3c4b5a69788796a5b4c3d2e1f0";
    expect(findTrelloCards(change(text))).toEqual(["trello:AbCd1234"]);
    expect(findNotionPages(change(text))).toEqual(["notion:0f1e2d3c4b5a69788796a5b4c3d2e1f0"]);
  });
});

describe("GitHub issues", () => {
  const issue = (edits: { editedAt: string; diff: string; login: string }[]) => ({
    data: {
      repository: {
        issue: {
          title: "Daily limit",
          body: "Limit: 2 000 000 €",
          url: "https://github.com/acme/bank/issues/12",
          state: "OPEN",
          createdAt: "2026-09-01T10:00:00Z",
          labels: { nodes: [{ name: "approved" }] },
          userContentEdits: {
            nodes: edits.map((e) => ({
              editedAt: e.editedAt,
              editor: { login: e.login },
              diff: e.diff,
            })),
          },
          timelineItems: {
            nodes: [
              {
                createdAt: "2026-10-01T09:00:00Z",
                actor: { login: "biz" },
                label: { name: "approved" },
              },
            ],
          },
        },
      },
    },
  });

  it("rebuilds the body as it was when the approval label was added", () => {
    const spec = toGitHubSpec(
      "acme/bank#12",
      issue([
        { editedAt: "2026-10-10T20:00:00Z", diff: "Limit: 2 000 000 €", login: "dev" },
        { editedAt: "2026-09-01T10:00:00Z", diff: "Limit: 50 000 €", login: "biz" },
      ]),
      APPROVED,
    );
    expect(spec.approved).toEqual({
      at: "2026-10-01T09:00:00.000Z",
      byId: "biz",
      text: "Limit: 50 000 €",
      exact: true,
    });
    expect(spec.revisions).toEqual([{ at: "2026-10-10T20:00:00.000Z", authorId: "dev" }]);
    expect(spec.status).toBe("approved");
  });

  it("takes the body as is when it was never edited", () => {
    expect(toGitHubSpec("acme/bank#12", issue([]), APPROVED).approved?.exact).toBe(true);
  });
});

describe("GitLab issues", () => {
  it("knows who edited after the approval label, but marks the text inexact", () => {
    const spec = toGitLabSpec(
      "#4",
      {
        issue: {
          title: "Limit",
          description: "Limit: 2 000 000 €",
          state: "opened",
          labels: ["approved"],
          web_url: "https://gitlab.com/team/bank/-/issues/4",
        },
        labels: [
          {
            created_at: "2026-10-01T09:00:00Z",
            action: "add",
            user: { username: "biz" },
            label: { name: "approved" },
          },
        ],
        notes: [
          {
            body: "changed the description",
            system: true,
            created_at: "2026-10-10T20:00:00Z",
            author: { username: "dev" },
          },
          {
            body: "LGTM",
            system: false,
            created_at: "2026-10-11T08:00:00Z",
            author: { username: "lead" },
          },
        ],
      },
      APPROVED,
    );
    expect(spec.approved).toMatchObject({ byId: "biz", exact: false });
    expect(spec.revisions).toEqual([{ at: "2026-10-10T20:00:00.000Z", authorId: "dev" }]);
  });
});

describe("Linear", () => {
  it("takes the last move into an approved state as the approval", () => {
    const spec = toLinearSpec(
      {
        data: {
          issue: {
            identifier: "ENG-42",
            title: "Limit",
            description: "Limit: 50 000 €",
            url: "https://linear.app/acme/issue/ENG-42",
            state: { name: "Ready" },
            history: {
              nodes: [
                {
                  createdAt: "2026-10-01T09:00:00Z",
                  actor: { name: "Biz", email: "biz@acme.io" },
                  toState: { name: "Ready" },
                },
                {
                  createdAt: "2026-10-05T09:00:00Z",
                  actor: { name: "Dev", email: "dev@acme.io" },
                  updatedDescription: true,
                },
              ],
            },
          },
        },
      },
      APPROVED,
    );
    expect(spec.approved).toMatchObject({ byId: "biz", exact: false });
    expect(spec.revisions).toEqual([{ at: "2026-10-05T09:00:00.000Z", authorId: "dev" }]);
  });
});

describe("Trello", () => {
  it("rebuilds the description at the move into the approved list", () => {
    const spec = toTrelloSpec(
      "trello:AbCd1234",
      {
        card: {
          name: "Limit",
          desc: "Limit: 2 000 000 €",
          url: "https://trello.com/c/AbCd1234",
          list: { name: "Validé" },
        },
        actions: [
          {
            type: "updateCard",
            date: "2026-10-10T20:00:00Z",
            memberCreator: { username: "dev" },
            data: { old: { desc: "Limit: 50 000 €" } },
          },
          {
            type: "updateCard",
            date: "2026-10-01T09:00:00Z",
            memberCreator: { username: "biz" },
            data: { listAfter: { name: "Validé" } },
          },
        ],
      },
      APPROVED,
    );
    expect(spec.approved).toEqual({
      at: "2026-10-01T09:00:00.000Z",
      byId: "biz",
      text: "Limit: 50 000 €",
      exact: true,
    });
  });
});

describe("Notion", () => {
  const raw = (lastEdited: string, extra: Record<string, unknown> = {}) => ({
    page: {
      url: "https://www.notion.so/x",
      created_time: "2026-09-01T10:00:00.000Z",
      last_edited_time: lastEdited,
      created_by: { id: "u-biz" },
      last_edited_by: { id: "u-dev" },
      properties: {
        Name: { type: "title", title: [{ plain_text: "Limit" }] },
        Status: { type: "status", status: { name: "Validé" } },
        ...extra,
      },
    },
    blocks: {
      results: [
        { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Limit: 50 000 €" }] } },
      ],
    },
  });

  it("counts an edit after the approval date, but not one the same day", () => {
    const withDate = { "Approved on": { type: "date", date: { start: "2026-10-01" } } };
    const cfg = { approvedAtProperty: "Approved on" };
    const sameDay = toNotionSpec(
      "notion:x",
      raw("2026-10-01T15:00:00.000Z", withDate),
      APPROVED,
      cfg,
    );
    const later = toNotionSpec(
      "notion:x",
      raw("2026-10-12T15:00:00.000Z", withDate),
      APPROVED,
      cfg,
    );
    expect(
      Date.parse(sameDay.revisions[0]?.at ?? "") > Date.parse(sameDay.approved?.at ?? ""),
    ).toBe(false);
    expect(Date.parse(later.revisions[0]?.at ?? "") > Date.parse(later.approved?.at ?? "")).toBe(
      true,
    );
  });

  it("reads the title, the status and the page text", () => {
    const spec = toNotionSpec("notion:x", raw("2026-09-01T10:00:00.000Z"), APPROVED, {});
    expect(spec).toMatchObject({ title: "Limit", status: "Validé", text: "Limit: 50 000 €" });
  });
});

describe("createTracker", () => {
  it("builds an adapter per live kind, and authenticates Trello in a header, not the URL", async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const trello = createTracker(
      { kind: "trello", key: "k", token: "t" },
      {
        fetch: (async (url: string, init: RequestInit) => {
          seen = { url, auth: new Headers(init.headers).get("authorization") };
          return Response.json({ username: "me" });
        }) as unknown as typeof fetch,
      },
    );
    expect(await trello.check()).toEqual({ displayName: "me" });
    const call = seen as { url: string; auth: string | null } | null;
    expect(call?.url).not.toContain("token=");
    expect(call?.auth).toContain('oauth_token="t"');
  });
});
