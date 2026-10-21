import fg from "fast-glob";

export interface StackFacts {
  technologies: string[];
  fileCount: number;
}

const MARKERS: ReadonlyArray<{ tech: string; patterns: string[] }> = [
  { tech: "java-maven", patterns: ["**/pom.xml"] },
  { tech: "gradle", patterns: ["**/build.gradle", "**/build.gradle.kts"] },
  { tech: "node", patterns: ["**/package.json"] },
  { tech: "python", patterns: ["**/pyproject.toml", "**/requirements.txt"] },
  { tech: "go", patterns: ["**/go.mod"] },
  { tech: "dotnet", patterns: ["**/*.csproj", "**/*.sln"] },
  { tech: "docker", patterns: ["**/Dockerfile*"] },
  { tech: "kustomize", patterns: ["**/kustomization.yaml"] },
  { tech: "ci", patterns: [".gitlab-ci.yml", ".github/workflows/*.yml", "Jenkinsfile"] },
];

const IGNORED = ["**/node_modules/**", "**/.git/**", "**/target/**", "**/dist/**", "**/.next/**"];

/** Read-only and deterministic: same tree in, same facts out. File contents are never read here.
 * Symlinks are never followed: the tree comes from an untrusted repository. */
export async function detectStack(root: string): Promise<StackFacts> {
  const options = {
    cwd: root,
    ignore: IGNORED,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  } as const;
  const all = await fg("**/*", options);
  const technologies: string[] = [];
  for (const { tech, patterns } of MARKERS) {
    const hits = await fg(patterns, options);
    if (hits.length > 0) technologies.push(tech);
  }
  return { technologies: technologies.sort(), fileCount: all.length };
}
