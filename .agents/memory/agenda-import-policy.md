---
name: Agenda import policy
description: Why agenda imports are additive and preserve existing student edits.
---

Agenda imports add missing entries; they are not a synchronization or overwrite operation. A matching title and due date within the same account and course counts as an existing entry, even if its time, priority, type, notes, or completion status differ.

**Why:** A syllabus screenshot is not an authoritative record of a student's work or later edits. Re-importing it must not undo completed work or overwrite corrected details.

**How to apply:** Keep duplicate imports non-destructive and atomic. Add update/replace behavior only as a separate, explicit user choice. Review unclear screenshot text and unspecified due times rather than inventing missing details.

Regression checks for import concurrency and rollback should use disposable real PostgreSQL, not a mocked transaction or the application's configured database.

**Why:** Advisory locks and transactional rollback are PostgreSQL-specific guarantees. A mock can pass while those guarantees are broken; using the app database risks student work.

**How to apply:** Keep synthetic account data confined to an independently created test cluster, and force overlapping requests to contend on the account lock rather than relying on request timing.