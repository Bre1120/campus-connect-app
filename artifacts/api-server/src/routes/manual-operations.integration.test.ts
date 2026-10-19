import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { basename, dirname } from "node:path";
import { tmpdir, userInfo } from "node:os";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import express from "express";
import pino from "pino";
import { coursesTable, db, pool, tasksTable } from "@workspace/db";
import {
  CreateCourseResponse, CreateTaskResponse, GetTaskResponse, ListCoursesResponse,
  ListTasksResponse, ToggleTaskCompletionResponse, UpdateCourseResponse, UpdateTaskResponse,
} from "@workspace/api-zod";
import coursesRouter from "./courses";
import tasksRouter from "./tasks";

// Never run against an application database. The runner owns this private cluster.
const socket = process.env.AGENDA_IMPORT_TEST_SOCKET;
assert.ok(socket && basename(socket) === "socket"
  && dirname(socket) === tmpdir()
  && basename(dirname(socket)).startsWith("agenda-import-test-"),
"Run pnpm --filter @workspace/api-server test:manual-operations; an isolated cluster is required.");
assert.equal(process.env.DATABASE_URL,
  `postgresql://${encodeURIComponent(userInfo().username)}@/postgres?host=${encodeURIComponent(socket)}`);

const alice = "user_manual_test_alice";
const bob = "user_manual_test_bob";
const silentLogger = pino({ level: "silent" });
let server: Server;
let baseUrl: string;
type Course = ReturnType<typeof CreateCourseResponse.parse>;
type Task = ReturnType<typeof CreateTaskResponse.parse>;
let own: Course;
let otherOwn: Course;
let foreign: Course;
let ownTask: Task;
let otherOwnTask: Task;
let foreignTask: Task;

function taskBody(courseId: number, overrides: Record<string, unknown> = {}) {
  return {
    courseId, title: "Same assignment", type: "assignment", dueDate: "2026-10-02",
    dueTime: "09:00", priority: "medium", notes: "Keep my notes", ...overrides,
  };
}

