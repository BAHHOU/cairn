/**
 * Credentials in documentation are real more often than anyone admits: `MQ_APP_PASSWORD=secret` in a
 * `docker run`, `Password: secret` in a setup list, a token in a badge URL. Whatever is stored from a
 * document goes through here first, so the guides never repeat what the scanner would flag.
 */

const KEY_VALUE =
  /\b([\w.-]*(?:password|passwd|pwd|secret|token|api[-_]?key|credential)[\w.-]*)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;)]+)/gi;
const URL_CREDENTIALS = /(\w+:\/\/[^\s:@/]+:)[^\s@/]+@/g;
const TOKEN_FAMILIES =
  /\b(?:glpat-[\w-]{16,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[\w]{30,}|sq[bpua]_[0-9a-f]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[\w-]{10,})/g;
const QUERY_SECRET = /([?&](?:token|access_token|private_token|key|sig|signature)=)[^&\s)"'`]+/gi;
/** `(admin/passw0rd)`: only on a line that talks about logging in, so `(src/main)` is left alone. */
const LOGIN_LINE =
  /\b(?:login|log in|console|admin|user(?:name)?|identifiant|credentials?|connect)\b/i;
const USER_SLASH_SECRET = /\(\s*([A-Za-z][\w.-]*)\s*\/\s*[^\s)/]{3,}\s*\)/g;

export const MASK = "•••";

export function redact(text: string): string {
  let out = text
    .replace(KEY_VALUE, (_m, key: string, sep: string) => `${key}${sep}${MASK}`)
    .replace(URL_CREDENTIALS, `$1${MASK}@`)
    .replace(TOKEN_FAMILIES, MASK)
    .replace(QUERY_SECRET, `$1${MASK}`);
  if (LOGIN_LINE.test(out)) {
    out = out.replace(USER_SLASH_SECRET, (_m, user: string) => `(${user}/${MASK})`);
  }
  return out;
}

/** Drops the query string and fragment of a URL: that is where tokens travel. */
export function stripUrlQuery(url: string): string {
  return url.replace(/[?#].*$/, "");
}
