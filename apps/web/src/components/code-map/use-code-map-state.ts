"use client";

import { CODE_NODE_KINDS, type CodeNodeKind } from "@cairn/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * The state of the code map lives in the URL, like the architecture viewer's.
 *
 * The reason is the same and it is not cosmetic: the answer to "how does the
 * controller reach the ledger table" is a *link*, not a screenshot and not a
 * paragraph. Anything the reader can select has to survive being pasted into a ticket.
 */
export interface CodeMapState {
  /** Selected symbol. Drives the explanation panel. */
  node: string | null;
  search: string;
  /** Communities the reader has unticked. Hidden, not deleted: the counts stay honest. */
  hidden: string[];
  kinds: CodeNodeKind[];
  /** Only show links the extractor read from the source, never the ones it resolved. */
  extractedOnly: boolean;
  /** Both ends of a path query, highlighted hop by hop. */
  from: string | null;
  to: string | null;
  fullscreen: boolean;
}

export function parseCodeMapState(params: URLSearchParams): CodeMapState {
  const kinds = (params.get("types") ?? "")
    .split(",")
    .filter((k): k is CodeNodeKind => CODE_NODE_KINDS.includes(k as CodeNodeKind));
  return {
    node: params.get("n") || null,
    search: params.get("q") ?? "",
    hidden: (params.get("masque") ?? "").split(",").filter(Boolean),
    kinds,
    extractedOnly: params.get("sur") === "1",
    from: params.get("de") || null,
    to: params.get("vers") || null,
    fullscreen: params.get("plein") === "1",
  };
}

export function serializeCodeMapState(state: CodeMapState): URLSearchParams {
  const params = new URLSearchParams();
  // Defaults are omitted, so a link to the plain map stays a plain link.
  if (state.node) params.set("n", state.node);
  if (state.search) params.set("q", state.search);
  if (state.hidden.length) params.set("masque", state.hidden.join(","));
  if (state.kinds.length) params.set("types", state.kinds.join(","));
  if (state.extractedOnly) params.set("sur", "1");
  if (state.from) params.set("de", state.from);
  if (state.to) params.set("vers", state.to);
  if (state.fullscreen) params.set("plein", "1");
  return params;
}

export function useCodeMapState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = useMemo(() => parseCodeMapState(new URLSearchParams(params.toString())), [params]);

  const update = useCallback(
    (patch: Partial<CodeMapState>) => {
      const next = serializeCodeMapState({ ...state, ...patch });
      const query = next.toString();
      // `replace` rather than `push`: ticking a community is not a page in history.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, state],
  );

  return { state, update };
}
