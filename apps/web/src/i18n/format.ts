import { useLocale } from "next-intl";
import { getLocale } from "next-intl/server";
import { createFormat } from "@/lib/format";

/** Number and date formatting in the viewer's language, for components that are not async. */
export const useFormat = () => createFormat(useLocale());

/** Same, for async server components. */
export const getFormat = async () => createFormat(await getLocale());
