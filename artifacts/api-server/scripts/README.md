# Agenda import regression tests

Run from the workspace root:

```sh
pnpm --filter @workspace/api-server test:agenda-import
```

Requires Node, pnpm, and PostgreSQL's `initdb` and `pg_ctl` on `PATH`.
Run as a non-root user (PostgreSQL's requirement).

The runner creates a disposable PostgreSQL cluster in a private temporary
directory with a Unix socket and no TCP listener. It **does not inherit the app's
database URL or any credentials**. Drizzle creates the schema from the actual
models. The tests use synthetic identities, delete their rows after each case,
close all connections, stop PostgreSQL, and remove the cluster and test bundles
on exit, including SIGINT/SIGTERM. Missing prerequisites fail the command rather
than skipping tests or falling back to the app database.

The suite sends HTTP requests through the real agenda import router, generated
validators, `requireAuth`, and PostgreSQL transactions. Only Clerk's
already-verified `req.auth` session is simulated in the test-only Express app.
It does not test Clerk token verification or contact Clerk.

Coverage includes unauthenticated requests, spoofed ownership, foreign/missing
course selections, normalized/ambiguous course codes, all-or-nothing invalid
batches, injected database failures, in-file/repeated duplicates, deterministic
simultaneous imports into new and existing courses, and preservation of completed
work and notes. The original normalization/date unit tests run in the same command.