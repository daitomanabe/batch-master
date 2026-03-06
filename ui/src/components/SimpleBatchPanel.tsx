import { useEffect, useMemo, useState } from "react";

import type { EngineState, FxChainCandidate, PluginCatalogState } from "../types";

type SimpleBatchPanelProps = {
  pluginCatalog: PluginCatalogState;
  fxChains: FxChainCandidate[];
  engine: EngineState;
  onPickInputFolder: () => Promise<string>;
  onPickFxChainFile: () => Promise<string[]>;
  onRun: (input: { pluginName: string; fxChainSourcePath?: string; inputDirectory: string }) => Promise<void>;
};

function matchesPlugin(candidateName: string, pluginName: string) {
  const left = candidateName.toLowerCase();
  const right = pluginName.toLowerCase();
  return left.includes(right) || right.includes(left);
}

export function SimpleBatchPanel({
  pluginCatalog,
  fxChains,
  engine,
  onPickInputFolder,
  onPickFxChainFile,
  onRun,
}: SimpleBatchPanelProps) {
  const [pluginQuery, setPluginQuery] = useState("");
  const [selectedPluginName, setSelectedPluginName] = useState("");
  const [inputDirectory, setInputDirectory] = useState("");
  const [fxChainPath, setFxChainPath] = useState("");

  const filteredPlugins = useMemo(() => {
    const query = pluginQuery.trim().toLowerCase();

    return pluginCatalog.plugins.filter((plugin) => {
      if (plugin.instrument) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${plugin.name} ${plugin.vendor} ${plugin.format}`.toLowerCase().includes(query);
    });
  }, [pluginCatalog.plugins, pluginQuery]);

  const matchingFxChains = useMemo(() => {
    if (!selectedPluginName) {
      return fxChains;
    }

    return fxChains.filter((candidate) => matchesPlugin(candidate.name, selectedPluginName));
  }, [fxChains, selectedPluginName]);

  useEffect(() => {
    if (!selectedPluginName && filteredPlugins.length > 0) {
      setSelectedPluginName(filteredPlugins[0].name);
    }
  }, [filteredPlugins, selectedPluginName]);

  useEffect(() => {
    if (!selectedPluginName || fxChainPath.trim()) {
      return;
    }

    const suggestion = matchingFxChains[0];

    if (suggestion) {
      setFxChainPath(suggestion.path);
    }
  }, [fxChainPath, matchingFxChains, selectedPluginName]);

  const browseInputFolder = async () => {
    const selectedPath = await onPickInputFolder();

    if (selectedPath) {
      setInputDirectory(selectedPath);
    }
  };

  const browseFxChain = async () => {
    const [selectedPath] = await onPickFxChainFile();

    if (selectedPath) {
      setFxChainPath(selectedPath);
    }
  };

  const submit = async () => {
    await onRun({
      pluginName: selectedPluginName,
      fxChainSourcePath: fxChainPath.trim() || undefined,
      inputDirectory,
    });
  };

  const outputPreview = inputDirectory && selectedPluginName ? `${inputDirectory}/${selectedPluginName}/same-file.wav` : "";

  return (
    <section className="panel panel-simple">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Simple Mode</p>
          <h2>{"Folder -> Plugin -> Batch Export"}</h2>
        </div>
        <div className={`badge ${engine.running ? "badge-warn" : "badge-ok"}`}>{engine.running ? "Running" : "Ready"}</div>
      </div>

      <div className="simple-grid">
        <label>
          <span>1. Input folder</span>
          <div className="path-input-row">
            <input
              value={inputDirectory}
              onChange={(event) => setInputDirectory(event.target.value)}
              placeholder="/path/to/wav-folder"
            />
            <button className="button" onClick={() => void browseInputFolder()} type="button">
              Browse
            </button>
          </div>
        </label>

        <label>
          <span>2. Plugin search</span>
          <input value={pluginQuery} onChange={(event) => setPluginQuery(event.target.value)} placeholder="Ozone 12" />
        </label>

        <label>
          <span>Plugin</span>
          <select value={selectedPluginName} onChange={(event) => setSelectedPluginName(event.target.value)}>
            {filteredPlugins.map((plugin) => (
              <option key={plugin.id} value={plugin.name}>
                {plugin.name} {plugin.vendor ? `(${plugin.vendor})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>3. Plugin settings (.RfxChain)</span>
          <div className="path-input-row">
            <input
              value={fxChainPath}
              onChange={(event) => setFxChainPath(event.target.value)}
              placeholder="/path/to/Ozone 12.RfxChain"
            />
            <button className="button" onClick={() => void browseFxChain()} type="button">
              Browse
            </button>
          </div>
        </label>
      </div>

      <div className="candidate-list">
        <h3>Suggested settings</h3>
        {matchingFxChains.length === 0 ? (
          <div className="empty-state">No matching `.RfxChain` files found. Create one in REAPER and choose it.</div>
        ) : (
          matchingFxChains.slice(0, 8).map((candidate) => (
            <button className="candidate-chip" key={candidate.id} onClick={() => setFxChainPath(candidate.path)} type="button">
              {candidate.name}
            </button>
          ))
        )}
      </div>

      {outputPreview ? <p className="field-hint">Output preview: {outputPreview}</p> : null}

      <div className="simple-actions">
        <button
          className="button button-primary"
          onClick={() => void submit()}
          disabled={engine.running || !inputDirectory.trim() || !selectedPluginName.trim() || !fxChainPath.trim()}
        >
          Batch export
        </button>
      </div>
    </section>
  );
}
