import {
  BELT_RADIUS,
  MAX_ORBIT,
  MIN_ORBIT,
  SUN_RADIUS,
  add,
  isOverdue,
  length,
  orbitSpeed,
  planetSize,
  polar,
  rayHitsDisk,
  urgencyRadius,
  type Vec2,
} from "../model/orbit";
import type { Task } from "../model/types";
import {
  SPACE,
  SUN_CORE,
  SUN_EDGE,
  SUN_HOT,
  categoryColor,
  darken,
  lighten,
  mix,
  withAlpha,
} from "./colors";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  spark: boolean;
}

interface Shockwave {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

interface DragState {
  taskId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pointerId: number;
  lastAt: number;
}

export interface FrameInput {
  tasks: Task[];
  selectedId: string | null;
  hoverId: string | null;
  reducedMotion: boolean;
  focusMode: boolean;
  now: number;
}

const TAU = Math.PI * 2;

export class SolarSystem {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  camera = { x: 0, y: 0, zoom: 1, shake: 0 };
  drag: DragState | null = null;
  elapsed = 0;
  hoverWorld: Vec2 | null = null;
  private stars: HTMLCanvasElement | null = null;
  private particles: Particle[] = [];
  private waves: Shockwave[] = [];
  private width = 1;
  private height = 1;
  private dpr = 1;
  private starOffset = 0;
  private offering: { id: string; t: number; from: Vec2; color: string } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.stars = paintStarfield(Math.ceil(this.width), Math.ceil(this.height));
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const cx = this.width / 2 + this.camera.x;
    const cy = this.height / 2 + this.camera.y;
    return {
      x: (sx - cx) / this.camera.zoom,
      y: (sy - cy) / this.camera.zoom,
    };
  }

  worldToScreen(x: number, y: number): Vec2 {
    return {
      x: this.width / 2 + this.canvasX(x),
      y: this.height / 2 + this.canvasY(y),
    };
  }

  planetWorld(task: Task, now: number, reducedMotion: boolean): Vec2 {
    if (this.drag?.taskId === task.id) {
      return { x: this.drag.x, y: this.drag.y };
    }
    if (this.offering?.id === task.id) {
      return {
        x: this.offering.from.x * (1 - this.offering.t),
        y: this.offering.from.y * (1 - this.offering.t),
      };
    }
    if (task.completedAt !== null) {
      const radius = BELT_RADIUS + ((task.spin * 97) % 1) * 40;
      const angle = task.orbitAngle + (reducedMotion ? 0 : this.elapsed * 0.04 * task.spin);
      return polar(radius, angle);
    }
    const radius = urgencyRadius(task.dueAt, now) + (task.spin - 0.7) * 18;
    const speed = reducedMotion ? 0 : orbitSpeed(radius, task.spin);
    return polar(radius, task.orbitAngle + this.elapsed * speed);
  }

  hitTest(sx: number, sy: number, tasks: Task[], now: number, reducedMotion: boolean): Task | null {
    const world = this.screenToWorld(sx, sy);
    let best: Task | null = null;
    let bestDist = Infinity;
    for (const task of tasks) {
      const pos = this.planetWorld(task, now, reducedMotion);
      const size = planetSize(task.effort) + (task.completedAt ? 2 : 10) / this.camera.zoom;
      const dist = length({ x: world.x - pos.x, y: world.y - pos.y });
      if (dist < size + 6 / this.camera.zoom && dist < bestDist) {
        best = task;
        bestDist = dist;
      }
    }
    return best;
  }

  startDrag(task: Task, sx: number, sy: number, pointerId: number, now: number, reducedMotion: boolean): void {
    const pos = this.planetWorld(task, now, reducedMotion);
    this.drag = {
      taskId: task.id,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      pointerId,
      lastAt: performance.now(),
    };
    this.moveDrag(sx, sy);
  }

