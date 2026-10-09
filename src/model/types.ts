export const CATEGORIES = [
  "work",
  "personal",
  "health",
  "creative",
  "home",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const EFFORT_MIN = 1;
export const EFFORT_MAX = 5;

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  category: Category;
  effort: number;
  dueAt: number | null;
  createdAt: number;
  completedAt: number | null;
  subtasks: Subtask[];
  orbitAngle: number;
  spin: number;
}

export interface Settings {
  muted: boolean;
  reducedMotion: boolean;
  listView: boolean;
  focusMode: boolean;
}

export interface Streak {
  lastActiveDay: string | null;
  count: number;
}

export interface AppState {
  version: 1;
  tasks: Task[];
  settings: Settings;
  streak: Streak;
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${String(value)}`);
}

export function categoryLabel(category: Category): string {
  switch (category) {
    case "work":
      return "Work";
    case "personal":
      return "Personal";
    case "health":
      return "Health";
    case "creative":
      return "Creative";
    case "home":
      return "Home";
    case "other":
      return "Drift";
    default:
      return assertNever(category);
  }
}
