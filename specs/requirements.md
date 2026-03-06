# BatchMaster Requirements

## Product Goal

BatchMaster is a local batch renderer that delegates offline FX processing to REAPER instead of hosting VSTs directly.

## Functional Requirements

- Detect the installed REAPER binary at `/Applications/REAPER.app/Contents/MacOS/REAPER`.
- Persist reusable render profiles that reference `.RfxChain` files or a dry pass-through mode.
- Allow existing profiles to be edited after creation.
- Queue multiple offline jobs with independent input and output paths.
- Allow multiple input files to be queued in a single batch action.
- Allow a folder of WAV files to be queued in one action, with optional recursive scan.
- Preserve the original file names and render into a folder named after the selected profile.
- Allow file and folder paths to be chosen from native dialogs instead of manual path entry.
- Execute jobs sequentially via REAPER `-batchconvert`.
- Persist profiles, queue state, engine state, and log files under `~/Library/Application Support/BatchMaster`.
- Persist reusable folder-batch settings and allow them to be reloaded from the UI.
- Read the REAPER plugin catalog on first launch and cache it for subsequent launches.
- Surface REAPER splash log output and engine log output in a debug console UI.

## Non-Functional Requirements

- Jobs must survive app restarts while not running.
- The UI must remain responsive while REAPER is processing.
- A user must be able to diagnose failures from the UI without attaching a debugger.
- The system should prefer deterministic file-based orchestration over in-process plugin hosting.
