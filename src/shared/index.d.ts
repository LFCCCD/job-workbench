import type { JobWorkbenchApi } from "./contracts";

declare global {
  interface Window {
    jobWorkbench: JobWorkbenchApi;
  }
}

export {};