  moveDrag(sx: number, sy: number): void {
    if (!this.drag) return;
    const world = this.screenToWorld(sx, sy);
    const now = performance.now();
    const dt = Math.max(0.008, (now - this.drag.lastAt) / 1000);
    const nx = this.drag.x + (world.x - this.drag.x) * 0.55;
    const ny = this.drag.y + (world.y - this.drag.y) * 0.55;
    this.drag.vx = (nx - this.drag.x) / dt;
    this.drag.vy = (ny - this.drag.y) / dt;
    this.drag.x = nx;
    this.drag.y = ny;
    this.drag.lastAt = now;
  }

  endDrag(sunBoost = 1): { taskId: string; complete: boolean; x: number; y: number } | null {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return null;
    const pos = { x: drag.x, y: drag.y };
    const vel = { x: drag.vx, y: drag.vy };
    const speed = length(vel);
    const inSun = length(pos) < SUN_RADIUS * 1.85 * sunBoost;
    const flung = speed > 280 && rayHitsDisk(pos, vel, SUN_RADIUS * 1.55);
    return { taskId: drag.taskId, complete: inSun || flung, x: pos.x, y: pos.y };
  }

  offerToSun(task: Task, now: number, reducedMotion: boolean): void {
    const from = this.planetWorld(task, now, reducedMotion);
    this.offering = {
      id: task.id,
      t: reducedMotion ? 1 : 0,
      from,
      color: categoryColor(task.category),
    };
  }

