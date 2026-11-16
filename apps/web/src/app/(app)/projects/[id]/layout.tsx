import { listImportViewsForRepository } from "@cairn/db";
import { can, isImportActive } from "@cairn/shared";
import type { ReactNode } from "react";
import { ProjectHeader, type ProjectHeaderData } from "@/components/project-header";
import { getApi } from "@/lib/api";
import { getDb, isImportConfigured, viewerMayImport } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The header and tabs of a project, from the light records only (the project, or the import
 * runs), so a view never waits for the full scan twice. Unknown ids get no header: the page
 * itself answers with its not-found.
 */
async function loadHeader(id: string): Promise<ProjectHeaderData | null> {
  const viewer = await getViewer();
  const project = await (await getApi()).projects.get(id);
  if (project) {
    return {
      id,
      name: project.name,
      branch: null,
      status: null,
      scannedAt: project.lastScan,
      files: null,
      provider: project.provider,
      host: null,
      team: project.team,
      webUrl: null,
      gate: project.gate,
      role: viewer.role,
      rescan: null,
    };
  }

  // Demo projects use slugs; imported repositories use UUIDs and live in the database.
  if (!UUID.test(id) || !isImportConfigured() || !can(viewer.role, "see.allTeams")) return null;
  const runs = await listImportViewsForRepository(getDb(), id);
  const latest = runs[0];
  if (!latest) return null;
  const done = runs.find((r) => r.status === "done");
  const repo = latest.repository;
  return {
    id,
    name: repo.fullPath.split("/").pop() || repo.fullPath,
    branch: repo.branch,
    status: latest.status,
    scannedAt: done ? (done.finishedAt ?? done.createdAt) : null,
    files: done?.facts?.fileCount ?? null,
    provider: repo.provider === "github" ? "GitHub" : "GitLab",
    host: repo.host,
    team: repo.team,
    webUrl: repo.webUrl,
    gate: null,
    role: viewer.role,
    rescan: viewerMayImport(viewer)
      ? { repositoryId: repo.id, disabled: runs.some((r) => isImportActive(r.status)) }
      : null,
  };
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const header = await loadHeader(id);
  return (
    <>
      {header ? <ProjectHeader data={header} /> : null}
      {children}
    </>
  );
}
