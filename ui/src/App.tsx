import { startTransition, useEffect, useState } from "react";

import { BatchQueue } from "./components/BatchQueue";
import { ChainEditor } from "./components/ChainEditor";
import { PluginLibrary } from "./components/PluginLibrary";
import { SavedChains } from "./components/SavedChains";
import { useBatchProgress } from "./hooks/useBatchProgress";
import { useJUCEBridge } from "./hooks/useJUCEBridge";
import type { ChainItem, Plugin, SavedChain } from "./types";

function remapChain(chain: ChainItem[]) {
  return chain.map((item, index) => ({
    ...item,
    uid: index + 1,
  }));
}

function serialiseChain(chain: ChainItem[]) {
  return JSON.stringify(chain);
}

export default function App() {
  const backend = useJUCEBridge();
  const { snapshot, lastBatchDone } = useBatchProgress(backend);

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [savedChains, setSavedChains] = useState<SavedChain[]>([]);
  const [chain, setChain] = useState<ChainItem[]>([]);
  const [presetCatalog, setPresetCatalog] = useState<Record<string, string[]>>({});
  const [scanPath, setScanPath] = useState("");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("Ready.");

  useEffect(() => {
    void (async () => {
      const [initialPlugins, initialChains] = await Promise.all([backend.getPluginList(), backend.getSavedChains()]);
      setPlugins(initialPlugins);
      setSavedChains(initialChains);
    })();
  }, [backend]);

  useEffect(() => {
    if (chain.length === 0) {
      return;
    }

    void backend.loadChain(serialiseChain(chain));
  }, [backend, chain]);

  useEffect(() => {
    if (!lastBatchDone) {
      return;
    }

    setStatus(`Batch finished: ${lastBatchDone.totalFiles} files in ${lastBatchDone.elapsed.toFixed(1)}s.`);
  }, [lastBatchDone]);

  const refreshSavedChains = async () => {
    setSavedChains(await backend.getSavedChains());
  };

  const hydratePresets = async (pluginId: string) => {
    if (presetCatalog[pluginId]) {
      return;
    }

    const presets = await backend.loadPresets(pluginId);
    setPresetCatalog((current) => ({ ...current, [pluginId]: presets }));
  };

  const handleScan = async () => {
    setStatus("Scanning plugins...");
    const nextPlugins = await backend.scanPlugins(scanPath.trim());
    startTransition(() => {
      setPlugins(nextPlugins);
    });
    setStatus(`Scan complete: ${nextPlugins.length} plugins.`);
  };

  const handleAddPlugin = async (plugin: Plugin) => {
    await hydratePresets(plugin.id);

    setChain((current) => [
      ...current,
      {
        uid: current.length + 1,
        pluginId: plugin.id,
        pluginPath: plugin.path,
        name: plugin.name,
        vendor: plugin.vendor,
        category: plugin.category,
        preset: "",
        enabled: true,
      },
    ]);

    setStatus(`${plugin.name} added to chain.`);
  };

  const handleMove = (uid: number, direction: -1 | 1) => {
    setChain((current) => {
      const index = current.findIndex((item) => item.uid === uid);

      if (index < 0) {
        return current;
      }

      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return remapChain(next);
    });
  };

  const handleToggle = (uid: number) => {
    setChain((current) =>
      current.map((item) => (item.uid === uid ? { ...item, enabled: !item.enabled } : item)),
    );
  };

  const handleRemove = (uid: number) => {
    setChain((current) => remapChain(current.filter((item) => item.uid !== uid)));
  };

  const handlePresetChange = (uid: number, preset: string) => {
    setChain((current) =>
      current.map((item) =>
        item.uid === uid
          ? {
              ...item,
              preset,
              presetFilePath: preset === "__file__" ? item.presetFilePath : "",
            }
          : item,
      ),
    );
  };

  const handlePresetFileChange = async (uid: number, path: string) => {
    const item = chain.find((entry) => entry.uid === uid);

    if (!item) {
      return;
    }

    if (path) {
      const isValid = await backend.loadPresetFile(item.pluginId, path);
      setStatus(isValid ? "Preset file registered." : "Preset file was not accepted.");
    }

    setChain((current) =>
      current.map((entry) =>
        entry.uid === uid
          ? {
              ...entry,
              preset: path ? "__file__" : entry.preset === "__file__" ? "" : entry.preset,
              presetFilePath: path,
            }
          : entry,
      ),
    );
  };

  const handleSave = async (name: string) => {
    if (!name || chain.length === 0) {
      setStatus("Enter a chain name and add at least one plugin.");
      return;
    }

    const saved = await backend.saveChain(name, serialiseChain(chain));
    setStatus(saved ? `Saved chain "${name}".` : "Failed to save chain.");

    if (saved) {
      await refreshSavedChains();
    }
  };

  const handleLoadSavedChain = async (savedChain: SavedChain) => {
    const nextChain = remapChain(savedChain.chain);
    setChain(nextChain);

    await Promise.all(nextChain.map((item) => hydratePresets(item.pluginId)));
    await backend.loadChain(serialiseChain(nextChain));
    setStatus(`Loaded "${savedChain.name}".`);
  };

  const handleAddJob = async (inputPath: string, outputPath: string) => {
    if (!inputPath || !outputPath) {
      setStatus("Both input and output paths are required.");
      return;
    }

    const jobId = await backend.addBatchJob(inputPath, outputPath);
    setStatus(jobId ? "Job queued." : "Failed to queue job.");
  };

  const handleStart = async () => {
    if (chain.length === 0) {
      setStatus("Load a chain before starting the batch.");
      return;
    }

    const started = await backend.startBatch();
    setStatus(started ? "Batch started." : "Batch could not be started.");
  };

  const handleCancel = async () => {
    await backend.cancelBatch();
    setStatus("Batch cancelled.");
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Standalone JUCE host</p>
          <h1>BatchMaster</h1>
          <p className="hero-copy">
            Build an offline mastering chain, queue source files, and render them through VST3 or AU plugins.
          </p>
        </div>
        <div className="hero-status">
          <div className="environment-chip">{backend.isNative ? "Native bridge" : "Mock bridge"}</div>
          <p>{status}</p>
        </div>
      </header>

      <section className="dashboard">
        <PluginLibrary
          plugins={plugins}
          scanPath={scanPath}
          filter={filter}
          onScanPathChange={setScanPath}
          onFilterChange={setFilter}
          onScan={handleScan}
          onAdd={handleAddPlugin}
        />

        <ChainEditor
          chain={chain}
          presetCatalog={presetCatalog}
          onMove={handleMove}
          onToggle={handleToggle}
          onRemove={handleRemove}
          onPresetChange={handlePresetChange}
          onPresetFileChange={handlePresetFileChange}
        />

        <SavedChains chains={savedChains} onSave={handleSave} onLoad={handleLoadSavedChain} />
        <BatchQueue snapshot={snapshot} onAddJob={handleAddJob} onStart={handleStart} onCancel={handleCancel} />
      </section>
    </main>
  );
}
