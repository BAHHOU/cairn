import { getTranslations } from "next-intl/server";
import { ChangeQueue, parseVerdictFilter } from "@/components/changes/change-queue";
import { PageHeader } from "@/components/page";
import { getApi } from "@/lib/api";

/** Every merge request the viewer may see, across projects, the ones not to merge first. */
export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ verdict?: string | string[] }>;
}) {
  const t = await getTranslations("changeControl");
  const filter = parseVerdictFilter((await searchParams).verdict);
  const changes = await (await getApi()).changes.list();
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ChangeQueue changes={changes} filter={filter} basePath="/changes" showProject />
    </>
  );
}
