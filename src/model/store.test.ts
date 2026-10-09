import { describe, expect, it } from "vitest";
import { MAX_ORBIT, MIN_ORBIT, mostUrgent, urgencyRadius } from "./orbit";
import {
  OrbitStore,
  applyCompletionStreak,
  createMemoryStorage,
  createTask,
  loadState,
  saveState,
  seedState,
  taskFromCapture,
} from "./store";

const NOW = new Date(2026, 9, 9, 12, 0, 0, 0);

describe("urgencyRadius", () => {
  it("places undated tasks far from the sun", () => {
    expect(urgencyRadius(null, NOW.getTime())).toBeGreaterThan(MAX_ORBIT * 0.8);
  });

  it("pulls overdue tasks inside the inner orbit", () => {
    const overdue = NOW.getTime() - 2 * 86_400_000;
    expect(urgencyRadius(overdue, NOW.getTime())).toBeLessThan(MIN_ORBIT);
  });

  it("decays inward as a due date approaches", () => {
    const now = NOW.getTime();
    const week = urgencyRadius(now + 7 * 86_400_000, now);
    const tomorrow = urgencyRadius(now + 86_400_000, now);
    const hour = urgencyRadius(now + 3_600_000, now);
    expect(week).toBeGreaterThan(tomorrow);
    expect(tomorrow).toBeGreaterThan(hour);
    expect(hour).toBeGreaterThan(MIN_ORBIT - 1);
  });

  it("picks the most urgent open task", () => {
    const far = createTask({ title: "Far", dueAt: NOW.getTime() + 10 * 86_400_000 }, NOW);
    const near = createTask({ title: "Near", dueAt: NOW.getTime() + 3_600_000 }, NOW);
    const done = createTask(
      { title: "Done", dueAt: NOW.getTime() - 1000, completedAt: NOW.getTime() },
      NOW,
    );
    expect(mostUrgent([far, near, done], NOW.getTime())?.title).toBe("Near");
  });
});

describe("OrbitStore", () => {
  it("captures natural-language tasks and persists them", () => {
    const storage = createMemoryStorage();
    const store = new OrbitStore(storage, NOW);
    const added = store.addFromCapture("Paint the bike tomorrow 5pm #home !2", NOW);
    expect(added?.title).toBe("Paint the bike");
    expect(added?.category).toBe("home");
    expect(added?.effort).toBe(2);
    expect(added?.dueAt).not.toBeNull();

    const reloaded = loadState(storage, NOW);
    expect(reloaded.tasks.some((task) => task.title === "Paint the bike")).toBe(true);
  });

  it("completes a task, records a streak, and restores it from the belt", () => {
    const storage = createMemoryStorage();
    saveState(
      {
        version: 1,
        tasks: [],
        settings: {
          muted: false,
          reducedMotion: false,
          listView: false,
          focusMode: false,
        },
        streak: { lastActiveDay: null, count: 0 },
      },
      storage,
    );
    const store = new OrbitStore(storage, NOW);
    const task = store.add(createTask({ title: "Burn me" }, NOW));
    store.complete(task.id, NOW);
    expect(store.byId(task.id)?.completedAt).toBe(NOW.getTime());
    expect(store.state.streak.count).toBe(1);
    expect(store.state.streak.lastActiveDay).toBe("2026-10-09");

    store.restore(task.id);
    expect(store.byId(task.id)?.completedAt).toBeNull();
  });

  it("adds and toggles moons", () => {
    const store = new OrbitStore(createMemoryStorage(), NOW);
    const task = store.add(createTask({ title: "Parent" }, NOW));
    const moon = store.addMoon(task.id, "Crater mapping");
    expect(moon?.done).toBe(false);
    store.toggleMoon(task.id, moon!.id);
    expect(store.byId(task.id)?.subtasks[0]?.done).toBe(true);
  });

  it("seeds a living system when storage is empty", () => {
    const seeded = seedState(NOW);
    expect(seeded.tasks.length).toBeGreaterThan(8);
    expect(seeded.tasks.some((task) => task.completedAt !== null)).toBe(true);
    expect(seeded.tasks.some((task) => task.dueAt !== null && task.dueAt < NOW.getTime())).toBe(
      true,
    );
  });

  it("rejects empty capture titles", () => {
    expect(taskFromCapture("   ", NOW)).toBeNull();
    expect(taskFromCapture("tomorrow 5pm", NOW)).toBeNull();
  });
});

describe("applyCompletionStreak", () => {
  it("increments across consecutive local days and resets after a gap", () => {
    const friday = applyCompletionStreak({ lastActiveDay: null, count: 0 }, NOW);
    expect(friday.count).toBe(1);

    const sameDay = applyCompletionStreak(friday, NOW);
    expect(sameDay.count).toBe(1);

    const saturday = applyCompletionStreak(friday, new Date(2026, 9, 10, 9, 0, 0));
    expect(saturday.count).toBe(2);

    const monday = applyCompletionStreak(saturday, new Date(2026, 9, 12, 9, 0, 0));
    expect(monday.count).toBe(1);
  });
});
