# Implementation Plan

1. Implement a persistent Node backend for REAPER detection, profile storage, queue storage, and live logs.
2. Implement sequential REAPER `-batchconvert` execution with generated control files per job.
3. Replace the frontend with a REAPER-oriented control surface.
4. Verify the workflow locally by rendering a known WAV file through a dry profile and through an imported `.RfxChain`.
