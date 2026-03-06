import { useRef } from "react";

import { mockBackend } from "../lib/mockBackend";
import type { BackendBridge, BackendEvent, ProgressSnapshot, SavedChain } from "../types";

type NativeBackend = NonNullable<NonNullable<Window["__JUCE__"]>["backend"]>;

const emptyProgress: ProgressSnapshot = {
  running: false,
  cancelled: false,
  currentJobId: "",
  currentFile: "",
  currentPercent: 0,
  totalJobs: 0,
  completedJobs: 0,
  jobs: [],
};

function getNativeFunction(backend: NativeBackend, name: string) {
  const provided = backend.getNativeFunction?.(name);

  if (typeof provided === "function") {
    return provided;
  }

  const lowLevel = backend[name];
  return typeof lowLevel === "function" ? (lowLevel as (...args: unknown[]) => Promise<unknown>) : undefined;
}

function createNativeBridge(backend: NativeBackend): BackendBridge {
  const call = async <T,>(name: string, ...args: unknown[]) => {
    const nativeFunction = getNativeFunction(backend, name);

    if (!nativeFunction) {
      throw new Error(`Native function ${name} is not available.`);
    }

    return (await nativeFunction(...args)) as T;
  };

  return {
    isNative: true,
    scanPlugins: (folderPath) => call("scanPlugins", folderPath),
    getPluginList: () => call("getPluginList"),
    loadPresets: (pluginId) => call("loadPresets", pluginId),
    loadPresetFile: (pluginId, filePath) => call("loadPresetFile", pluginId, filePath),
    loadChain: (chainJSON) => call("loadChain", chainJSON),
    saveChain: (name, chainJSON) => call("saveChain", name, chainJSON),
    getSavedChains: async () => {
      const chains = await call<SavedChain[]>("getSavedChains");
      return chains ?? [];
    },
    addBatchJob: (inputPath, outputPath) => call("addBatchJob", inputPath, outputPath),
    startBatch: () => call("startBatch"),
    getProgress: async () => (await call<ProgressSnapshot>("getProgress")) ?? emptyProgress,
    cancelBatch: () => call("cancelBatch"),
    addEventListener(eventId, callback) {
      return backend.addEventListener?.(eventId, (payload) => callback(payload as BackendEvent)) ?? null;
    },
    removeEventListener(token) {
      if (token !== null) {
        backend.removeEventListener?.(token);
      }
    },
  };
}

export function useJUCEBridge(): BackendBridge {
  const bridgeRef = useRef<BackendBridge>();

  if (!bridgeRef.current) {
    const nativeBackend = window.__JUCE__?.backend;
    bridgeRef.current = nativeBackend ? createNativeBridge(nativeBackend) : mockBackend;
  }

  return bridgeRef.current;
}
