import type { JavaFacts, JavaRole, JavaTypeFacts } from "@cairn/shared";
import { balanced, firstLiteral, namedLiteral, stripComments } from "./text";

const KEYWORDS = new Set(["class", "interface", "enum", "record"]);
const IDENT_START = /[A-Za-z_$]/;
const IDENT = /[A-Za-z0-9_$]/;

interface Declaration {
  kind: JavaTypeFacts["kind"];
  name: string;
  index: number;
  nameEnd: number;
  /** Where the previous top-level statement ended: the annotations of this type start here. */
  windowStart: number;
}

/**
 * Finds the top-level type declarations without a Java parser: braces, parentheses and strings
 * are tracked so that `{` inside an annotation or a string never moves the boundaries.
 */
function topLevelDeclarations(src: string): Declaration[] {
  const found: Declaration[] = [];
  let braces = 0;
  let parens = 0;
  let boundary = 0;
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === '"') {
      i += 1;
      while (i < src.length && src[i] !== '"' && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === "'") {
      i += 1;
      while (i < src.length && src[i] !== "'" && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === "(") parens += 1;
    else if (c === ")") parens = Math.max(0, parens - 1);
    else if (parens === 0) {
      if (c === "{") braces += 1;
      else if (c === "}") {
        braces = Math.max(0, braces - 1);
        if (braces === 0) boundary = i + 1;
      } else if (c === ";" && braces === 0) boundary = i + 1;
      else if (braces === 0 && (IDENT_START.test(c) || c === "@")) {
        let kind: JavaTypeFacts["kind"] | undefined;
        let wordEnd = i;
        if (c === "@" && src.startsWith("@interface", i)) {
          kind = "annotation";
          wordEnd = i + "@interface".length;
        } else if (IDENT_START.test(c)) {
          while (wordEnd < src.length && IDENT.test(src[wordEnd] as string)) wordEnd += 1;
          const word = src.slice(i, wordEnd);
          if (KEYWORDS.has(word) && src[i - 1] !== ".") kind = word as JavaTypeFacts["kind"];
        }
        if (kind) {
          const m = /^\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(src.slice(wordEnd, wordEnd + 120));
          if (m?.[1]) {
            found.push({
              kind,
              name: m[1],
              index: i,
              nameEnd: wordEnd + (m[0]?.length ?? 0),
              windowStart: boundary,
            });
            i = wordEnd + (m[0]?.length ?? 0);
            continue;
          }
        }
        i = Math.max(i + 1, wordEnd);
        continue;
      }
    }
    i += 1;
  }
  return found;
}

const annotationNames = (window: string): Set<string> => {
  const names = new Set<string>();
  for (const m of window.matchAll(/@([A-Za-z_][\w.]*)/g)) {
    const full = m[1] as string;
    names.add(full.slice(full.lastIndexOf(".") + 1));
  }
  return names;
};

function annotationArgs(window: string, name: string): string | undefined {
  const m = new RegExp(`@${name}\\s*\\(`).exec(window);
  if (!m) return undefined;
  return balanced(window, m.index + m[0].length - 1);
}

const SPRING_DATA = /\b(?:Jpa|Crud|PagingAndSorting|ListCrud|Revision|Reactive\w*)Repository\s*</;
const DATA_ENTITY = /\b\w*Repository\s*<\s*([A-Za-z_][\w.]*)/;

const CAP_TYPES = 20;
const CAP_IMPORTS = 400;
const CAP_KEYS = 80;

