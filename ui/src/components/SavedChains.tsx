import { useState } from "react";

import type { SavedChain } from "../types";

type SavedChainsProps = {
  chains: SavedChain[];
  onSave: (name: string) => void;
  onLoad: (chain: SavedChain) => void;
};

export function SavedChains({ chains, onSave, onLoad }: SavedChainsProps) {
  const [chainName, setChainName] = useState("");

  return (
    <section className="panel panel-saved">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Recall</p>
          <h2>Saved Chains</h2>
        </div>
      </div>

      <div className="saved-actions">
        <label>
          <span>Chain name</span>
          <input
            type="text"
            placeholder="Club Master"
            value={chainName}
            onChange={(event) => setChainName(event.target.value)}
          />
        </label>
        <button
          className="button button-primary"
          onClick={() => {
            onSave(chainName.trim());
            setChainName("");
          }}
        >
          Save current chain
        </button>
      </div>

      <div className="saved-list">
        {chains.length === 0 ? (
          <div className="empty-state">No saved chains yet.</div>
        ) : (
          chains.map((chain) => (
            <article className="saved-card" key={`${chain.name}-${chain.createdAt}`}>
              <div>
                <h3>{chain.name}</h3>
                <p>{new Date(chain.createdAt).toLocaleString()}</p>
                <span>{chain.chain.length} processors</span>
              </div>
              <button className="button" onClick={() => onLoad(chain)}>
                Load
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
