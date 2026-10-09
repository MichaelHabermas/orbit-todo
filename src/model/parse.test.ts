import { describe, expect, it } from "vitest";
import { extractDate, parseTaskInput } from "./parse";

const NOW = new Date(2026, 9, 9, 12, 0, 0, 0); // Friday Oct 9 2026, noon

describe("parseTaskInput", () => {
  it("parses tomorrow 5pm with a category and effort", () => {
    const parsed = parseTaskInput("Ship landing page tomorrow 5pm #work !4", NOW);
    expect(parsed.title).toBe("Ship landing page");
    expect(parsed.category).toBe("work");
    expect(parsed.effort).toBe(4);
    expect(parsed.dueAt).not.toBeNull();
    const due = new Date(parsed.dueAt ?? 0);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(9);
    expect(due.getDate()).toBe(10);
    expect(due.getHours()).toBe(17);
    expect(due.getMinutes()).toBe(0);
  });

  it("parses a weekday token like fri", () => {
    const parsed = parseTaskInput("Demo the orbit fri 5pm", NOW);
    expect(parsed.title).toBe("Demo the orbit");
    const due = new Date(parsed.dueAt ?? 0);
    expect(due.getDay()).toBe(5);
    expect(due.getDate()).toBe(9);
    expect(due.getHours()).toBe(17);
  });

  it("rolls a past Friday without a time to next week", () => {
    const parsed = parseTaskInput("Write notes fri", NOW);
    const due = new Date(parsed.dueAt ?? 0);
    expect(due.getDay()).toBe(5);
    expect(due.getDate()).toBe(16);
    expect(due.getHours()).toBe(9);
  });

  it("parses today, tonight, and in 3 days", () => {
    const today = parseTaskInput("Standup today 4pm", NOW);
    expect(new Date(today.dueAt ?? 0).getDate()).toBe(9);
    expect(new Date(today.dueAt ?? 0).getHours()).toBe(16);

    const tonight = parseTaskInput("Lights out tonight", NOW);
    expect(new Date(tonight.dueAt ?? 0).getHours()).toBe(20);

    const later = parseTaskInput("Garden in 3 days", NOW);
    const due = new Date(later.dueAt ?? 0);
    expect(due.getDate()).toBe(12);
    expect(due.getHours()).toBe(9);
  });

  it("parses next monday and ISO dates", () => {
    const monday = parseTaskInput("Kickoff next monday 10am #work", NOW);
    const due = new Date(monday.dueAt ?? 0);
    expect(due.getDay()).toBe(1);
    expect(due.getDate()).toBe(12);
    expect(due.getHours()).toBe(10);
    expect(monday.category).toBe("work");

    const iso = parseTaskInput("Tax day 2026-10-15 14:30", NOW);
    const isoDue = new Date(iso.dueAt ?? 0);
    expect(isoDue.getDate()).toBe(15);
    expect(isoDue.getHours()).toBe(14);
    expect(isoDue.getMinutes()).toBe(30);
  });

  it("parses month-day phrases and time-only future times", () => {
    const month = parseTaskInput("Birthday oct 15", NOW);
    expect(new Date(month.dueAt ?? 0).getMonth()).toBe(9);
    expect(new Date(month.dueAt ?? 0).getDate()).toBe(15);

    const time = parseTaskInput("Call 5pm", NOW);
    expect(time.title).toBe("Call");
    expect(new Date(time.dueAt ?? 0).getHours()).toBe(17);
    expect(new Date(time.dueAt ?? 0).getDate()).toBe(9);
  });

  it("leaves a title-only capture without a due date", () => {
    const parsed = parseTaskInput("Learn WebGL", NOW);
    expect(parsed.title).toBe("Learn WebGL");
    expect(parsed.dueAt).toBeNull();
    expect(parsed.category).toBe("personal");
    expect(parsed.effort).toBe(3);
  });

  it("does not treat a bare number as a time", () => {
    const parsed = parseTaskInput("Read chapter 5", NOW);
    expect(parsed.title).toBe("Read chapter 5");
    expect(parsed.dueAt).toBeNull();
  });
});

describe("extractDate", () => {
  it("strips the date phrase from the remaining title", () => {
    const result = extractDate("Buy flowers tomorrow 5pm", NOW);
    expect(result.rest.trim()).toBe("Buy flowers");
    expect(result.dueAt).not.toBeNull();
  });
});
