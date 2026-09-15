# Campus Connect

Campus Connect helps college students organize assignments, exams, projects, and academic deadlines in one calm workspace.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/campus-connect` — responsive React/Vite web app with Clerk sign-in, dashboard, task, calendar, profile, and settings views.
- `artifacts/api-server` — Express API, Clerk middleware, task/course/dashboard/profile/preferences routes.
- `lib/api-spec/openapi.yaml` — source of truth for the API contract.
- `lib/db/src/schema` — Drizzle tables for courses, tasks, student profiles, and reminder preferences.
- `artifacts/campus-connect/src/index.css` — Campus Connect theme tokens and Clerk styling.

## Architecture decisions

- Clerk owns account creation, email/password sign-in, session cookies, and sign-out; the API scopes records by the Clerk user id.
- Task and course endpoints are defined in OpenAPI and generate both the React Query client and Zod validators.
- A new student's first authenticated task/course request seeds a small starter plan so the dashboard is useful immediately.
- Calendar-only dates remain `YYYY-MM-DD` strings in PostgreSQL to avoid timezone shifts.

## Product

- Public landing page with branded sign-in and sign-up.
- Dashboard with today's focus list, upcoming deadlines, and weekly completion rhythm.
- Task CRUD with completion toggles, course/type/status filters, search, priorities, due date/time, and notes.
- Weekly calendar, course management, student profile, and reminder preference settings.

## User preferences

The brief calls for a clean, modern, simple, mobile-first experience that works across phones, tablets, and computers.

## Gotchas

- Clerk browser auth uses same-origin session cookies; do not add bearer-token handling to the web client.
- Restart the managed API and Campus Connect workflows after changing server dependencies or build configuration.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
