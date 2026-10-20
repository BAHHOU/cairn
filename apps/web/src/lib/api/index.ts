import type { CairnApi } from "@cairn/shared";
import { getViewer } from "../session";
import { createHttpApi } from "./http";
import { createMockApi } from "./mock";

/**
 * Single switch between demo data and the real backend:
 *   DATA_SOURCE=mock (default) | http  (with API_BASE_URL and optionally API_TOKEN)
 */
export async function getApi(): Promise<CairnApi> {
  if (process.env.DATA_SOURCE === "http") {
    const baseUrl = process.env.API_BASE_URL;
    if (!baseUrl) throw new Error("API_BASE_URL is required when DATA_SOURCE=http");
    return createHttpApi(baseUrl, process.env.API_TOKEN);
  }
  return createMockApi(await getViewer());
}
