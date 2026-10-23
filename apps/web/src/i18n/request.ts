import { isLocale, type Locale, matchLocale } from "@cairn/shared";
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALE_COOKIE = "cairn-locale";

/**
 * Two catalogs, merged per request: the UI one (this app) and the domain one (@cairn/shared),
 * which also renders the messages produced by the scanner. Their top-level namespaces differ.
 */
const CATALOGS: Record<Locale, () => Promise<Record<string, unknown>>> = {
  fr: async () => ({
    ...(await import("@cairn/shared/messages/fr.json")).default,
    ...(await import("../../messages/fr.json")).default,
  }),
  en: async () => ({
    ...(await import("@cairn/shared/messages/en.json")).default,
    ...(await import("../../messages/en.json")).default,
  }),
};

/** The viewer's choice (cookie) first, then the browser language, then French. */
export async function resolveLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return matchLocale((await headers()).get("accept-language"));
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: await CATALOGS[locale](),
    // Scan dates are stored in UTC and shown as such, on the server and in the browser alike.
    timeZone: "UTC",
  };
});
