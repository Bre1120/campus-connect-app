---
name: OpenAPI Zod codegen version
description: Generated validators use Zod 4 APIs in this workspace.
---

Keep the workspace Zod catalog on a Zod 4 release when using the current Orval Zod generator; generated schemas use APIs such as `z.int()` that do not exist in Zod 3.

**Why:** Code generation can succeed while the chained library typecheck fails if the catalog is left on Zod 3.

**How to apply:** Check the catalog version before changing the OpenAPI contract or regenerating `lib/api-zod`.