  burst(x: number, y: number, color: string, reducedMotion: boolean): void {
    this.camera.shake = reducedMotion ? 0 : 10;
    this.waves.push({ x, y, life: 0.55, maxLife: 0.55 });
    if (reducedMotion) {
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0.4,
        maxLife: 0.4,
        size: 28,
        color,
        spark: false,
      });
      return;
    }
    const count = 90;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * TAU + Math.random() * 0.2;
      const speed = 40 + Math.random() * 340;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.7,
        maxLife: 1,
        size: 1.2 + Math.random() * 3.4,
        color: i % 3 === 0 ? SUN_CORE : i % 3 === 1 ? color : SUN_HOT,
        spark: i % 4 === 0,
      });
    }
    if (this.particles.length > 360) {
      this.particles.splice(0, this.particles.length - 360);
    }
  }

  offeringDone(): { id: string; color: string; x: number; y: number } | null {
    if (!this.offering || this.offering.t < 1) return null;
    const done = this.offering;
    this.offering = null;
    return { id: done.id, color: done.color, x: 0, y: 0 };
  }

  render(dt: number, input: FrameInput): void {
    this.elapsed += input.reducedMotion ? 0 : dt;
    if (this.offering && !input.reducedMotion) {
      this.offering.t = Math.min(1, this.offering.t + dt * 2.4);
    }
    this.stepCamera(dt, input);
    this.stepParticles(dt, input.reducedMotion);
    this.starOffset += input.reducedMotion ? 0 : dt * 3.5;

    const ctx = this.ctx;
    ctx.fillStyle = SPACE;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawBackdrop();

    ctx.save();
    ctx.translate(this.width / 2 + this.camera.x, this.height / 2 + this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    this.drawGuides();
    this.drawBelt(input);
    this.drawSun(input);
    this.drawPlanets(input);
    this.drawParticles();
    this.drawLabels(input);

    ctx.restore();
    this.drawVignette();
  }

  private canvasX(x: number): number {
    return x * this.camera.zoom;
  }

  private canvasY(y: number): number {
    return y * this.camera.zoom;
  }

  private stepCamera(dt: number, input: FrameInput): void {
    const fit = Math.min(this.width, this.height) / ((BELT_RADIUS + 36) * 2.12);
    let targetZoom = Math.max(0.42, Math.min(1.15, fit));
    let tx = 0;
    let ty = 0;
    if (input.focusMode) {
      const focus =
        input.tasks.find((task) => task.id === input.selectedId && task.completedAt === null) ??
        input.tasks
          .filter((task) => task.completedAt === null)
          .sort((a, b) => urgencyRadius(a.dueAt, input.now) - urgencyRadius(b.dueAt, input.now))[0];
      if (focus) {
        const pos = this.planetWorld(focus, input.now, input.reducedMotion);
        targetZoom = Math.min(2.35, Math.max(1.35, 210 / Math.max(80, urgencyRadius(focus.dueAt, input.now))));
        tx = -pos.x * targetZoom;
        ty = -pos.y * targetZoom;
      }
    }
    const k = 1 - Math.pow(0.001, dt);
    this.camera.zoom += (targetZoom - this.camera.zoom) * k;
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
    this.camera.shake *= Math.pow(0.0002, dt);
    if (this.camera.shake > 0.08) {
      this.camera.x += (Math.random() - 0.5) * this.camera.shake;
      this.camera.y += (Math.random() - 0.5) * this.camera.shake;
    }
  }

  private stepParticles(dt: number, reducedMotion: boolean): void {
    const next: Particle[] = [];
    for (const particle of this.particles) {
      particle.life -= dt;
      if (particle.life <= 0) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (!reducedMotion) {
        particle.vx *= 0.985;
        particle.vy *= 0.985;
        particle.vy += 18 * dt;
      }
      next.push(particle);
    }
    this.particles = next;
    this.waves = this.waves
      .map((wave) => ({ ...wave, life: wave.life - dt }))
      .filter((wave) => wave.life > 0);
  }

  private drawBackdrop(): void {
    const ctx = this.ctx;
    if (this.stars) {
      const ox = (this.starOffset * 0.15) % this.stars.width;
      ctx.drawImage(this.stars, -ox, 0);
      ctx.drawImage(this.stars, this.stars.width - ox, 0);
    }
    const nebula = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.48,
      20,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.55,
    );
    nebula.addColorStop(0, "rgba(255, 150, 70, 0.07)");
    nebula.addColorStop(0.35, "rgba(80, 40, 120, 0.08)");
    nebula.addColorStop(1, "rgba(5, 6, 15, 0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawGuides(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1 / this.camera.zoom;
    for (const radius of [MIN_ORBIT, (MIN_ORBIT + MAX_ORBIT) / 2, MAX_ORBIT]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
    }
    if (this.drag) {
      const pull = length({ x: this.drag.x, y: this.drag.y });
      ctx.strokeStyle = withAlpha(SUN_HOT, pull < SUN_RADIUS * 2.4 ? 0.45 : 0.16);
      ctx.setLineDash([6 / this.camera.zoom, 8 / this.camera.zoom]);
      ctx.beginPath();
      ctx.moveTo(this.drag.x, this.drag.y);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  private drawBelt(input: FrameInput): void {
    const ctx = this.ctx;
    const done = input.tasks.filter((task) => task.completedAt !== null);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 10 / this.camera.zoom;
    ctx.beginPath();
    ctx.arc(0, 0, BELT_RADIUS + 16, 0, TAU);
    ctx.stroke();
    for (const task of done) {
      const pos = this.planetWorld(task, input.now, input.reducedMotion);
      const size = 2.2 + task.effort * 0.55;
      ctx.fillStyle =
        task.id === input.hoverId || task.id === input.selectedId
          ? withAlpha(categoryColor(task.category), 0.85)
          : withAlpha(categoryColor(task.category), 0.28);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSun(input: FrameInput): void {
    const ctx = this.ctx;
    const pulse = input.reducedMotion ? 0 : Math.sin(this.elapsed * 1.6) * 6;
    const hot = this.drag && length({ x: this.drag.x, y: this.drag.y }) < SUN_RADIUS * 2.3;
    const radius = SUN_RADIUS + pulse + (hot ? 8 : 0);

    const corona = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 3.4);
    corona.addColorStop(0, withAlpha(SUN_CORE, 0.95));
    corona.addColorStop(0.18, withAlpha(SUN_HOT, 0.85));
    corona.addColorStop(0.42, withAlpha(SUN_EDGE, 0.28));
    corona.addColorStop(1, "rgba(255, 90, 40, 0)");
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 3.4, 0, TAU);
    ctx.fill();

    const core = ctx.createRadialGradient(-radius * 0.18, -radius * 0.2, radius * 0.1, 0, 0, radius);
    core.addColorStop(0, "#fff7d6");
    core.addColorStop(0.45, SUN_HOT);
    core.addColorStop(1, darken(SUN_EDGE, 0.15));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();

    ctx.fillStyle = withAlpha("#fff", 0.55);
    ctx.beginPath();
    ctx.ellipse(-radius * 0.22, -radius * 0.28, radius * 0.28, radius * 0.16, -0.5, 0, TAU);
    ctx.fill();
  }

  private drawPlanets(input: FrameInput): void {
    const open = input.tasks.filter((task) => task.completedAt === null);
    const ordered = [...open].sort(
      (a, b) =>
        this.planetWorld(a, input.now, input.reducedMotion).y -
        this.planetWorld(b, input.now, input.reducedMotion).y,
    );
    for (const task of ordered) {
      if (this.offering?.id === task.id && this.offering.t >= 1) continue;
      this.drawPlanet(task, input);
    }
  }

  private drawPlanet(task: Task, input: FrameInput): void {
    const ctx = this.ctx;
    const pos = this.planetWorld(task, input.now, input.reducedMotion);
    const r = planetSize(task.effort);
    const color = categoryColor(task.category);
    const overdue = isOverdue(task.dueAt, input.now);
    const selected = task.id === input.selectedId;
    const hovered = task.id === input.hoverId;
    const focusDim =
      input.focusMode && input.selectedId && task.id !== input.selectedId ? 0.28 : 1;

    ctx.save();
    ctx.globalAlpha = focusDim;

    if (overdue) {
      const throb = input.reducedMotion ? 0.55 : 0.35 + Math.sin(this.elapsed * 6) * 0.2;
      const glow = ctx.createRadialGradient(pos.x, pos.y, r, pos.x, pos.y, r * 3.4);
      glow.addColorStop(0, `rgba(255, 72, 56, ${throb})`);
      glow.addColorStop(1, "rgba(255, 40, 20, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * 3.4, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = withAlpha(color, selected || hovered ? 0.28 : 0.14);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * 2.1, 0, TAU);
      ctx.fill();
    }

    if (task.effort >= 5) {
      ctx.strokeStyle = withAlpha(lighten(color, 0.3), 0.55);
      ctx.lineWidth = 2 / this.camera.zoom;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, r * 1.85, r * 0.55, 0.35, 0, TAU);
      ctx.stroke();
    }

    const body = ctx.createRadialGradient(
      pos.x - r * 0.35,
      pos.y - r * 0.4,
      r * 0.12,
      pos.x,
      pos.y,
      r,
    );
    body.addColorStop(0, lighten(color, 0.5));
    body.addColorStop(0.45, color);
    body.addColorStop(1, darken(overdue ? mix(color, "#ff3b30", 0.55) : color, 0.55));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, TAU);
    ctx.fill();

    ctx.fillStyle = withAlpha("#071018", 0.22);
    ctx.beginPath();
    ctx.arc(pos.x + r * 0.18, pos.y + r * 0.12, r * 0.55, 0, TAU);
    ctx.fill();

    ctx.fillStyle = withAlpha("#fff", 0.35);
    ctx.beginPath();
    ctx.ellipse(pos.x - r * 0.28, pos.y - r * 0.32, r * 0.28, r * 0.14, -0.6, 0, TAU);
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = withAlpha("#fff7d6", 0.8);
      ctx.lineWidth = 1.4 / this.camera.zoom;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + 7 / this.camera.zoom, 0, TAU);
      ctx.stroke();
    }

    this.drawMoons(task, pos, r, input);
    ctx.restore();
  }

  private drawMoons(task: Task, pos: Vec2, r: number, input: FrameInput): void {
    if (task.subtasks.length === 0) return;
    const ctx = this.ctx;
    task.subtasks.forEach((moon, index) => {
      const radius = r + 10 + index * 5;
      const angle = input.reducedMotion
        ? task.orbitAngle + index
        : this.elapsed * (0.7 + index * 0.35) + task.orbitAngle + index;
      const p = add(pos, polar(radius, angle));
      ctx.fillStyle = moon.done ? "rgba(255,255,255,0.22)" : "rgba(236, 242, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, moon.done ? 1.6 : 2.3, 0, TAU);
      ctx.fill();
    });
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const wave of this.waves) {
      const t = 1 - wave.life / wave.maxLife;
      ctx.strokeStyle = `rgba(255, 210, 140, ${1 - t})`;
      ctx.lineWidth = 3 / this.camera.zoom;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, 12 + t * 90, 0, TAU);
      ctx.stroke();
    }
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / (particle.maxLife || particle.life));
      ctx.fillStyle = withAlpha(particle.color, alpha);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      ctx.fill();
      if (particle.spark) {
        ctx.strokeStyle = withAlpha("#fff", alpha * 0.8);
        ctx.lineWidth = 0.8 / this.camera.zoom;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 0.04, particle.y - particle.vy * 0.04);
        ctx.stroke();
      }
    }
  }

  private drawLabels(input: FrameInput): void {
    const ctx = this.ctx;
    const open = input.tasks.filter((task) => task.completedAt === null);
    const show = new Set<string>();
    if (input.selectedId) show.add(input.selectedId);
    if (input.hoverId) show.add(input.hoverId);
    for (const task of open) {
      if (isOverdue(task.dueAt, input.now)) show.add(task.id);
      const radius = urgencyRadius(task.dueAt, input.now);
      if (radius > (MIN_ORBIT + MAX_ORBIT) * 0.42 || open.length <= 8) show.add(task.id);
    }

    ctx.font = `${12 / this.camera.zoom}px Outfit, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const task of input.tasks) {
      if (!show.has(task.id) && task.id !== input.hoverId) continue;
      const pos = this.planetWorld(task, input.now, input.reducedMotion);
      const r = task.completedAt ? 4 : planetSize(task.effort);
      const mag = Math.hypot(pos.x, pos.y) || 1;
      const label = task.title.length > 26 ? `${task.title.slice(0, 24)}…` : task.title;
      const width = ctx.measureText(label).width;
      const pad = 6 / this.camera.zoom;
      const lift = r + 14 / this.camera.zoom;
      const lx = pos.x + (pos.x / mag) * lift;
      const ly = pos.y + (pos.y / mag) * lift;
      ctx.fillStyle = "rgba(6, 8, 18, 0.72)";
      roundRect(
        ctx,
        lx - width / 2 - pad,
        ly - 8 / this.camera.zoom,
        width + pad * 2,
        16 / this.camera.zoom,
        8 / this.camera.zoom,
      );
      ctx.fill();
      ctx.fillStyle = task.completedAt ? "rgba(255,255,255,0.55)" : "#f4f1ea";
      ctx.fillText(label, lx, ly);
    }
  }

  private drawVignette(): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.25,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.72,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.46)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}

function paintStarfield(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = SPACE;
  ctx.fillRect(0, 0, width, height);
  const count = Math.floor((width * height) / 2800);
  for (let i = 0; i < count; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() ** 2 * 1.4;
    ctx.fillStyle = `rgba(255,255,255,${0.18 + Math.random() * 0.7})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 4; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 80 + Math.random() * 90);
    g.addColorStop(0, "rgba(120, 90, 180, 0.09)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 160, y - 160, 320, 320);
  }
  return canvas;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

