import { assertNever, type Category } from "../model/types";

export const SPACE = "#05060f";
export const SUN_CORE = "#fff4c8";
export const SUN_HOT = "#ffb347";
export const SUN_EDGE = "#ff6a3d";

export function categoryColor(category: Category): string {
  switch (category) {
    case "work":
      return "#7eb6ff";
    case "personal":
      return "#d4a1ff";
    case "health":
      return "#5ee2a0";
    case "creative":
      return "#ff8fab";
    case "home":
      return "#ffd166";
    case "other":
      return "#9aa7c2";
    default:
      return assertNever(category);
  }
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mix(hex: string, other: string, t: number): string {
  const a = rgb(hex);
  const b = rgb(other);
  const k = clamp(t, 0, 1);
  return `rgb(${Math.round(a.r + (b.r - a.r) * k)}, ${Math.round(a.g + (b.g - a.g) * k)}, ${Math.round(a.b + (b.b - a.b) * k)})`;
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, "#ffffff", amount);
}

export function darken(hex: string, amount: number): string {
  return mix(hex, "#05060f", amount);
}

function rgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