async function request(method: string, route: string, body?: unknown, owner: string | null = alice) {
  const response = await fetch(`${baseUrl}/api${route}`, {
    method,
    headers: { "content-type": "application/json", ...(owner ? { "x-test-user": owner } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function createCourse(owner = alice, name = "Same course") {
  const result = await request("POST", "/courses",
    { name, code: "BIO 101", color: "#123456" }, owner);
  assert.equal(result.status, 201);
  assert.deepEqual(Object.keys(result.body).sort(), ["code", "color", "id", "name"]);
  return CreateCourseResponse.parse(result.body);
}

async function createTask(courseId: number, owner = alice, overrides: Record<string, unknown> = {}) {
  const result = await request("POST", "/tasks", taskBody(courseId, overrides), owner);
  assert.equal(result.status, 201);
  return CreateTaskResponse.parse(result.body);
}

async function snapshot() {
  return {
    courses: await db.select().from(coursesTable).orderBy(coursesTable.id),
    tasks: await db.select().from(tasksTable).orderBy(tasksTable.id),
  };
}

describe("manual task/course HTTP + PostgreSQL account isolation", { concurrency: false }, () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // Simulate only Clerk's already-verified session, never keys or real accounts.
      // The production getAuth/requireAuth and generated validators still execute.
      const userId = req.get("x-test-user");
      assert.ok(!userId || userId === alice || userId === bob);
      Object.defineProperty(req, "auth", {
        value: Object.assign(() => ({ userId: userId ?? null, tokenType: "session_token" }),
          { [Symbol.for("@clerk/express.auth")]: true }),
      });
      req.log = silentLogger;
      next();
    });
    app.use("/api", coursesRouter, tasksRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    // Use real HTTP creates. Both students deliberately share names/codes/titles.
    // Existing courses also prevent list requests from creating demo data.
    own = await createCourse();
    otherOwn = await createCourse(alice, "Second course");
    foreign = await createCourse(bob);
    ownTask = await createTask(own.id);
    otherOwnTask = await createTask(otherOwn.id, alice, { type: "exam", dueDate: "2026-10-09" });
    foreignTask = await createTask(foreign.id, bob);
  });

  afterEach(async () => {
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

  test("all supported routes reject unauthenticated access without writes", async () => {
    const before = await snapshot();
    const routes: [string, string, unknown?][] = [
      ["GET", "/tasks"], ["GET", `/tasks/${ownTask.id}`],
      ["POST", "/tasks", taskBody(own.id, { ownerId: alice })],
      ["PATCH", `/tasks/${ownTask.id}`, { title: "Spoof", ownerId: alice }],
      ["PATCH", `/tasks/${ownTask.id}/complete`, { completed: true }],
      ["DELETE", `/tasks/${ownTask.id}`],
      ["GET", "/courses"], ["POST", "/courses", { name: "Spoof", code: "X", color: "#123456", ownerId: alice }],
      ["PATCH", `/courses/${own.id}`, { name: "Spoof" }], ["DELETE", `/courses/${own.id}`],
    ];
    for (const [method, route, body] of routes) {
      assert.deepEqual(await request(method, route, body, null),
        { status: 401, body: { error: "Unauthorized" } }, `${method} ${route}`);
      assert.deepEqual(await snapshot(), before);
    }
  });

  test("list and detail reads are account scoped, including foreign course filters", async () => {
    const before = await snapshot();
    for (const [owner, courses, tasks, foreignCourseId] of [
      [alice, [own, otherOwn], [ownTask, otherOwnTask], foreign.id],
      [bob, [foreign], [foreignTask], own.id],
    ] as const) {
      const courseResult = await request("GET", "/courses", undefined, owner);
      assert.equal(courseResult.status, 200);
      assert.deepEqual(ListCoursesResponse.parse(courseResult.body).map(c => c.id).sort(),
        courses.map(c => c.id).sort());
      const taskResult = await request("GET", "/tasks", undefined, owner);
      assert.equal(taskResult.status, 200);
      assert.deepEqual(ListTasksResponse.parse(taskResult.body).map(t => t.id).sort(),
        tasks.map(t => t.id).sort());
      for (const task of tasks) {
        const result = await request("GET", `/tasks/${task.id}`, undefined, owner);
        assert.equal(result.status, 200);
        assert.deepEqual(GetTaskResponse.parse(result.body), task);
      }
      for (const query of [
        `courseId=${foreignCourseId}`, `courseId=${foreignCourseId}&status=active`,
        `courseId=${foreignCourseId}&status=completed`,
        `courseId=${foreignCourseId}&type=assignment&startDate=2026-10-01&endDate=2026-10-10`,
      ]) {
        assert.deepEqual(await request("GET", `/tasks?${query}`, undefined, owner),
          { status: 200, body: [] });
      }
    }
    assert.deepEqual(await snapshot(), before);
  });

  test("foreign and missing task IDs cannot be read, edited, completed, reopened, or deleted", async () => {
    const before = await snapshot();
    for (const [owner, id] of [[alice, foreignTask.id], [bob, ownTask.id], [alice, foreignTask.id + 10000]] as const) {
      const routes: [string, string, unknown?][] = [
        ["GET", `/tasks/${id}`],
        ["PATCH", `/tasks/${id}`, { title: "Stolen edit", notes: "Replace", completed: true, ownerId: owner }],
        ["PATCH", `/tasks/${id}`, { courseId: own.id, title: "Stolen reassignment" }],
        ["PATCH", `/tasks/${id}`, { courseId: foreign.id + 10000 }],
        ["PATCH", `/tasks/${id}/complete`, { completed: true }],
        ["PATCH", `/tasks/${id}/complete`, { completed: false }],
        ["DELETE", `/tasks/${id}`],
      ];
      for (const [method, route, body] of routes) {
        assert.deepEqual(await request(method, route, body, owner),
          { status: 404, body: { error: "Task not found" } }, `${owner}: ${method} ${route}`);
        assert.deepEqual(await snapshot(), before);
      }
    }
  });

  test("foreign and missing courses cannot be edited or deleted (including their tasks)", async () => {
    const before = await snapshot();
    for (const [owner, id] of [[alice, foreign.id], [bob, own.id], [alice, foreign.id + 10000]] as const) {
      for (const [method, body] of [
        ["PATCH", { name: "Stolen course", code: "X", color: "#abcdef", ownerId: owner }],
        ["DELETE", undefined],
      ] as const) {
        assert.deepEqual(await request(method, `/courses/${id}`, body, owner),
          { status: 404, body: { error: "Course not found" } });
        assert.deepEqual(await snapshot(), before);
      }
    }
    // There is no course detail GET contract; do not add one for these tests.
    const unsupported = await fetch(`${baseUrl}/api/courses/${foreign.id}`, {
      headers: { "x-test-user": alice }, signal: AbortSignal.timeout(10_000),
    });
    assert.equal(unsupported.status, 404);
    assert.ok(!(await unsupported.text()).includes(foreign.name));
    assert.deepEqual(await snapshot(), before);
  });

  test("manual creation ignores spoofed ownership and rejects foreign/missing courses", async () => {
    const before = await snapshot();
    for (const [owner, courseId] of [[alice, foreign.id], [bob, own.id], [alice, foreign.id + 10000]] as const) {
      assert.deepEqual(await request("POST", "/tasks", taskBody(courseId, { ownerId: bob, userId: bob }), owner),
        { status: 400, body: { error: "Course not found" } });
      assert.deepEqual(await snapshot(), before);
    }
    const result = await request("POST", "/courses",
      { name: "New course", code: "NEW", color: "#abcdef", ownerId: bob, userId: bob });
    assert.equal(result.status, 201);
    const course = CreateCourseResponse.parse(result.body);
    const task = await createTask(course.id, alice, { ownerId: bob, userId: bob });
    const state = await snapshot();
    assert.equal(state.courses.find(c => c.id === course.id)?.ownerId, alice);
    assert.equal(state.tasks.find(t => t.id === task.id)?.ownerId, alice);
    assert.deepEqual(state.courses.filter(c => c.id !== course.id), before.courses);
    assert.deepEqual(state.tasks.filter(t => t.id !== task.id), before.tasks);
  });

  test("task reassignment rejects foreign/missing courses atomically with no other edits", async () => {
    const before = await snapshot();
    for (const [owner, taskId, courseId] of [
      [alice, ownTask.id, foreign.id], [bob, foreignTask.id, own.id],
      [alice, ownTask.id, foreign.id + 10000],
    ] as const) {
      assert.deepEqual(await request("PATCH", `/tasks/${taskId}`, {
        courseId, title: "Must not save", completed: true, notes: "Must not replace",
      }, owner), { status: 400, body: { error: "Course not found" } });
      assert.deepEqual(await snapshot(), before);
    }
  });

  test("owned edits and reassignment succeed without changing ownership or other work", async () => {
    const before = await snapshot();
    const updatedCourse = await request("PATCH", `/courses/${own.id}`,
      { name: "Edited course", code: "EDIT", color: "#abcdef", ownerId: bob });
    assert.equal(updatedCourse.status, 200);
    assert.deepEqual(UpdateCourseResponse.parse(updatedCourse.body),
      { id: own.id, name: "Edited course", code: "EDIT", color: "#abcdef" });
    const result = await request("PATCH", `/tasks/${ownTask.id}`, {
      courseId: otherOwn.id, title: "Moved assignment", type: "project", dueDate: "2026-10-15",
      dueTime: "15:30", priority: "high", notes: "Edited notes", completed: true, ownerId: bob,
    });
    assert.equal(result.status, 200);
    const task = UpdateTaskResponse.parse(result.body);
    assert.equal(task.id, ownTask.id);
    assert.equal(task.courseId, otherOwn.id);
    assert.equal(task.courseName, otherOwn.name);
    assert.equal(task.courseCode, otherOwn.code);
    assert.equal(task.title, "Moved assignment");
    assert.equal(task.type, "project");
    assert.equal(task.dueDate.toISOString().slice(0, 10), "2026-10-15");
    assert.equal(task.dueTime, "15:30");
    assert.equal(task.priority, "high");
    assert.equal(task.notes, "Edited notes");
    assert.equal(task.completed, true);
    const state = await snapshot();
    assert.equal(state.tasks.find(t => t.id === ownTask.id)?.ownerId, alice);
    assert.equal(state.courses.find(c => c.id === own.id)?.ownerId, alice);
    assert.deepEqual(state.tasks.filter(t => t.id !== ownTask.id), before.tasks.filter(t => t.id !== ownTask.id));
    assert.deepEqual(state.courses.filter(c => c.id !== own.id), before.courses.filter(c => c.id !== own.id));
    assert.deepEqual(GetTaskResponse.parse((await request("GET", `/tasks/${ownTask.id}`)).body), task);
  });

  test("owned completion and reopening persist and respect list status filters", async () => {
    const before = await snapshot();
    for (const completed of [true, false]) {
      const result = await request("PATCH", `/tasks/${ownTask.id}/complete`, { completed });
      assert.equal(result.status, 200);
      const task = ToggleTaskCompletionResponse.parse(result.body);
      assert.equal(task.id, ownTask.id);
      assert.equal(task.completed, completed);
      assert.deepEqual(GetTaskResponse.parse((await request("GET", `/tasks/${ownTask.id}`)).body), task);
      for (const status of ["active", "completed"]) {
        const listed = await request("GET", `/tasks?courseId=${own.id}&status=${status}`);
        assert.equal(listed.status, 200);
        assert.deepEqual(ListTasksResponse.parse(listed.body).map(t => t.id),
          completed === (status === "completed") ? [ownTask.id] : []);
      }
      const state = await snapshot();
      const saved = state.tasks.find(t => t.id === ownTask.id);
      assert.ok(saved);
      assert.deepEqual({ ...saved, completed: false, updatedAt: before.tasks[0].updatedAt }, before.tasks[0]);
      assert.deepEqual(state.tasks.filter(t => t.id !== ownTask.id), before.tasks.filter(t => t.id !== ownTask.id));
      assert.deepEqual(state.courses, before.courses);
    }
  });

  test("deleting an owned task leaves all courses and other students' work intact", async () => {
    const before = await snapshot();
    assert.deepEqual(await request("DELETE", `/tasks/${ownTask.id}`), { status: 204, body: null });
    assert.deepEqual(await snapshot(), {
      courses: before.courses, tasks: before.tasks.filter(t => t.id !== ownTask.id),
    });
    assert.deepEqual(await request("GET", `/tasks/${ownTask.id}`),
      { status: 404, body: { error: "Task not found" } });
  });

  test("deleting an owned course cascades only its tasks, preserving reassigned and foreign work", async () => {
    const secondTask = await createTask(own.id, alice, { title: "Delete this too" });
    assert.equal((await request("PATCH", `/tasks/${secondTask.id}/complete`, { completed: true })).status, 200);
    const moved = await createTask(own.id, alice, { title: "Moved task survives" });
    assert.equal((await request("PATCH", `/tasks/${moved.id}`, { courseId: otherOwn.id })).status, 200);
    const before = await snapshot();
    assert.deepEqual(await request("DELETE", `/courses/${own.id}`), { status: 204, body: null });
    const expected = {
      courses: before.courses.filter(c => c.id !== own.id),
      tasks: before.tasks.filter(t => t.courseId !== own.id),
    };
    assert.deepEqual(await snapshot(), expected);
    assert.ok(expected.tasks.some(t => t.id === moved.id));
    for (const task of [ownTask, secondTask]) {
      assert.deepEqual(await request("GET", `/tasks/${task.id}`),
        { status: 404, body: { error: "Task not found" } });
    }
    for (const [id, owner] of [[moved.id, alice], [otherOwnTask.id, alice], [foreignTask.id, bob]] as const) {
      const result = await request("GET", `/tasks/${id}`, undefined, owner);
      assert.equal(result.status, 200);
      assert.equal(GetTaskResponse.parse(result.body).id, id);
    }
    assert.deepEqual(await request("DELETE", `/courses/${own.id}`),
      { status: 404, body: { error: "Course not found" } });
    assert.deepEqual(await snapshot(), expected);
  });
});