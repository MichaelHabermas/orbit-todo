import { mostUrgent } from "../model/orbit";
import { formatDue, parseTaskInput } from "../model/parse";
import { OrbitStore } from "../model/store";
import { CATEGORIES, categoryLabel, type Task } from "../model/types";
import { categoryColor } from "../render/colors";

export type ListTab = "open" | "belt";

export class Overlay {
  listTab: ListTab = "open";
  private helpOpen = false;
  private readonly live = must("live");
  private readonly streak = must("streak");
  private readonly capture = must<HTMLFormElement>("capture");
  private readonly captureInput = must<HTMLInputElement>("capture-input");
  private readonly capturePreview = must("capture-preview");
  private readonly inspector = must("inspector");
  private readonly listView = must("list-view");
  private readonly help = must("help");
  private readonly moonList = must("moon-list");
  private readonly taskList = must("task-list");
  private readonly categoryPills = must("field-category");
  private readonly titleField = must<HTMLInputElement>("field-title");
  private readonly dueField = must<HTMLInputElement>("field-due");
  private readonly dueReadout = must("field-due-readout");
  private readonly effortField = must<HTMLInputElement>("field-effort");
  private readonly notesField = must<HTMLTextAreaElement>("field-notes");
  private readonly completeBtn = must<HTMLButtonElement>("inspector-complete");
  private readonly restoreBtn = must<HTMLButtonElement>("inspector-restore");
  private readonly focusBtn = must<HTMLButtonElement>("btn-focus");
  private readonly listBtn = must<HTMLButtonElement>("btn-list");
  private readonly muteBtn = must<HTMLButtonElement>("btn-mute");
  private readonly motionBtn = must<HTMLButtonElement>("btn-motion");
  private syncingInspector = false;

  constructor(
    private readonly store: OrbitStore,
    private readonly onComplete: (task: Task) => void,
  ) {
    this.buildCategoryPills();
    this.bind();
  }

  captureOpen(): boolean {
    return !this.capture.hidden;
  }

  overlayOpen(): boolean {
    return this.captureOpen() || this.helpOpen || this.typingInField();
  }

  typingInField(): boolean {
    const el = document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  }

  announce(message: string): void {
    this.live.textContent = message;
  }

  openCapture(seed = ""): void {
    this.capture.hidden = false;
    this.captureInput.value = seed;
    this.updateCapturePreview();
    this.captureInput.focus();
    this.captureInput.setSelectionRange(this.captureInput.value.length, this.captureInput.value.length);
  }

  closeCapture(): void {
    this.capture.hidden = true;
    this.captureInput.value = "";
  }

  toggleHelp(force?: boolean): void {
    this.helpOpen = force ?? this.help.hidden;
    this.help.hidden = !this.helpOpen;
  }

  sync(): void {
    const { settings, streak, tasks } = this.store.state;
    const openCount = tasks.filter((task) => task.completedAt === null).length;
    this.streak.textContent =
      streak.count > 0
        ? `✦ ${streak.count}-day stellar streak · ${openCount} worlds in orbit`
        : `Ignite a streak by burning a task today · ${openCount} worlds in orbit`;
    this.focusBtn.setAttribute("aria-pressed", String(settings.focusMode));
    this.listBtn.setAttribute("aria-pressed", String(settings.listView));
    this.muteBtn.setAttribute("aria-pressed", String(settings.muted));
    this.muteBtn.textContent = settings.muted ? "Muted" : "Sound";
    this.motionBtn.setAttribute("aria-pressed", String(settings.reducedMotion));
    this.motionBtn.textContent = settings.reducedMotion ? "Calm" : "Motion";
    document.body.classList.toggle("reduced-motion", settings.reducedMotion);
    this.listView.hidden = !settings.listView;
    this.renderList();
    this.renderInspector();
  }

