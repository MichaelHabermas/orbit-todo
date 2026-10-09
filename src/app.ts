import { mostUrgent } from "./model/orbit";
import { OrbitStore } from "./model/store";
import type { Task } from "./model/types";
import { Soundscape } from "./render/audio";
import { categoryColor } from "./render/colors";
import { SolarSystem } from "./render/engine";
import { Overlay } from "./ui/overlay";

export function boot(): void {
  const canvas = document.getElementById("sky");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas #sky is required");
  }

  const storage = window.localStorage;
  const store = new OrbitStore(storage);
  const engine = new SolarSystem(canvas);
  const sound = new Soundscape();
  sound.setMuted(store.state.settings.muted);

  let hoverId: string | null = null;
  let last = performance.now();

  function burn(taskId: string, color: string, x: number, y: number): void {
    const task = store.byId(taskId);
    if (!task || task.completedAt !== null) return;
    engine.burst(x, y, color, store.state.settings.reducedMotion);
    store.complete(taskId, new Date());
    sound.complete();
    overlay.announce(`Burned ${task.title}. It joins the asteroid belt.`);
  }

  function offer(task: Task): void {
    if (task.completedAt !== null) return;
    sound.resume();
    engine.offerToSun(task, Date.now(), store.state.settings.reducedMotion);
    overlay.announce(`Offering ${task.title} to the sun`);
  }

  const overlay = new Overlay(store, offer);
  store.subscribe(() => {
    sound.setMuted(store.state.settings.muted);
    overlay.sync();
  });
  overlay.sync();

  window.addEventListener("resize", () => engine.resize());

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    sound.resume();
    overlay.closeCapture();
    overlay.toggleHelp(false);
    const now = Date.now();
    const hit = engine.hitTest(
      event.clientX,
      event.clientY,
      store.state.tasks,
      now,
      store.state.settings.reducedMotion,
    );
    if (!hit) {
      store.select(null);
      return;
    }
    store.select(hit.id);
    if (hit.completedAt !== null) return;
    canvas.setPointerCapture(event.pointerId);
    engine.startDrag(hit, event.clientX, event.clientY, event.pointerId, now, store.state.settings.reducedMotion);
    canvas.classList.add("dragging");
    sound.whoosh();
  });

  canvas.addEventListener("pointermove", (event) => {
    const now = Date.now();
    if (engine.drag) {
      engine.moveDrag(event.clientX, event.clientY);
      return;
    }
    const hit = engine.hitTest(
      event.clientX,
      event.clientY,
      store.state.tasks,
      now,
      store.state.settings.reducedMotion,
    );
    hoverId = hit?.id ?? null;
    canvas.style.cursor = hit ? "pointer" : "grab";
  });

  const finishPointer = (event: PointerEvent): void => {
    if (!engine.drag || engine.drag.pointerId !== event.pointerId) return;
    canvas.classList.remove("dragging");
    const result = engine.endDrag();
    if (!result) return;
    if (result.complete) {
      const task = store.byId(result.taskId);
      if (task) burn(task.id, categoryColor(task.category), result.x, result.y);
    }
  };

  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const typing = overlay.typingInField();

    if (event.key === "Escape") {
      overlay.closeCapture();
      overlay.toggleHelp(false);
      store.select(null);
      store.patchSettings({ listView: false, focusMode: false });
      return;
    }

    if (overlay.captureOpen() || typing) return;

    switch (event.key) {
      case "n":
      case "N":
      case "/":
        event.preventDefault();
        overlay.openCapture();
        return;
      case "ArrowLeft":
      case "[":
        event.preventDefault();
        store.cycle(-1);
        sound.select();
        return;
      case "ArrowRight":
      case "]":
        event.preventDefault();
        store.cycle(1);
        sound.select();
        return;
      case "Enter":
      case " ": {
        const selected = store.selected();
        if (selected && selected.completedAt === null) {
          event.preventDefault();
          offer(selected);
        }
        return;
      }
      case "f":
      case "F":
        overlay.toggleFocus();
        return;
      case "l":
      case "L":
        overlay.toggleList();
        return;
      case "m":
      case "M":
        store.patchSettings({ muted: !store.state.settings.muted });
        return;
      case "r":
      case "R":
        store.patchSettings({ reducedMotion: !store.state.settings.reducedMotion });
        return;
      case "?":
        overlay.toggleHelp();
        return;
      default:
        break;
    }

    if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key) && !overlay.overlayOpen()) {
      event.preventDefault();
      overlay.openCapture(event.key);
    }
  });

  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const clock = Date.now();
    const done = engine.offeringDone();
    if (done) burn(done.id, done.color, done.x, done.y);

    if (store.state.settings.focusMode && !store.selected()) {
      const urgent = mostUrgent(store.openTasks(), clock);
      if (urgent) store.select(urgent.id);
    }

    engine.render(dt, {
      tasks: store.state.tasks,
      selectedId: store.selectedId,
      hoverId,
      reducedMotion: store.state.settings.reducedMotion,
      focusMode: store.state.settings.focusMode,
      now: clock,
    });
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
