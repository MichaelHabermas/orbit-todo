import { parseTaskInput } from "./parse";
import {
  type AppState,
  type Settings,
  type Streak,
  type Subtask,
  type Task,
  isCategory,
} from "./types";

export const STORAGE_KEY = "orbit-todo:v1";

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  reducedMotion: false,
  listView: false,
  focusMode: false,
};

export const DEFAULT_STREAK: Streak = {
  lastActiveDay: null,
  count: 0,
};

export interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `orb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function localDayStamp(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function createTask(
  input: Partial<Task> & { title: string },
  now: Date = new Date(),
): Task {
  return {
    id: input.id ?? createId(),
    title: input.title.trim() || "Untitled orbit",
    notes: input.notes ?? "",
    category: input.category ?? "personal",
    effort: clamp(input.effort ?? 3, 1, 5),
    dueAt: input.dueAt === undefined ? null : input.dueAt,
    createdAt: input.createdAt ?? now.getTime(),
    completedAt: input.completedAt === undefined ? null : input.completedAt,
    subtasks: input.subtasks ? input.subtasks.map((moon) => ({ ...moon })) : [],
    orbitAngle: input.orbitAngle ?? Math.random() * Math.PI * 2,
    spin: input.spin ?? 0.35 + Math.random() * 0.9,
  };
}

export function taskFromCapture(raw: string, now: Date = new Date()): Task | null {
  const parsed = parseTaskInput(raw, now);
  if (!parsed.title) return null;
  return createTask(
    {
      title: parsed.title,
      category: parsed.category,
      effort: parsed.effort,
      dueAt: parsed.dueAt,
    },
    now,
  );
}

export function applyCompletionStreak(streak: Streak, now: Date = new Date()): Streak {
  const today = localDayStamp(now);
  if (streak.lastActiveDay === today) {
    return { ...streak, count: Math.max(1, streak.count) };
  }
  if (streak.lastActiveDay && isYesterday(streak.lastActiveDay, now)) {
    return { lastActiveDay: today, count: streak.count + 1 };
  }
  return { lastActiveDay: today, count: 1 };
}

function isYesterday(stamp: string, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return localDayStamp(yesterday) === stamp;
}

export function loadState(
  storage: MemoryStorage,
  now: Date = new Date(),
): AppState {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return seedState(now);
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return normalizeState(parsed, now);
  } catch {
    return seedState(now);
  }
}

export function saveState(state: AppState, storage: MemoryStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function normalizeState(parsed: Partial<AppState>, now: Date): AppState {
  const tasks = Array.isArray(parsed.tasks)
    ? parsed.tasks.map((task) => sanitizeTask(task, now)).filter((task) => task.title)
    : [];
  return {
    version: 1,
    tasks,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings ?? {}),
    },
    streak: {
      ...DEFAULT_STREAK,
      ...(parsed.streak ?? {}),
    },
  };
}

export class OrbitStore {
  state: AppState;
  selectedId: string | null = null;
  private readonly storage: MemoryStorage;
  private readonly listeners = new Set<() => void>();

  constructor(storage: MemoryStorage, now: Date = new Date()) {
    this.storage = storage;
    this.state = loadState(storage, now);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  openTasks(): Task[] {
    return this.state.tasks.filter((task) => task.completedAt === null);
  }

  completedTasks(): Task[] {
    return this.state.tasks.filter((task) => task.completedAt !== null);
  }

  selected(): Task | null {
    return this.state.tasks.find((task) => task.id === this.selectedId) ?? null;
  }

  addFromCapture(raw: string, now: Date = new Date()): Task | null {
    const task = taskFromCapture(raw, now);
    if (!task) return null;
    this.state = {
      ...this.state,
      tasks: [...this.state.tasks, task],
    };
    this.selectedId = task.id;
    this.commit();
    return task;
  }

  add(task: Task): Task {
    this.state = {
      ...this.state,
      tasks: [...this.state.tasks, task],
    };
    this.commit();
    return task;
  }

  update(id: string, patch: Partial<Task>): Task | null {
    let updated: Task | null = null;
    this.state = {
      ...this.state,
      tasks: this.state.tasks.map((task) => {
        if (task.id !== id) return task;
        updated = { ...task, ...patch, id: task.id };
        return updated;
      }),
    };
    this.commit();
    return updated;
  }

  complete(id: string, now: Date = new Date()): Task | null {
    const task = this.state.tasks.find((item) => item.id === id);
    if (!task || task.completedAt !== null) return null;
    const streak = applyCompletionStreak(this.state.streak, now);
    this.state = {
      ...this.state,
      streak,
      tasks: this.state.tasks.map((item) =>
        item.id === id ? { ...item, completedAt: now.getTime() } : item,
      ),
    };
    if (this.selectedId === id) this.selectedId = null;
    this.commit();
    return { ...task, completedAt: now.getTime() };
  }

  restore(id: string): Task | null {
    const task = this.state.tasks.find((item) => item.id === id);
    if (!task || task.completedAt === null) return null;
    this.state = {
      ...this.state,
      tasks: this.state.tasks.map((item) =>
        item.id === id ? { ...item, completedAt: null } : item,
      ),
    };
    this.selectedId = id;
    this.commit();
    return { ...task, completedAt: null };
  }

  remove(id: string): void {
    this.state = {
      ...this.state,
      tasks: this.state.tasks.filter((task) => task.id !== id),
    };
    if (this.selectedId === id) this.selectedId = null;
    this.commit();
  }

  addMoon(taskId: string, title: string): Subtask | null {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const moon: Subtask = { id: createId(), title: trimmed, done: false };
    this.update(taskId, {
      subtasks: [...(this.byId(taskId)?.subtasks ?? []), moon],
    });
    return moon;
  }

  toggleMoon(taskId: string, moonId: string): void {
    const task = this.byId(taskId);
    if (!task) return;
    this.update(taskId, {
      subtasks: task.subtasks.map((moon) =>
        moon.id === moonId ? { ...moon, done: !moon.done } : moon,
      ),
    });
  }

  removeMoon(taskId: string, moonId: string): void {
    const task = this.byId(taskId);
    if (!task) return;
    this.update(taskId, {
      subtasks: task.subtasks.filter((moon) => moon.id !== moonId),
    });
  }

  patchSettings(patch: Partial<Settings>): void {
    this.state = {
      ...this.state,
      settings: { ...this.state.settings, ...patch },
    };
    this.commit();
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.emit();
  }

  cycle(delta: number): Task | null {
    const open = this.openTasks();
    if (open.length === 0) {
      this.select(null);
      return null;
    }
    const index = open.findIndex((task) => task.id === this.selectedId);
    const next = open[(index + delta + open.length * 8) % open.length];
    this.select(next.id);
    return next;
  }

  byId(id: string): Task | undefined {
    return this.state.tasks.find((task) => task.id === id);
  }

  private commit(): void {
    saveState(this.state, this.storage);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function sanitizeTask(raw: Partial<Task>, now: Date): Task {
  return createTask(
    {
      id: typeof raw.id === "string" ? raw.id : createId(),
      title: typeof raw.title === "string" ? raw.title : "",
      notes: typeof raw.notes === "string" ? raw.notes : "",
      category: isCategory(String(raw.category ?? "")) ? raw.category : "other",
      effort: Number(raw.effort) || 3,
      dueAt: typeof raw.dueAt === "number" ? raw.dueAt : null,
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now.getTime(),
      completedAt: typeof raw.completedAt === "number" ? raw.completedAt : null,
      subtasks: Array.isArray(raw.subtasks)
        ? raw.subtasks
            .filter((moon) => moon && typeof moon.title === "string")
            .map((moon) => ({
              id: typeof moon.id === "string" ? moon.id : createId(),
              title: moon.title,
              done: Boolean(moon.done),
            }))
        : [],
      orbitAngle: typeof raw.orbitAngle === "number" ? raw.orbitAngle : Math.random() * Math.PI * 2,
      spin: typeof raw.spin === "number" ? raw.spin : 0.5,
    },
    now,
  );
}

export function seedState(now: Date): AppState {
  const tasks = demoTasks(now);
  return {
    version: 1,
    tasks,
    settings: {
      ...DEFAULT_SETTINGS,
      reducedMotion:
        typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    },
    streak: { lastActiveDay: null, count: 0 },
  };
}

export function demoTasks(now: Date): Task[] {
  const at = (days: number, hours = 9, minutes = 0): number => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
  };

  const specs: Array<Partial<Task> & { title: string }> = [
    {
      title: "Pay the last invoice",
      category: "work",
      effort: 2,
      dueAt: at(-1, 17),
      notes: "It has already started to fall inward.",
    },
    {
      title: "Ship Orbit Todo README",
      category: "work",
      effort: 4,
      dueAt: at(0, 16),
      subtasks: [
        { id: createId(), title: "Screenshot the system", done: false },
        { id: createId(), title: "Write the pitch", done: true },
      ],
    },
    {
      title: "Reply to the design review",
      category: "work",
      effort: 3,
      dueAt: at(0, 18),
    },
    {
      title: "Interval run",
      category: "health",
      effort: 3,
      dueAt: at(1, 7),
    },
    {
      title: "Sketch a new shader",
      category: "creative",
      effort: 5,
      dueAt: at(weekdayOffset(now, 5), 21),
      notes: "Noise that feels like weather, not texture.",
      subtasks: [
        { id: createId(), title: "Color ramp", done: false },
        { id: createId(), title: "Volumetric dust", done: false },
      ],
    },
    {
      title: "Grocery run",
      category: "home",
      effort: 1,
      dueAt: at(weekdayOffset(now, 6), 11),
    },
    {
      title: "Call home",
      category: "personal",
      effort: 2,
      dueAt: at(weekdayOffset(now, 0), 16),
    },
    {
      title: "Read the rendering paper",
      category: "other",
      effort: 3,
      dueAt: null,
    },
    {
      title: "Plan the weekend orbit",
      category: "personal",
      effort: 2,
      dueAt: at(2, 12),
    },
    {
      title: "Refactor capture parser",
      category: "work",
      effort: 4,
      dueAt: at(4, 10),
    },
    {
      title: "Stretch + mobility",
      category: "health",
      effort: 1,
      dueAt: at(1, 21),
    },
    {
      title: "Hang the kitchen light",
      category: "home",
      effort: 3,
      dueAt: at(8, 15),
    },
    {
      title: "Write the comet poem",
      category: "creative",
      effort: 2,
      dueAt: at(10, 20),
    },
    {
      title: "File travel receipts",
      category: "work",
      effort: 2,
      completedAt: at(-2, 19),
    },
    {
      title: "Oil change",
      category: "home",
      effort: 3,
      completedAt: at(-5, 14),
    },
    {
      title: "Donate old cables",
      category: "other",
      effort: 1,
      completedAt: at(-8, 11),
    },
    {
      title: "Sunrise swim",
      category: "health",
      effort: 2,
      completedAt: at(-1, 7),
    },
  ];

  return specs.map((spec, index) =>
    createTask(
      {
        ...spec,
        orbitAngle: index * 2.399963,
        spin: 0.4 + ((index * 17) % 10) / 12,
      },
      now,
    ),
  );
}

export function weekdayOffset(now: Date, weekday: number): number {
  const current = now.getDay();
  const delta = (weekday - current + 7) % 7;
  return delta === 0 ? 7 : delta;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
