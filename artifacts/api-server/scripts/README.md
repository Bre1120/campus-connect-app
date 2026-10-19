# API regression tests

## Manual task and course account isolation

Run from the workspace root:

```sh
pnpm --filter @workspace/api-server test:manual-operations
```

This command reuses the disposable PostgreSQL runner described below, with
separate test entry points and a fresh cluster per invocation. It sends HTTP
requests through the real task/course routers, generated validators, and
`requireAuth`, simulating only Clerk's already-verified session with two
synthetic identities. No application accounts, credentials, or databases are used.

Coverage includes authentication on every supported route; account-scoped
lists, task details, and foreign-course list filters; foreign/missing task and
course edits/deletes; completion/reopening; creation with spoofed identity
fields; rejection of foreign/missing reassignment destinations without partial
edits; successful owned edits/reassignment; and course deletion's actual
PostgreSQL cascade, preserving other courses, moved tasks, and the other
student's work. Denied requests are checked against full before/after database
snapshots, including timestamps. There is no course-detail GET endpoint; reads
are covered through the course list and task detail contracts.

## Agenda imports

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