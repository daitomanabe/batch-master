import { useMemo, useState } from "react";

import type { EngineState, FxChainCandidate } from "../types";

type SimpleBatchPanelProps = {
  fxChains: FxChainCandidate[];
  engine: EngineState;
  onPickInputFolder: () => Promise<string>;
  onPickFxChainFile: () => Promise<string[]>;
  onRun: (input: { profileName?: string; fxChainSourcePath: string; inputDirectory: string }) => Promise<void>;
};

function getChainName(filePath: string) {
  const normalized = filePath.trim().split("/").filter(Boolean).pop() ?? "";
  return normalized.replace(/\.rfxchain$/i, "").trim();
}

export function SimpleBatchPanel({
  fxChains,
  engine,
  onPickInputFolder,
  onPickFxChainFile,
  onRun,
}: SimpleBatchPanelProps) {
  const [inputDirectory, setInputDirectory] = useState("");
  const [fxChainPath, setFxChainPath] = useState("");

  const chainName = useMemo(() => getChainName(fxChainPath), [fxChainPath]);
  const outputPreview = inputDirectory && chainName ? `${inputDirectory}/${chainName}/same-file.wav` : "";

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
      profileName: chainName || undefined,
      fxChainSourcePath: fxChainPath.trim(),
      inputDirectory,
    });
  };

  return (
    <section className="panel panel-simple">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Simple Mode</p>
          <h2>{"Folder -> .RfxChain -> Batch Export"}</h2>
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
          <span>2. Settings file (.RfxChain)</span>
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
        <h3>Detected .RfxChain files</h3>
        {fxChains.length === 0 ? (
          <div className="empty-state">No `.RfxChain` files found yet. Create one in REAPER and choose it.</div>
        ) : (
          fxChains.slice(0, 12).map((candidate) => (
            <button className="candidate-chip" key={candidate.id} onClick={() => setFxChainPath(candidate.path)} type="button">
              {candidate.name}
            </button>
          ))
        )}
      </div>

      {chainName ? <p className="field-hint">Output folder: {chainName}</p> : null}
      {outputPreview ? <p className="field-hint">Output preview: {outputPreview}</p> : null}

      <div className="simple-actions">
        <button
          className="button button-primary"
          onClick={() => void submit()}
          disabled={engine.running || !inputDirectory.trim() || !fxChainPath.trim()}
        >
          Batch export
        </button>
      </div>
    </section>
  );
}