  private bind(): void {
    this.capture.addEventListener("submit", (event) => {
      event.preventDefault();
      const added = this.store.addFromCapture(this.captureInput.value);
      if (!added) {
        this.capturePreview.textContent = "Name the planet, then add a date if you want.";
        return;
      }
      this.closeCapture();
      this.announce(`Launched ${added.title}`);
    });
    this.captureInput.addEventListener("input", () => this.updateCapturePreview());
    this.capture.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeCapture();
      }
    });

    must("btn-focus").addEventListener("click", () => this.toggleFocus());
    must("btn-list").addEventListener("click", () => this.toggleList());
    must("btn-mute").addEventListener("click", () =>
      this.store.patchSettings({ muted: !this.store.state.settings.muted }),
    );
    must("btn-motion").addEventListener("click", () =>
      this.store.patchSettings({ reducedMotion: !this.store.state.settings.reducedMotion }),
    );
    must("btn-help").addEventListener("click", () => this.toggleHelp());
    must("help-close").addEventListener("click", () => this.toggleHelp(false));
    must("btn-capture-mobile").addEventListener("click", () => this.openCapture());
    must("inspector-close").addEventListener("click", () => this.store.select(null));
    must("list-close").addEventListener("click", () => this.store.patchSettings({ listView: false }));
    must("tab-open").addEventListener("click", () => {
      this.listTab = "open";
      this.renderList();
    });
    must("tab-belt").addEventListener("click", () => {
      this.listTab = "belt";
      this.renderList();
    });
    must("inspector-complete").addEventListener("click", () => {
      const task = this.store.selected();
      if (task) this.onComplete(task);
    });
    must("inspector-restore").addEventListener("click", () => {
      const task = this.store.selected();
      if (task) {
        this.store.restore(task.id);
        this.announce(`Returned ${task.title} to orbit`);
      }
    });
    must("inspector-delete").addEventListener("click", () => {
      const task = this.store.selected();
      if (!task) return;
      this.store.remove(task.id);
      this.announce(`Deleted ${task.title}`);
    });
    must("moon-add").addEventListener("click", () => this.addMoon());
    must<HTMLInputElement>("moon-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.addMoon();
      }
    });

    this.titleField.addEventListener("input", () => this.patchSelected({ title: this.titleField.value }));
    this.notesField.addEventListener("input", () => this.patchSelected({ notes: this.notesField.value }));
    this.effortField.addEventListener("input", () =>
      this.patchSelected({ effort: Number(this.effortField.value) }),
    );
    this.dueField.addEventListener("change", () => this.applyDueField());
    this.dueField.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.applyDueField();
      }
    });
  }

  toggleFocus(): void {
    const next = !this.store.state.settings.focusMode;
    this.store.patchSettings({ focusMode: next });
    if (next) {
      const urgent = mostUrgent(this.store.openTasks(), Date.now());
      if (urgent) this.store.select(urgent.id);
    }
  }

  toggleList(): void {
    this.store.patchSettings({ listView: !this.store.state.settings.listView });
  }

  private applyDueField(): void {
    const task = this.store.selected();
    if (!task) return;
    const raw = this.dueField.value.trim();
    if (!raw) {
      this.patchSelected({ dueAt: null });
      return;
    }
    const parsed = parseTaskInput(raw);
    this.patchSelected({ dueAt: parsed.dueAt });
  }

  private addMoon(): void {
    const task = this.store.selected();
    const input = must<HTMLInputElement>("moon-input");
    if (!task) return;
    this.store.addMoon(task.id, input.value);
    input.value = "";
  }

  private patchSelected(patch: Partial<Task>): void {
    if (this.syncingInspector) return;
    const task = this.store.selected();
    if (!task) return;
    this.store.update(task.id, patch);
  }

  private updateCapturePreview(): void {
    const parsed = parseTaskInput(this.captureInput.value);
    if (!this.captureInput.value.trim()) {
      this.capturePreview.textContent =
        "Try tomorrow 5pm, fri, #work, !3 — Enter launches, Esc cancels.";
      return;
    }
    const bits = [
      parsed.title || "Needs a name",
      parsed.dueLabel ?? "no due date",
      categoryLabel(parsed.category),
      `mass ${parsed.effort}`,
    ];
    this.capturePreview.textContent = bits.join(" · ");
  }

  private buildCategoryPills(): void {
    this.categoryPills.replaceChildren();
    for (const category of CATEGORIES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = categoryLabel(category);
      button.style.setProperty("--pill", categoryColor(category));
      button.addEventListener("click", () => this.patchSelected({ category }));
      button.dataset.category = category;
      this.categoryPills.append(button);
    }
  }

  private renderInspector(): void {
    const task = this.store.selected();
    this.inspector.hidden = !task;
    if (!task) return;
    this.syncingInspector = true;
    if (document.activeElement !== this.titleField) this.titleField.value = task.title;
    if (document.activeElement !== this.notesField) this.notesField.value = task.notes;
    if (document.activeElement !== this.effortField) this.effortField.value = String(task.effort);
    if (document.activeElement !== this.dueField) {
      this.dueField.value = "";
    }
    this.dueReadout.textContent = formatDue(task.dueAt);
    this.completeBtn.hidden = task.completedAt !== null;
    this.restoreBtn.hidden = task.completedAt === null;
    for (const button of this.categoryPills.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.category === task.category));
    }
    this.moonList.replaceChildren();
    for (const moon of task.subtasks) {
      const item = document.createElement("li");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = moon.done;
      check.addEventListener("change", () => this.store.toggleMoon(task.id, moon.id));
      const label = document.createElement("span");
      label.textContent = moon.title;
      if (moon.done) label.style.opacity = "0.5";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "✕";
      remove.className = "icon-btn";
      remove.addEventListener("click", () => this.store.removeMoon(task.id, moon.id));
      item.append(check, label, remove);
      this.moonList.append(item);
    }
    this.syncingInspector = false;
  }

  private renderList(): void {
    const open = this.listTab === "open";
    must("tab-open").setAttribute("aria-selected", String(open));
    must("tab-belt").setAttribute("aria-selected", String(!open));
    const tasks = open ? this.store.openTasks() : this.store.completedTasks();
    this.taskList.replaceChildren();
    if (tasks.length === 0) {
      const empty = document.createElement("li");
      empty.className = "task-meta";
      empty.textContent = open ? "No worlds in orbit. Press N." : "The belt is empty. Finish something.";
      this.taskList.append(empty);
      return;
    }
    for (const task of tasks) {
      this.taskList.append(this.row(task));
    }
  }

  private row(task: Task): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "task-row";
    item.tabIndex = 0;
    const swatch = document.createElement("span");
    swatch.style.cssText = `width:10px;height:10px;border-radius:50%;margin-top:6px;background:${categoryColor(task.category)}`;
    const title = document.createElement("button");
    title.type = "button";
    title.className = "row-title";
    title.innerHTML = `<strong>${escapeHtml(task.title)}</strong><span class="task-meta">${escapeHtml(formatDue(task.dueAt))} · ${escapeHtml(categoryLabel(task.category))} · mass ${task.effort}</span>`;
    title.addEventListener("click", () => this.store.select(task.id));
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const action = document.createElement("button");
    action.type = "button";
    if (task.completedAt) {
      action.textContent = "Restore";
      action.addEventListener("click", () => this.store.restore(task.id));
    } else {
      action.textContent = "Burn";
      action.addEventListener("click", () => this.onComplete(task));
    }
    actions.append(action);
    item.append(swatch, title, actions);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.store.select(task.id);
      if (event.key === " ") {
        event.preventDefault();
        if (task.completedAt) this.store.restore(task.id);
        else this.onComplete(task);
      }
    });
    return item;
  }
}

function must<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
