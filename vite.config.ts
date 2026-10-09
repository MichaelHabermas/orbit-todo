import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/orbit-todo/" : "/",
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
