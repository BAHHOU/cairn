import { describe, expect, it } from "vitest";
import { TrackerError } from "./http";
import { checkConnection, getSpec, type JiraOptions, toSpec } from "./jira";

const APPROVED_50K = "Plafond des virements : 50 000 € par jour.";
const EDITED_2M = "Plafond des virements : 2 000 000 € par jour.";

/** PAY-42 as Jira Data Center returns it: approved by the business, then edited by the developer. */
const issue = {
  key: "PAY-42",
  fields: {
    summary: "Plafond des virements",
    status: { name: "Validé" },
    description: EDITED_2M,
  },
  changelog: {
    histories: [
      {
        created: "2026-10-28T21:47:00.000+0100",
        author: { name: "t.renaud" },
        items: [{ field: "description", fromString: APPROVED_50K, toString: EDITED_2M }],
      },
      {
        created: "2026-09-29T15:40:00.000+0100",
        author: { name: "m.leroy" },
        items: [{ field: "description", fromString: "Brouillon", toString: APPROVED_50K }],
      },
      {
        created: "2026-10-01T09:12:00.000+0100",
        author: { name: "m.leroy" },
        items: [{ field: "status", fromString: "À valider", toString: "Validé" }],
      },
    ],
  },
};

const options: JiraOptions = { approvedStatuses: ["Validé"] };

describe("toSpec", () => {
  it("rebuilds the text as approved by undoing later edits, newest first", () => {
    const spec = toSpec(issue, options);
    expect(spec.approved).toEqual({
      at: "2026-10-01T08:12:00.000Z",
      byId: "m.leroy",
      text: APPROVED_50K,
      exact: true,
    });
    expect(spec.text).toBe(EDITED_2M);
  });

  it("lists content edits in order, with who made them", () => {
    expect(toSpec(issue, options).revisions).toEqual([
      { at: "2026-09-29T14:40:00.000Z", authorId: "m.leroy" },
      { at: "2026-10-28T20:47:00.000Z", authorId: "t.renaud" },
    ]);
  });

  it("orders history by instant, not by how Jira wrote the offset", () => {
    const mixed = {
      ...issue,
      changelog: {
        histories: [
          // 08:30 UTC, written in UTC+2: after the 08:12 UTC approval, though "07:…" sorts first.
          {
            created: "2026-10-01T10:30:00.000+0200",
            author: { name: "t.renaud" },
            items: [{ field: "description", fromString: APPROVED_50K, toString: EDITED_2M }],
          },
          {
            created: "2026-10-01T09:12:00.000+0100",
            author: { name: "m.leroy" },
            items: [{ field: "status", toString: "Validé" }],
          },
        ],
      },
    };
    expect(toSpec(mixed, options).approved?.text).toBe(APPROVED_50K);
  });

  it("has no approval when the ticket never entered an approved status", () => {
    const draft = {
      ...issue,
      fields: { ...issue.fields, status: { name: "En rédaction" } },
      changelog: { histories: [] },
    };
    expect(toSpec(draft, options).approved).toBeNull();
  });

  it("reads acceptance criteria from a custom field when configured", () => {
    const withCriteria = {
      ...issue,
      fields: { ...issue.fields, customfield_10042: "Refus au-delà du plafond." },
    };
    const spec = toSpec(withCriteria, {
      ...options,
      contentFields: [
        { id: "description", name: "description" },
        { id: "customfield_10042", name: "Acceptance Criteria" },
      ],
    });
    expect(spec.text).toBe(`${EDITED_2M}\n\nRefus au-delà du plafond.`);
  });

  it("identifies Cloud users by e-mail name or account id", () => {
    const cloud = {
      ...issue,
      changelog: {
        histories: [
          {
            created: "2026-10-01T09:12:00.000+0000",
            author: { accountId: "5b10ac8d82e05b22cc7d4ef5" },
            items: [{ field: "status", toString: "Validé" }],
          },
        ],
      },
    };
    expect(toSpec(cloud, options).approved?.byId).toBe("5b10ac8d82e05b22cc7d4ef5");
  });
});

describe("getSpec", () => {
  it("authenticates, reads the changelog and links the ticket", async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const spec = await getSpec(
      { baseUrl: "https://jira.bank.example/", auth: { kind: "bearer", token: "pat" } },
      "PAY-42",
      {
        ...options,
        fetch: (async (url: string, init: RequestInit) => {
          seen = { url, auth: new Headers(init.headers).get("authorization") };
          return Response.json(issue);
        }) as unknown as typeof fetch,
      },
    );
    expect(seen).toEqual({
      url: "https://jira.bank.example/rest/api/2/issue/PAY-42?fields=summary,status,description&expand=changelog",
      auth: "Bearer pat",
    });
    expect(spec.url).toBe("https://jira.bank.example/browse/PAY-42");
  });

  it("maps HTTP failures to stable codes", async () => {
    const answer = (status: number) =>
      getSpec({ baseUrl: "https://j", auth: { kind: "bearer", token: "x" } }, "PAY-1", {
        ...options,
        fetch: (async () => new Response("", { status })) as unknown as typeof fetch,
      }).catch((e: TrackerError) => e.code);
    expect(await answer(401)).toBe("unauthorized");
    expect(await answer(404)).toBe("not_found");
    expect(await answer(429)).toBe("rate_limited");
  });

  it("refuses anything that is not a ticket key before calling Jira", async () => {
    await expect(
      getSpec({ baseUrl: "https://j", auth: { kind: "bearer", token: "x" } }, "../admin", options),
    ).rejects.toBeInstanceOf(TrackerError);
  });
});

describe("checkConnection", () => {
  it("returns who the credentials belong to, with Basic auth for Jira Cloud", async () => {
    let auth: string | null = null;
    const me = await checkConnection(
      { baseUrl: "https://bank.atlassian.net", auth: { kind: "basic", user: "a@b.c", token: "t" } },
      {
        fetch: (async (_url: string, init: RequestInit) => {
          auth = new Headers(init.headers).get("authorization");
          return Response.json({ displayName: "Cairn Bot" });
        }) as unknown as typeof fetch,
      },
    );
    expect(me.displayName).toBe("Cairn Bot");
    expect(auth).toBe(`Basic ${Buffer.from("a@b.c:t").toString("base64")}`);
  });
});
