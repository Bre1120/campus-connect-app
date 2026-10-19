import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";

// Never inherit DATABASE_URL or credentials. This suite owns its entire cluster,
// uses a private Unix socket (no TCP listener), and removes it on exit.
const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(artifactDir, "../..");
// The manual-operation suite uses the same isolated database lifecycle.
const manualOperations = process.argv.includes("--manual-operations");
const tempDir = await mkdtemp(path.join(tmpdir(), "agenda-import-test-"));
const dataDir = path.join(tempDir, "data");
const socketDir = path.join(tempDir, "socket");
const bundleDir = await mkdtemp(path.join(artifactDir, "node_modules/.agenda-tests-"));
const env = {
  PATH: process.env.PATH,
  HOME: tempDir,
  TMPDIR: tempDir,
  NODE_ENV: "test",
  CLERK_TELEMETRY_DISABLED: "true",
  AGENDA_IMPORT_TEST_SOCKET: socketDir,
  DATABASE_URL: `postgresql://${encodeURIComponent(userInfo().username)}@/postgres?host=${encodeURIComponent(socketDir)}`,
};
let started = false;
let child;
let cleaning;

function run(command, args, cwd = rootDir) {
  return new Promise((resolve, reject) => {
    child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      child = undefined;
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? code})`));
    });
  });
}

function cleanup() {
  return cleaning ??= (async () => {
    if (started) await run("pg_ctl", ["-D", dataDir, "-m", "immediate", "-w", "stop"]);
    await rm(tempDir, { recursive: true, force: true });
    await rm(bundleDir, { recursive: true, force: true });
  })();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    child?.kill(signal);
    try { await cleanup(); } finally { process.exit(signal === "SIGINT" ? 130 : 143); }
  });
}

try {
  await mkdir(socketDir, { mode: 0o700 });
  await run("initdb", ["-D", dataDir, "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  await run("pg_ctl", ["-D", dataDir, "-l", path.join(tempDir, "postgres.log"),
    "-o", `-F -h '' -k '${socketDir}'`, "-w", "start"]);
  started = true;
  // Generate the test schema from the real Drizzle models, not a hand-copied fixture.
  await run("pnpm", ["--filter", "@workspace/db", "exec", "drizzle-kit", "push", "--force"]);
  await build({
    entryPoints: manualOperations ? [
      path.join(artifactDir, "src/routes/manual-operations.integration.test.ts"),
    ] : [
      path.join(artifactDir, "src/lib/agenda-import.test.ts"),
      path.join(artifactDir, "src/routes/agenda-import.integration.test.ts"),
    ],
    outdir: bundleDir,
    outExtension: { ".js": ".mjs" },
    platform: "node",
    format: "esm",
    bundle: true,
    plugins: [{
      name: "external-runtime-dependencies",
      setup(build) {
        // Resolve from the importing workspace package, so pg/zod need not be
        // duplicated in the API package solely for the test bundle.
        build.onResolve({ filter: /^(express|@clerk\/express|drizzle-orm(?:\/.*)?|pg|zod(?:\/.*)?|pino)$/ },
          args => ({ path: createRequire(args.importer).resolve(args.path), external: true }));
      },
    }],
  });
  await run(process.execPath, ["--test", ...(manualOperations ? [
    path.join(bundleDir, "manual-operations.integration.test.mjs"),
  ] : [
    path.join(bundleDir, "lib/agenda-import.test.mjs"),
    path.join(bundleDir, "routes/agenda-import.integration.test.mjs"),
  ])]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}