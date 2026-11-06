/**
 * The page's built files (story 31): `/` is index.html; any other path is a file inside the
 * web folder or not found. Paths that climb out of the folder are not found, never read.
 */
import { join, normalize, sep } from "node:path";

export const NOT_FOUND = 404;
const INDEX = "index.html";
/** Built chunks carry a content hash in their names, so the browser may keep them. */
const HASHED = /-[a-z0-9]{8}\.(js|css|svg|woff2?|ttf|png)$/;
const KEEP_HASHED = "public, max-age=31536000, immutable";

/** The file a URL path names inside `webDir`, or null when it would leave the folder. */
export function staticPath(webDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const rel = decoded === "/" ? INDEX : decoded.replace(/^\/+/, "");
  const root = normalize(webDir + sep);
  const full = normalize(join(root, rel));
  return full.startsWith(root) && full !== root ? full : null;
}

export function cacheControl(path: string): string {
  return HASHED.test(path) ? KEEP_HASHED : "no-cache";
}
