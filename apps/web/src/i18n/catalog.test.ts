import {
  APPROVAL_SIGNALS,
  APPROVER_ROLES,
  CHANGE_FINDING_KINDS,
  CHANGE_VERDICTS,
  CHECK_IDS,
  DELIVERY_RISK_KINDS,
  GAP_IDS,
  HEALTH_AREAS,
  HEALTH_LIGHTS,
  HEALTH_OWNERS,
  HEALTH_REASONS,
  HEALTH_VERDICTS,
  LOCALES,
  NOT_CHECKED,
  SPEC_EVIDENCE,
  TRACE_CATEGORIES,
  TRACE_FINDING_KINDS,
} from "@cairn/shared";
import domainEn from "@cairn/shared/messages/en.json";
import domainFr from "@cairn/shared/messages/fr.json";
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import uiEn from "../../messages/en.json";
import uiFr from "../../messages/fr.json";
import { LIVE_TRACKERS, TRACKER_FIELDS } from "../lib/changes/tracker-fields";

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

function dottedKeys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => [
    ...(key.includes(".") ? [`${prefix}${key}`] : []),
    ...(typeof value === "string" ? [] : dottedKeys(value, `${prefix}${key}/`)),
  ]);
}

describe.each(Object.entries(CATALOGS))("%s catalog", (_, catalog) => {
  const reference = flatten(catalog.fr);

  // next-intl reads "." as a path separator: a key containing one can never be looked up.
  it.each([...LOCALES])("%s has no key containing a dot", (locale) => {
    expect(dottedKeys(catalog[locale])).toEqual([]);
  });

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

it.each([...LOCALES])("%s has a message for every readiness check and gap", (locale) => {
  const keys = flatten(CATALOGS.ui?.[locale] ?? {});
  for (const id of CHECK_IDS) expect(keys.has(`overview.readiness.check.${id}`), id).toBe(true);
  for (const id of GAP_IDS) {
    expect(keys.has(`overview.gaps.item.${id}.title`), id).toBe(true);
    expect(keys.has(`overview.gaps.item.${id}.why`), id).toBe(true);
  }
});

it("UI and domain catalogs do not share a top-level namespace", () => {
  const ui = Object.keys(uiFr);
  expect(Object.keys(domainFr).filter((k) => ui.includes(k))).toEqual([]);
});

it.each([...LOCALES])("%s has a message for every part of the health brief", (locale) => {
  const keys = flatten(CATALOGS.ui?.[locale] ?? {});
  const expected = [
    ...HEALTH_AREAS.map((a) => `health.area.${a}`),
    ...HEALTH_LIGHTS.map((l) => `health.light.${l}`),
    ...HEALTH_OWNERS.map((o) => `health.owner.${o}`),
    ...HEALTH_VERDICTS.flatMap((v) => [`health.verdict.${v}.title`, `health.verdict.${v}.message`]),
    ...HEALTH_AREAS.flatMap((a) => HEALTH_REASONS[a].map((r) => `health.reason.${a}.${r}`)),
    ...NOT_CHECKED.map((id) => `health.notChecked.item.${id}`),
  ];
  for (const key of expected) expect(keys.has(key), key).toBe(true);
});

it.each([...LOCALES])("%s has a message for every change-control finding", (locale) => {
  const keys = flatten(CATALOGS.domain?.[locale] ?? {});
  const expected = [
    ...CHANGE_FINDING_KINDS.flatMap((k) => [
      `domain.change.finding.${k}.title`,
      `domain.change.finding.${k}.detail`,
    ]),
    ...CHANGE_VERDICTS.map((v) => `domain.change.verdict.${v}`),
    ...APPROVER_ROLES.map((r) => `domain.change.approverRole.${r}`),
    ...TRACE_FINDING_KINDS.flatMap((k) => [
      `domain.trace.finding.${k}.title`,
      `domain.trace.finding.${k}.detail`,
    ]),
    ...TRACE_CATEGORIES.flatMap((c) => [
      `domain.trace.category.${c}.label`,
      `domain.trace.category.${c}.hint`,
    ]),
  ];
  for (const key of expected) expect(keys.has(key), key).toBe(true);
});

it.each([...LOCALES])("%s describes every tracker and every connection field", (locale) => {
  const keys = flatten(CATALOGS.ui?.[locale] ?? {});
  const expected = [
    ...SPEC_EVIDENCE.flatMap((e) => [
      `integrations.evidence.${e}.label`,
      `integrations.evidence.${e}.hint`,
    ]),
    ...APPROVAL_SIGNALS.map((a) => `integrations.approval.${a}`),
    ...LIVE_TRACKERS.map((k) => `integrations.dialog.help.${k}`),
    ...LIVE_TRACKERS.flatMap((k) =>
      TRACKER_FIELDS[k].map((f) => `integrations.field.${f.name}.label`),
    ),
  ];
  for (const key of expected) expect(keys.has(key), key).toBe(true);
  for (const k of LIVE_TRACKERS) {
    expect(keys.get(`integrations.dialog.help.${k}`)?.length ?? 0, k).toBeGreaterThan(0);
  }
});

it.each([...LOCALES])("%s has a message for every delivery risk", (locale) => {
  const keys = flatten(CATALOGS.domain?.[locale] ?? {});
  for (const kind of DELIVERY_RISK_KINDS) {
    expect(keys.has(`domain.deliveryRisk.${kind}.title`), kind).toBe(true);
    expect(keys.has(`domain.deliveryRisk.${kind}.detail`), kind).toBe(true);
  }
});

it.each([...LOCALES])("%s has a portfolio wording for every readiness gap", (locale) => {
  const keys = flatten(CATALOGS.ui?.[locale] ?? {});
  for (const id of GAP_IDS) {
    expect(keys.has(`aiReadiness.portfolio.fixes.item.${id}`), id).toBe(true);
  }
});
