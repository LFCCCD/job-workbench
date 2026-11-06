import path from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: path.resolve("src/main/index.ts"),
          "collector-worker": path.resolve(
            "src/main/collector-worker.ts",
          ),
          "ai-worker": path.resolve("src/main/ai-worker.ts"),
        },
      },
    },
    resolve: {
      alias: {
        "@shared": path.resolve("src/shared"),
        "@main": path.resolve("src/main"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
    resolve: {
      alias: {
        "@shared": path.resolve("src/shared"),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": path.resolve("src/renderer/src"),
        "@shared": path.resolve("src/shared"),
      },
    },
    plugins: [react()],
  },
});
