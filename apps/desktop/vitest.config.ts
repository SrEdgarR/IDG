import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import desktopViteConfig from "./vite.config.ts";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const runningInCi = process.env.CI === "true";

export default mergeConfig(
  desktopViteConfig,
  defineConfig({
    root: repositoryRoot,
    test: {
      include: [
        "apps/desktop/src/**/*.test.ts",
        "apps/desktop/src/**/*.test.tsx",
        "apps/extension/src/**/*.test.ts",
        "apps/extension/src/**/*.test.tsx",
      ],
      exclude: [
        ...configDefaults.exclude,
        "scripts/**",
        "apps/**/src-tauri/**",
        "**/e2e/**",
        "**/playwright/**",
      ],
      environment: "node",
      reporters: runningInCi
        ? [...configDefaults.reporters, "junit"]
        : configDefaults.reporters,
      outputFile: runningInCi
        ? {
            junit: fileURLToPath(
              new URL("../../artifacts/test-results/typescript-unit.xml", import.meta.url),
            ),
          }
        : undefined,
      coverage: {
        provider: "v8",
        include: [
          "apps/desktop/src/**/*.{ts,tsx}",
          "apps/extension/src/**/*.{ts,tsx}",
        ],
        // The development gallery contains fixture-only demos and is excluded from the production bundle.
        exclude: [
          "**/*.d.ts",
          "**/*.test.ts",
          "**/*.test.tsx",
          "apps/desktop/src/gallery/**",
        ],
        reportsDirectory: fileURLToPath(
          new URL("../../coverage/typescript", import.meta.url),
        ),
        reporter: ["text", "html", "lcov", "json-summary"],
        reportOnFailure: true,
        thresholds: {
          lines: 15,
          functions: 8,
          branches: 15,
          "apps/extension/src/worker.ts": {
            lines: 65,
            functions: 55,
            branches: 45,
            perFile: true,
          },
          "apps/extension/src/bridge.ts": {
            lines: 90,
            functions: 55,
            branches: 80,
            perFile: true,
          },
          "apps/desktop/src/import-parser.ts": {
            lines: 80,
            functions: 90,
            branches: 70,
            perFile: true,
          },
          "apps/desktop/src/Dialogs.tsx": {
            lines: 45,
            functions: 25,
            branches: 50,
            perFile: true,
          },
          "apps/desktop/src/DownloadList.tsx": {
            lines: 45,
            functions: 50,
            branches: 35,
            perFile: true,
          },
        },
      },
    },
  }),
);
