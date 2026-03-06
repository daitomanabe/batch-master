# BatchMaster Requirements

## Product Goal

BatchMaster is a standalone desktop app for chaining VST3/AU plugins and rendering multiple audio files offline.

## Functional Requirements

- Scan `/Library/Audio/Plug-Ins/VST3` and cache discovered VST3 plugins.
- Build a chain of enabled plugins with optional built-in preset selection and optional `.vstpreset` file reference.
- Save and reload chains as `.bmchain.json` files in the user application support directory.
- Queue multiple offline render jobs with independent input and output paths.
- Render queued jobs sequentially on a background thread and surface progress to the WebView UI.
- Expose the documented JS bridge methods and push `progress.update` / `batch.done` events to the frontend.

## Non-Functional Requirements

- The app must remain responsive while batch rendering runs.
- The UI must also work in browser-only development mode with a mock backend.
- The implementation should degrade gracefully when a plugin cannot be instantiated or a preset file cannot be applied.
- The render path should default to WAV output at the source sample rate and 32-bit depth.
