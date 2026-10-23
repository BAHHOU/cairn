"use server";

import { localeSchema } from "@cairn/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "./request";

export async function setLocale(locale: string): Promise<void> {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return;
  (await cookies()).set(LOCALE_COOKIE, parsed.data, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
