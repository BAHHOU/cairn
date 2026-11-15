import type { Msg, MsgParam } from "@cairn/shared";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { Format } from "@/lib/format";
import { getFormat, useFormat } from "./format";

/** Msg keys come from code, not literals: the typed translator cannot check them (catalog tests do). */
type DynamicT = (key: string, values?: Record<string, MsgParam>) => string;

/**
 * Values are raw in a `Msg` so a stored scan renders in any language. Numbers are formatted here;
 * a param named `…Min` is a duration in minutes.
 */
function localise(params: Msg["params"], fmt: Format): Record<string, MsgParam> | undefined {
  if (!params) return undefined;
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      typeof value === "number" && name.endsWith("Min") ? fmt.minutes(value) : value,
    ]),
  );
}

const renderer = (t: DynamicT, fmt: Format) => (m: Msg) => t(m.key, localise(m.params, fmt));

/** Renders a `Msg` in the viewer's language, for components that are not async. */
export function useMsg(): (m: Msg) => string {
  return renderer(useTranslations() as unknown as DynamicT, useFormat());
}

/** Same, for async server components. */
export async function getMsg(): Promise<(m: Msg) => string> {
  return renderer((await getTranslations()) as unknown as DynamicT, await getFormat());
}
