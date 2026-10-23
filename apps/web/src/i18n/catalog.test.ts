import { LOCALES } from "@cairn/shared";
import domainEn from "@cairn/shared/messages/en.json";
import domainFr from "@cairn/shared/messages/fr.json";
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import uiEn from "../../messages/en.json";
import uiFr from "../../messages/fr.json";

/**
 * What the types cannot see: a key present in French but missing in English, a message that is
 * not valid ICU, or a translation that dropped (or renamed) one of its `{arguments}`.
 */

type Tree = { [key: string]: string | Tree };

const CATALOGS: Record<string, Record<(typeof LOCALES)[number], Tree>> = {
  ui: { fr: uiFr, en: uiEn },
  domain: { fr: domainFr, en: domainEn },
};

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/** Argument names and rich-text tags used by a message, from its parsed form. */
function argumentsOf(message: string, locale: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as Record<string, unknown>[]) {
      if (typeof node.value === "string" && node.type !== 0) names.add(node.value);
      if (Array.isArray(node.children)) walk(node.children);
      if (node.options && typeof node.options === "object") {
        for (const option of Object.values(node.options as Record<string, { value: unknown[] }>)) {
          walk(option.value);
        }
      }
    }
  };
  walk(new IntlMessageFormat(message, locale).getAst());
  return [...names].sort();
}

describe.each(Object.entries(CATALOGS))("%s catalog", (_, catalog) => {
  const reference = flatten(catalog.fr);

  it.each(LOCALES.filter((l) => l !== "fr"))("%s has exactly the French keys", (locale) => {
    const keys = [...flatten(catalog[locale]).keys()].sort();
    expect(keys).toEqual([...reference.keys()].sort());
  });

  it.each([...LOCALES])("every %s message is valid ICU", (locale) => {
    for (const [key, message] of flatten(catalog[locale])) {
      expect(() => new IntlMessageFormat(message, locale), key).not.toThrow();
    }
  });

  it.each(LOCALES.filter((l) => l !== "fr"))("%s uses the same arguments as French", (locale) => {
    const translated = flatten(catalog[locale]);
    for (const [key, message] of reference) {
      const other = translated.get(key);
      if (other === undefined) continue;
      expect(argumentsOf(other, locale), key).toEqual(argumentsOf(message, "fr"));
    }
  });
});

it("UI and domain catalogs do not share a top-level namespace", () => {
  const ui = Object.keys(uiFr);
  expect(Object.keys(domainFr).filter((k) => ui.includes(k))).toEqual([]);
});
