import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { apiBuildOptions } from "./build.mjs";

// Assembles a Vercel Build Output API (v3) bundle at <workspace>/.vercel/output:
// the web app as static files, and the Express API as one Node function at /api.
// Run after the web app is built (see the root "build:vercel" script).

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(artifactDir, "../..");
const outputDir = path.join(rootDir, ".vercel/output");
const webDist = path.join(rootDir, "artifacts/campus-connect/dist/public");
const functionDir = path.join(outputDir, "functions/api.func");

async function buildVercelOutput() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(functionDir, { recursive: true });

  await cp(webDist, path.join(outputDir, "static"), { recursive: true });

  await esbuild(
    apiBuildOptions({
      entryPoints: { index: path.resolve(artifactDir, "src/vercel.ts") },
      outdir: functionDir,
    }),
  );

  await writeFile(
    path.join(functionDir, ".vc-config.json"),
    JSON.stringify(
      {
        runtime: "nodejs22.x",
        handler: "index.mjs",
        launcherType: "Nodejs",
        // Hand Express plain Node req/res; it parses bodies itself.
        shouldAddHelpers: false,
        maxDuration: 60,
      },
      null,
      2,
    ),
  );

  await writeFile(
    path.join(outputDir, "config.json"),
    JSON.stringify(
      {
        version: 3,
        routes: [
          {
            src: "^/assets/(.*)$",
            headers: { "cache-control": "public, max-age=31536000, immutable" },
            continue: true,
          },
          { src: "^/api(?:/.*)?$", dest: "/api" },
          { handle: "filesystem" },
          // Client-side routes (/dashboard, /sign-in, ...) all load the SPA.
          { src: "/(.*)", dest: "/index.html" },
        ],
      },
      null,
      2,
    ),
  );
}

buildVercelOutput().catch((err) => {
  console.error(err);
  process.exit(1);
});
