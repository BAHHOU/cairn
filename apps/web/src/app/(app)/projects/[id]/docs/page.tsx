import { notFound } from "next/navigation";
import { ImportedDocs } from "@/components/guide/docs-view";
import { loadImportedScan } from "@/lib/import/scan";

/** Documentation of an imported repository. The demo projects have none to read. */
export default async function DocsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const imported = await loadImportedScan(id);
  if (!imported) notFound();
  return <ImportedDocs id={id} imported={imported} />;
}
