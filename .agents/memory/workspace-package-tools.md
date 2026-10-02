---
name: Workspace package tool limitations
description: Package installer behavior that affects this pnpm monorepo.
---

The language-package callback runs at the workspace root and rejects pnpm filter flags as package tokens.

**Why:** Both package-scoped filter arguments and a plain dependency install failed through the callback; the latter hit pnpm's workspace-root protection.

**How to apply:** Read the package-management guidance first. If the callback cannot install into a leaf package, use pnpm's package-scoped add command rather than adding app dependencies to the workspace root or disabling its protection.