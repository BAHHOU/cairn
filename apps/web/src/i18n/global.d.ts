import type { Locale } from "@cairn/shared";
import type domain from "@cairn/shared/messages/fr.json";
import type ui from "../../messages/fr.json";

/** French is the reference catalog: a key missing there is a type error everywhere. */
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof ui & typeof domain;
  }
}
