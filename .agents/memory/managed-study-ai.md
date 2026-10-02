---
name: Managed study AI
description: Why Campus Connect uses managed OpenAI access for its study assistant.
---

Prefer Replit-managed OpenAI access for the study assistant; do not require the owner to supply a replacement personal API key by default.

**Why:** The existing direct-provider credentials were rejected during a real assistant request. The owner completed managed-AI activation after being told that requests require no personal API key and are billed to Replit credits.

**How to apply:** Preserve managed-provider routing in later assistant changes. If access fails, follow the managed integration's setup/recovery instructions before requesting credentials. Keep live-response verification distinct from typechecks or mocked responses.