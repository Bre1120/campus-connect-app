import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { basename, dirname } from "node:path";
import { tmpdir, userInfo } from "node:os";
import { after, afterEach, before, describe, test } from "node:test";
import express from "express";
import pino from "pino";
import { eq } from "drizzle-orm";
import { coursesTable, db, pool, tasksTable } from "@workspace/db";
import { ImportAgendaResponse } from "@workspace/api-zod";
import agendaImportRouter from "./agenda-import";

// Refuse direct execution against any app database, even if DATABASE_URL is set.
// Only the runner's newly created Unix-socket cluster may receive test writes.
const socket = process.env.AGENDA_IMPORT_TEST_SOCKET;
assert.ok(socket && basename(socket) === "socket"
  && dirname(socket) === tmpdir()
  && basename(dirname(socket)).startsWith("agenda-import-test-"),
"Run pnpm --filter @workspace/api-server test:agenda-import; an isolated cluster is required.");
assert.equal(process.env.DATABASE_URL,
  `postgresql://${encodeURIComponent(userInfo().username)}@/postgres?host=${encodeURIComponent(socket)}`);

const alice = "user_agenda_test_alice";
const bob = "user_agenda_test_bob";
const silentLogger = pino({ level: "silent" });
let server: Server;
let baseUrl: string;

function entry(overrides: Record<string, unknown> = {}) {
  return {
    title: "Quiz 1", type: "assignment", dueDate: "2026-10-02",
    priority: "medium", ...overrides,
  };
}

function payload(tasks: Record<string, unknown>[] = [entry()], course: Record<string, unknown> = {}) {
  return { course: { code: "BIO 101", name: "Biology", ...course }, tasks };
}

