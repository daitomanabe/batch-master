import { useDeferredValue } from "react";

import type { Plugin } from "../types";

type PluginLibraryProps = {
  plugins: Plugin[];
  scanPath: string;
  filter: string;
  onFilterChange: (value: string) => void;
  onScan: () => void;
  onAdd: (plugin: Plugin) => void;
};

export function PluginLibrary({
  plugins,
  scanPath,
  filter,
  onFilterChange,
  onScan,
  onAdd,
}: PluginLibraryProps) {
  const deferredFilter = useDeferredValue(filter);

  const filteredPlugins = plugins.filter((plugin) => {
    const haystack = `${plugin.name} ${plugin.vendor} ${plugin.category}`.toLowerCase();
    return haystack.includes(deferredFilter.toLowerCase());
  });

  return (
    <section className="panel panel-library">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Scan</p>
          <h2>Plugin Library</h2>
        </div>
        <button className="button button-primary" onClick={onScan}>
          Refresh
        </button>
      </div>

      <div className="stack">
        <label>
          <span>VST folder path</span>
          <input
            type="text"
            value={scanPath}
            readOnly
          />
        </label>

        <label>
          <span>Filter</span>
          <input
            type="text"
            placeholder="Ozone, FabFilter, EQ..."
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
          />
        </label>
      </div>

      <div className="library-list">
        {filteredPlugins.length === 0 ? (
          <div className="empty-state">No plugins found yet. BatchMaster scans only /Library/Audio/Plug-Ins/VST3.</div>
        ) : (
          filteredPlugins.map((plugin) => (
            <article className="library-card" key={plugin.id}>
              <div>
                <h3>{plugin.name}</h3>
                <p>
                  {plugin.vendor} · {plugin.category}
                </p>
                <code>{plugin.path}</code>
              </div>
              <button className="button" onClick={() => onAdd(plugin)}>
                Add to chain
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