/** Reads the facts of one Java file. Comments are blanked first; no file content is kept. */
export function extractJava(source: string): JavaFacts {
  const src = stripComments(source);
  const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(src)?.[1] ?? "";

  const imports = new Set<string>();
  for (const m of src.matchAll(/^\s*import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/gm)) {
    let name = m[2] as string;
    if (name.startsWith("java.")) continue;
    if (m[1]) {
      // `import static a.b.C.member;` points at the class a.b.C.
      if (!m[3]) name = name.slice(0, Math.max(0, name.lastIndexOf(".")));
      imports.add(name);
    } else imports.add(m[3] ? `${name}.*` : name);
    if (imports.size >= CAP_IMPORTS) break;
  }

  const placeholders = new Set<string>();
  for (const m of src.matchAll(/\$\{([A-Za-z0-9_.\-[\]]+)(?::[^}]*)?\}/g)) {
    placeholders.add(m[1] as string);
    if (placeholders.size >= CAP_KEYS) break;
  }
  const prefixes = [
    ...new Set(
      [
        ...src.matchAll(/@ConfigurationProperties\s*\(\s*(?:(?:prefix|value)\s*=\s*)?"([^"]+)"/g),
      ].map((m) => m[1] as string),
    ),
  ];

  const listens: string[] = [];
  for (const m of src.matchAll(/@(?:Jms|Kafka|Rabbit)Listener\s*\(/g)) {
    const args = balanced(src, m.index + m[0].length - 1);
    if (!args) continue;
    const target =
      namedLiteral(args, "destination") ??
      namedLiteral(args, "queues") ??
      namedLiteral(args, "topics") ??
      firstLiteral(args, ["destination", "queues", "topics", "value"]);
    if (target) listens.push(target);
  }
  const bareListeners = (src.match(/@(?:Jms|Kafka|Rabbit)Listener\b/g) ?? []).length;

  const mappings = (src.match(/@(?:Get|Post|Put|Delete|Patch)Mapping\b/g) ?? []).length;
  const requestMappings = (src.match(/@RequestMapping\b/g) ?? []).length;
  const schedules = (src.match(/@Scheduled\b/g) ?? []).length;

  const declarations = topLevelDeclarations(src);
  const types: JavaTypeFacts[] = [];
  let basePath: string | undefined;
  let classLevelMapping = 0;

  for (const [index, d] of declarations.slice(0, CAP_TYPES).entries()) {
    const window = src.slice(d.windowStart, d.index);
    const names = annotationNames(window);
    const headerEnd = src.indexOf("{", d.nameEnd);
    const header = src.slice(d.nameEnd, headerEnd < 0 ? d.nameEnd + 300 : headerEnd);

    const roles: JavaRole[] = [];
    if (names.has("SpringBootApplication")) roles.push("application");
    if (names.has("RestController") || names.has("Controller")) roles.push("controller");
    if (
      names.has("Repository") ||
      (d.kind === "interface" &&
        (SPRING_DATA.test(header) || /\bextends\b[^{]*Repository\b/.test(header)))
    ) {
      roles.push("repository");
    }
    if (names.has("Service")) roles.push("service");
    if (names.has("Entity")) roles.push("entity");
    if (names.has("Configuration") || names.has("ConfigurationProperties"))
      roles.push("configuration");
    if (index === 0 && (listens.length > 0 || bareListeners > 0)) roles.push("listener");
    if (index === 0 && schedules > 0) roles.push("scheduler");

    const type: JavaTypeFacts = { name: d.name, kind: d.kind, line: lineAt(src, d.index), roles };
    if (names.has("Table")) {
      const table = namedLiteral(annotationArgs(window, "Table") ?? "", "name");
      if (table) type.table = table;
    }
    if (roles.includes("repository")) {
      const entity = DATA_ENTITY.exec(header)?.[1];
      if (entity) type.entityOf = entity.slice(entity.lastIndexOf(".") + 1);
    }
    if (index === 0 && names.has("RequestMapping")) {
      classLevelMapping = 1;
      basePath = firstLiteral(annotationArgs(window, "RequestMapping") ?? "", ["value", "path"]);
    }
    types.push(type);
  }

  const facts: JavaFacts = {
    pkg,
    imports: [...imports],
    types,
    placeholders: [...placeholders],
    prefixes,
    usesJms: /\bJmsTemplate\b|@JmsListener\b/.test(src),
    listens,
    endpoints: mappings + Math.max(0, requestMappings - classLevelMapping),
    schedules,
  };
  if (basePath !== undefined) facts.basePath = basePath;
  return facts;
}

function lineAt(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i += 1) if (src.charCodeAt(i) === 10) line += 1;
  return line;
}
