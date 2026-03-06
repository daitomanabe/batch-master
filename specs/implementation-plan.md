# Implementation Plan

1. Implement a persistent Node backend for REAPER detection, profile storage, queue storage, and live logs.
2. Implement sequential REAPER `-batchconvert` execution with generated control files per job.
3. Replace the frontend with a REAPER-oriented control surface, including folder queueing and saved folder settings.
4. Add launch scripts that bring up the API and web UI together.
5. Verify the workflow locally by rendering known WAV files through single-file, multi-file, and folder-based dry runs and through an imported `.RfxChain`.
