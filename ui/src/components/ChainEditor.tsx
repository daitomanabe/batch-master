import { PresetSelector } from "./PresetSelector";
import type { ChainItem } from "../types";

type ChainEditorProps = {
  chain: ChainItem[];
  presetCatalog: Record<string, string[]>;
  onMove: (uid: number, direction: -1 | 1) => void;
  onToggle: (uid: number) => void;
  onRemove: (uid: number) => void;
  onPresetChange: (uid: number, preset: string) => void;
  onPresetFileChange: (uid: number, path: string) => void;
};

export function ChainEditor({
  chain,
  presetCatalog,
  onMove,
  onToggle,
  onRemove,
  onPresetChange,
  onPresetFileChange,
}: ChainEditorProps) {
  return (
    <section className="panel panel-chain">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Process</p>
          <h2>Chain Editor</h2>
        </div>
        <div className="pill">{chain.length} slots</div>
      </div>

      {chain.length === 0 ? (
        <div className="empty-state">Add plugins from the library to build the mastering chain.</div>
      ) : (
        <div className="chain-list">
          {chain.map((item, index) => (
            <article className={`chain-card ${item.enabled ? "" : "is-disabled"}`} key={item.uid}>
              <header>
                <div>
                  <p className="chain-index">{String(index + 1).padStart(2, "0")}</p>
                  <h3>{item.name}</h3>
                  <p>
                    {item.vendor} · {item.category}
                  </p>
                </div>
                <div className="chain-actions">
                  <button className="button" onClick={() => onMove(item.uid, -1)} disabled={index === 0}>
                    Up
                  </button>
                  <button className="button" onClick={() => onMove(item.uid, 1)} disabled={index === chain.length - 1}>
                    Down
                  </button>
                  <button className="button" onClick={() => onToggle(item.uid)}>
                    {item.enabled ? "Disable" : "Enable"}
                  </button>
                  <button className="button button-danger" onClick={() => onRemove(item.uid)}>
                    Remove
                  </button>
                </div>
              </header>

              <PresetSelector
                options={presetCatalog[item.pluginId] ?? []}
                preset={item.preset}
                presetFilePath={item.presetFilePath}
                onPresetChange={(preset) => onPresetChange(item.uid, preset)}
                onPresetFileChange={(path) => onPresetFileChange(item.uid, path)}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
