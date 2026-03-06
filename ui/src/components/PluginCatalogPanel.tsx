import { useDeferredValue, useState } from "react";

import type { PluginCatalogState } from "../types";

type PluginCatalogPanelProps = {
  pluginCatalog: PluginCatalogState;
};

export function PluginCatalogPanel({ pluginCatalog }: PluginCatalogPanelProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filteredPlugins =
    deferredQuery.length === 0
      ? pluginCatalog.plugins
      : pluginCatalog.plugins.filter((plugin) =>
          `${plugin.name} ${plugin.vendor} ${plugin.format}`.toLowerCase().includes(deferredQuery),
        );

  return (
    <section className="panel panel-plugins">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Catalog</p>
          <h2>Plugins</h2>
        </div>
        <div className="plugin-summary">
          <div className="badge">{filteredPlugins.length}</div>
          <p>{pluginCatalog.lastUpdatedAt ? new Date(pluginCatalog.lastUpdatedAt).toLocaleString("ja-JP") : "No scan yet"}</p>
        </div>
      </div>

      <label>
        <span>Filter</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ozone, FabFilter, AU, VST3..." />
      </label>

      <div className="plugin-list">
        {filteredPlugins.length === 0 ? (
          <div className="empty-state">No plugins matched.</div>
        ) : (
          filteredPlugins.map((plugin) => (
            <article className="plugin-row" key={plugin.id}>
              <div>
                <h3>{plugin.name}</h3>
                <p>{plugin.vendor || "Vendor unknown"}</p>
              </div>
              <div className="plugin-meta">
                <div className="badge">{plugin.format}</div>
                {plugin.instrument ? <div className="badge badge-ok">Instrument</div> : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