async function request(body: unknown, owner: string | null = alice) {
  const response = await fetch(`${baseUrl}/api/tasks/import`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(owner ? { "x-test-user": owner } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const bodyValue: unknown = await response.json();
  assert.ok(bodyValue && typeof bodyValue === "object" && !Array.isArray(bodyValue));
  return { status: response.status, body: bodyValue as Record<string, unknown> };
}

async function importOk(body: unknown, owner = alice) {
  const response = await request(body, owner);
  assert.equal(response.status, 200);
  // Assert the unchanged response envelope as well as the generated contract.
  assert.deepEqual(Object.keys(response.body).sort(), ["courseId", "insertedCount", "skippedCount"]);
  return ImportAgendaResponse.parse(response.body);
}

async function snapshot() {
  return {
    courses: await db.select().from(coursesTable).orderBy(coursesTable.id),
    tasks: await db.select().from(tasksTable).orderBy(tasksTable.id),
  };
}

async function seedCourse(ownerId = alice, code = "BIO 101") {
  const [course] = await db.insert(coursesTable).values({
    ownerId, code, name: "Student's course name", color: "#123456",
  }).returning();
  return course;
}

async function injectInsertFailure() {
  // AFTER INSERT forces a real database error after the batch has begun writing.
  // The sentinel is last in the batch; this is not a mocked transaction failure.
  await pool.query(`
    CREATE FUNCTION agenda_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.title = 'Rollback sentinel' THEN
        RAISE EXCEPTION 'Test-only insert failure';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER agenda_test_failure AFTER INSERT ON tasks
      FOR EACH ROW EXECUTE FUNCTION agenda_test_fail();
  `);
}

describe("agenda import HTTP + PostgreSQL regression tests", { concurrency: false }, () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // Simulate ONLY Clerk's already-verified session boundary. No real accounts,
      // tokens, keys, or network auth. The real getAuth/requireAuth still execute.
      // Clerk brands req.auth; this fixture must track that SDK boundary.
      const userId = req.get("x-test-user");
      assert.ok(!userId || userId === alice || userId === bob);
      Object.defineProperty(req, "auth", {
        value: Object.assign(() => ({ userId: userId ?? null, tokenType: "session_token" }),
          { [Symbol.for("@clerk/express.auth")]: true }),
      });
      req.log = silentLogger;
      next();
    });
    app.use("/api", agendaImportRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await pool.query("DROP TRIGGER IF EXISTS agenda_test_failure ON tasks; DROP FUNCTION IF EXISTS agenda_test_fail()");
    await db.delete(tasksTable);
    await db.delete(coursesTable);
    assert.deepEqual(await snapshot(), { courses: [], tasks: [] });
  });

  after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    await pool.end();
  });

  test("unauthenticated requests cannot write, even with spoofed identity fields", async () => {
    const before = await snapshot();
    const result = await request({ ...payload(), ownerId: alice, userId: alice }, null);
    assert.deepEqual(result, { status: 401, body: { error: "Unauthorized" } });
    assert.deepEqual(await snapshot(), before);
  });

  test("ownership comes from authentication, not the body; course codes are account-scoped", async () => {
    const otherCourse = await seedCourse(bob);
    const before = await snapshot();
    const result = await importOk({
      ...payload([entry({ ownerId: bob, completed: true })]), ownerId: bob, userId: bob,
    });
    assert.notEqual(result.courseId, otherCourse.id);
    const state = await snapshot();
    assert.deepEqual(state.courses.find(course => course.id === otherCourse.id), before.courses[0]);
    assert.equal(state.courses.find(course => course.id === result.courseId)?.ownerId, alice);
    assert.equal(state.tasks[0].ownerId, alice);
    assert.equal(state.tasks[0].courseId, result.courseId);
    assert.equal(state.tasks[0].completed, false);
    const bobResult = await importOk(payload(), bob);
    assert.deepEqual(bobResult, { courseId: otherCourse.id, insertedCount: 1, skippedCount: 0 });
    assert.equal((await snapshot()).tasks[1].ownerId, bob);
  });

  test("foreign and nonexistent explicit course IDs are rejected without writes", async () => {
    const own = await seedCourse();
    const foreign = await seedCourse(bob);
    const before = await snapshot();
    for (const courseId of [foreign.id, foreign.id + 10000]) {
      const result = await request(payload([entry()], { courseId, code: own.code }));
      assert.equal(result.status, 400);
      assert.deepEqual(result.body, { error: "The selected course does not belong to your account." });
      assert.deepEqual(await snapshot(), before);
    }
  });

  test("normalized course codes reuse the owned course without overwriting its details", async () => {
    const course = await seedCourse();
    const result = await importOk(payload([entry()], { code: " bio101 ", name: "Imported name" }));
    assert.deepEqual(result, { courseId: course.id, insertedCount: 1, skippedCount: 0 });
    assert.deepEqual((await snapshot()).courses, [course]);
  });

  test("ambiguous owned course codes require explicit selection", async () => {
    const first = await seedCourse();
    const second = await seedCourse(alice, "bio101");
    const before = await snapshot();
    const rejected = await request(payload());
    assert.equal(rejected.status, 400);
    assert.deepEqual(await snapshot(), before);
    const result = await importOk(payload([entry()], { courseId: second.id }));
    assert.deepEqual(result, { courseId: second.id, insertedCount: 1, skippedCount: 0 });
    assert.deepEqual((await snapshot()).courses, [first, second]);
  });

  test("every invalid row rejects the entire batch and creates neither courses nor tasks", async () => {
    const invalidRows = [
      entry({ title: "   " }), entry({ title: "x".repeat(301) }),
      entry({ dueDate: "2026-02-29" }), entry({ dueDate: "2026-04-31" }),
      entry({ dueDate: "0000-01-01" }), entry({ dueDate: "10/02/2026" }),
      entry({ dueTime: "24:00" }), entry({ dueTime: "12:60" }),
      entry({ type: "quiz" }), entry({ priority: "urgent" }),
      entry({ notes: "x".repeat(2001) }), { title: "Missing required fields" },
    ];
    const before = await snapshot();
    for (const row of invalidRows) {
      const result = await request(payload([entry({ title: "Valid first row" }), row]));
      assert.equal(result.status, 400, JSON.stringify(row));
      assert.equal(typeof result.body.error, "string");
      assert.deepEqual(await snapshot(), before);
    }
    // Repeat against an existing course containing completed student work.
    const course = await seedCourse();
    await db.insert(tasksTable).values({
      ownerId: alice, courseId: course.id, title: "Saved task", type: "exam",
      dueDate: "2026-10-02", priority: "high", completed: true, notes: "Keep my notes",
    });
    const saved = await snapshot();
    assert.equal((await request(payload([entry(), invalidRows[0]], { courseId: course.id }))).status, 400);
    assert.deepEqual(await snapshot(), saved);
  });

  test("invalid courses, empty batches, and oversized batches cause no writes", async () => {
    const invalidBodies = [
      payload([entry()], { name: "  " }), payload([entry()], { code: " \t " }),
      payload([entry()], { courseId: -1 }), payload([]),
      payload(Array.from({ length: 101 }, (_, i) => entry({ title: `Task ${i}` }))),
      {}, [],
    ];
    for (const body of invalidBodies) {
      assert.equal((await request(body)).status, 400);
      assert.deepEqual(await snapshot(), { courses: [], tasks: [] });
    }
  });

  test("an insert failure rolls back both a newly created course and the task batch", async () => {
    await injectInsertFailure();
    const result = await request(payload([entry(), entry({ title: "Rollback sentinel" })]));
    assert.deepEqual(result, {
      status: 500,
      body: { error: "Nothing was imported. Your review is still available—please try again." },
    });
    assert.deepEqual(await snapshot(), { courses: [], tasks: [] });
    await pool.query("DROP TRIGGER agenda_test_failure ON tasks");
    assert.equal((await importOk(payload())).insertedCount, 1, "retry must work after rollback");
  });

  test("an insert failure leaves an existing course and its saved tasks unchanged", async () => {
    const course = await seedCourse();
    await importOk(payload([entry({ title: "Existing work", notes: "Saved notes" })], { courseId: course.id }));
    const before = await snapshot();
    await injectInsertFailure();
    assert.equal((await request(payload([entry(), entry({ title: "Rollback sentinel" })],
      { courseId: course.id }))).status, 500);
    assert.deepEqual(await snapshot(), before);
  });

  test("duplicates in a file are skipped by normalized title/date, with first row winning", async () => {
    const result = await importOk(payload([
      entry({ title: "  Quiz  1  ", notes: "  First row notes  " }),
      entry({ title: "quiz 1", notes: "Do not replace", type: "exam", priority: "high", dueTime: "23:59" }),
      entry({ title: "QUIZ 1", dueDate: "2026-10-09" }),
    ]));
    assert.deepEqual(result, { insertedCount: 2, skippedCount: 1, courseId: result.courseId });
    const { tasks } = await snapshot();
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].title, "Quiz  1");
    assert.equal(tasks[0].notes, "First row notes");
    assert.equal(tasks[0].type, "assignment");
    assert.equal(tasks[0].priority, "medium");
    assert.equal(tasks[0].dueTime, null);
    assert.equal(tasks[1].dueDate, "2026-10-09");
  });

  test("repeated imports skip existing rows and add only missing rows", async () => {
    const first = await importOk(payload([entry(), entry({ title: "Project" })]));
    const before = await snapshot();
    for (let retry = 0; retry < 3; retry++) {
      assert.deepEqual(await importOk(payload([entry(), entry({ title: "Project" })])), {
        courseId: first.courseId, insertedCount: 0, skippedCount: 2,
      });
      assert.deepEqual(await snapshot(), before);
    }
    assert.deepEqual(await importOk(payload([
      entry({ title: " quiz   1 " }), entry({ title: "New task" }),
    ])), { courseId: first.courseId, insertedCount: 1, skippedCount: 1 });
    assert.equal((await snapshot()).tasks.length, 3);
  });

  test("matching imports preserve completion, notes, edited fields, IDs, and timestamps", async () => {
    const course = await seedCourse();
    const [saved] = await db.insert(tasksTable).values({
      ownerId: alice, courseId: course.id, title: "  Quiz  1 ", type: "project",
      dueDate: "2026-10-02", dueTime: "09:15", priority: "high",
      completed: true, notes: "My corrections and progress",
      createdAt: new Date("2026-09-01T12:00:00Z"), updatedAt: new Date("2026-09-20T12:00:00Z"),
    }).returning();
    assert.deepEqual(await importOk(payload([
      entry({ title: "quiz 1", type: "exam", priority: "low", dueTime: "23:59", notes: "Replace notes" }),
      entry({ title: "New task" }),
    ], { courseId: course.id })), { courseId: course.id, insertedCount: 1, skippedCount: 1 });
    const state = await snapshot();
    assert.deepEqual(state.tasks[0], saved);
    assert.deepEqual(state.courses, [course]);
    assert.equal(state.tasks[1].completed, false);
  });

  test("duplicate matching stays scoped to the selected course", async () => {
    const first = await seedCourse();
    const second = await seedCourse(alice, "CHEM 101");
    await importOk(payload([entry()], { courseId: first.id }));
    assert.deepEqual(await importOk(payload([entry()], { courseId: second.id })), {
      courseId: second.id, insertedCount: 1, skippedCount: 0,
    });
    assert.equal((await snapshot()).tasks.length, 2);
  });

  for (const existingCourse of [false, true]) {
    test(`simultaneous overlapping imports serialize for ${existingCourse ? "an existing" : "a new"} course`,
      { timeout: 15_000 }, async () => {
        const course = existingCourse ? await seedCourse() : undefined;
        const selection = course ? { courseId: course.id } : {};
        // Hold the exact account lock first, then wait until BOTH HTTP requests
        // are queued in PostgreSQL. This makes contention deterministic and
        // fails if the importer stops taking its transaction-scoped lock.
        const guard = await pool.connect();
        let pending: Promise<ReturnType<typeof ImportAgendaResponse.parse>>[] = [];
        try {
          await guard.query("BEGIN");
          await guard.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [alice]);
          pending = [
            importOk(payload([entry(), entry({ title: "Only first import" })], selection)),
            importOk(payload([entry(), entry({ title: "Only second import" })], selection)),
          ];
          // Attach a handler immediately in case an HTTP request fails while polling.
          const results = Promise.all(pending);
          void results.catch(() => {});
          const deadline = Date.now() + 5000;
          let waiters = 0;
          do {
            const locks = await pool.query<{ count: number }>(`
              SELECT count(*)::int AS count FROM pg_stat_activity
              WHERE datname = current_database() AND wait_event = 'advisory'
                AND pid <> pg_backend_pid()
            `);
            waiters = locks.rows[0].count;
            if (waiters >= 2) break;
            await new Promise(resolve => setTimeout(resolve, 20));
          } while (Date.now() < deadline);
          assert.equal(waiters, 2, "both imports must wait on the account advisory lock");
          await guard.query("COMMIT");
          const imported = await results;
          assert.equal(imported[0].courseId, imported[1].courseId);
          if (course) assert.equal(imported[0].courseId, course.id);
          assert.deepEqual(imported.map(result => result.insertedCount).sort(), [1, 2]);
          assert.deepEqual(imported.map(result => result.skippedCount).sort(), [0, 1]);
          const state = await snapshot();
          assert.equal(state.courses.length, 1);
          assert.equal(state.tasks.length, 3);
          assert.deepEqual(state.tasks.map(task => task.title).sort(),
            ["Only first import", "Only second import", "Quiz 1"]);
        } finally {
          await guard.query("ROLLBACK");
          guard.release();
          await Promise.allSettled(pending);
        }
      });
  }
});