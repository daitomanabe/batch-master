# BatchMaster Design

## Backend

- `PluginScanner` recursively searches candidate directories, asks JUCE formats to describe plugin files, and caches lightweight `PluginInfo` models.
- `PluginChain` owns the currently loaded chain description plus instantiated `AudioPluginInstance` objects for rendering.
- `OfflineRenderer` reads an input file, pushes blocks through the prepared plugin chain, handles preroll/tail passes, and writes a WAV file.
- `BatchProcessor` is a `juce::Thread` that owns the job queue, creates an isolated `PluginChain` snapshot for each run, and publishes progress callbacks.
- `ChainSerializer` persists chain JSON into `~/Library/Application Support/BatchMaster/chains`.

## Frontend

- React state is split into plugin library, chain editor, queue state, saved chains, and transient status messages.
- `useJUCEBridge` wraps `window.__JUCE__.backend` and falls back to an in-memory mock backend when running under Vite.
- `useBatchProgress` combines native event listeners with periodic polling so the UI stays in sync if an event is missed.

## Tradeoffs

- Built-in program presets are supported when a hosted plugin exposes them; `.vstpreset` files are validated and stored, but generic binary preset import is not attempted because plugin-specific decoding is not reliable across vendors.
- Plugin scanning is synchronous inside the current implementation to keep the bridge simple; the heavy work is isolated to explicit user actions.
