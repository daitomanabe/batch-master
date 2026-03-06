import { useState } from "react";

import type { BatchJob, ProgressSnapshot } from "../types";

type BatchQueueProps = {
  snapshot: ProgressSnapshot;
  onAddJob: (inputPath: string, outputPath: string) => void;
  onStart: () => void;
  onCancel: () => void;
};

function QueueTable({ jobs }: { jobs: BatchJob[] }) {
  if (jobs.length === 0) {
    return <div className="empty-state">No batch jobs queued yet.</div>;
  }

  return (
    <div className="queue-table">
      {jobs.map((job) => (
        <article className={`queue-row queue-${job.status}`} key={job.id}>
          <div>
            <h3>{job.inputFile.split("/").pop()}</h3>
            <p>{job.outputFile}</p>
          </div>

          <div>
            <p className="status-line">{job.status}</p>
            <div className="progress-track">
              <div className="progress-bar" style={{ width: `${job.progress * 100}%` }} />
            </div>
            {job.errorMessage ? <p className="error-text">{job.errorMessage}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function BatchQueue({ snapshot, onAddJob, onStart, onCancel }: BatchQueueProps) {
  const [inputPath, setInputPath] = useState("");
  const [outputPath, setOutputPath] = useState("");

  const submitJob = () => {
    onAddJob(inputPath.trim(), outputPath.trim());
    setInputPath("");
    setOutputPath("");
  };

  return (
    <section className="panel panel-queue">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Render</p>
          <h2>Batch Queue</h2>
        </div>
        <div className="queue-summary">
          <div className="pill">
            {snapshot.completedJobs} / {snapshot.totalJobs} done
          </div>
          <button className="button button-primary" onClick={onStart} disabled={snapshot.running}>
            Start batch
          </button>
          <button className="button button-danger" onClick={onCancel} disabled={!snapshot.running}>
            Cancel
          </button>
        </div>
      </div>

      <div className="queue-inputs">
        <label>
          <span>Input file</span>
          <input
            type="text"
            placeholder="/path/to/input.wav"
            value={inputPath}
            onChange={(event) => setInputPath(event.target.value)}
          />
        </label>
        <label>
          <span>Output file</span>
          <input
            type="text"
            placeholder="/path/to/output.wav"
            value={outputPath}
            onChange={(event) => setOutputPath(event.target.value)}
          />
        </label>
        <button className="button" onClick={submitJob}>
          Queue file
        </button>
      </div>

      {snapshot.running ? (
        <div className="render-banner">
          <strong>Now rendering</strong>
          <span>{snapshot.currentFile || "Preparing batch..."}</span>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${snapshot.currentPercent * 100}%` }} />
          </div>
        </div>
      ) : null}

      <QueueTable jobs={snapshot.jobs} />
    </section>
  );
}
