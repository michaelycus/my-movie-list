import { execFileSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// git rev-parse gives the offline fallback page a fresh cache entry on every
// deploy; falls back to a random id so a git-less build (e.g. no .git in the
// build context) still produces a valid, if less precise, revision.
let offlineRevision: string;
try {
  offlineRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
} catch {
  offlineRevision = crypto.randomUUID();
}

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  additionalPrecacheEntries: [{ url: "/~offline", revision: offlineRevision }],
  useNativeEsbuild: true,
});
