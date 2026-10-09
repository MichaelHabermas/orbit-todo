import type { Task } from "./types";

export const SUN_RADIUS = 52;
export const MIN_ORBIT = 96;
export const MAX_ORBIT = 438;
export const BELT_RADIUS = 512;
export const HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

export interface Vec2 {
  x: number;
  y: number;
}

export function urgencyRadius(dueAt: number | null, now: number): number {
  if (dueAt === null) return MAX_ORBIT * 0.9;
  const remaining = dueAt - now;
  if (remaining <= 0) {
    const overdueDays = Math.min(1, -remaining / (3 * 86_400_000));
    return MIN_ORBIT - overdueDays * 22;
  }
  const t = Math.min(1, remaining / HORIZON_MS);
  const eased = t * t * (3 - 2 * t);
  return MIN_ORBIT + (MAX_ORBIT - MIN_ORBIT) * eased;
}

export function isOverdue(dueAt: number | null, now: number): boolean {
  return dueAt !== null && dueAt < now;
}

export function polar(radius: number, angle: number): Vec2 {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function planetSize(effort: number): number {
  return 8 + effort * 4.4;
}

export function orbitSpeed(radius: number, spin: number): number {
  const norm = (radius - MIN_ORBIT) / (MAX_ORBIT - MIN_ORBIT);
  const kepler = 0.12 + (1 - clamp(norm, 0, 1)) * 0.48;
  return kepler * (0.7 + spin * 0.6);
}

export function mostUrgent(tasks: Task[], now: number): Task | null {
  const open = tasks.filter((task) => task.completedAt === null);
  if (open.length === 0) return null;
  return open.reduce((best, task) =>
    urgencyRadius(task.dueAt, now) < urgencyRadius(best.dueAt, now) ? task : best,
  );
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function normalize(v: Vec2): Vec2 {
  const mag = length(v) || 1;
  return { x: v.x / mag, y: v.y / mag };
}

export function rayHitsDisk(origin: Vec2, velocity: Vec2, radius: number): boolean {
  const speed2 = dot(velocity, velocity);
  if (speed2 < 1) return false;
  const t = -dot(origin, velocity) / speed2;
  if (t < 0) return false;
  const closest = add(origin, scale(velocity, t));
  return length(closest) < radius;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
