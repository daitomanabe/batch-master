import type { BatchJob } from "../types";

type JobsPanelProps = {
  jobs: BatchJob[];
  onClearFinished: () => Promise<void>;
};

export function JobsPanel({ jobs, onClearFinished }: JobsPanelProps) {
  return (
    <section className="panel panel-jobs">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Status</p>
          <h2>Job History</h2>
        </div>
        <button className="button" onClick={() => void onClearFinished()}>
          Clear finished
        </button>
      </div>

      <div className="job-list">
        {jobs.length === 0 ? (
          <div className="empty-state">No jobs yet.</div>
        ) : (
          jobs.map((job) => (
            <article className={`job-card job-${job.status}`} key={job.id}>
              <div>
                <h3>{job.profileName}</h3>
                <p>{job.inputPath}</p>
                <p>{job.outputPath}</p>
                <p>{job.currentStep}</p>
                {job.startedAt ? <p>Started: {new Date(job.startedAt).toLocaleString("ja-JP")}</p> : null}
                {job.completedAt ? <p>Finished: {new Date(job.completedAt).toLocaleString("ja-JP")}</p> : null}
                {job.splashLogPath ? <code>{job.splashLogPath}</code> : null}
                {job.stderrLogPath ? <code>{job.stderrLogPath}</code> : null}
                {job.errorMessage ? <p className="error-text">{job.errorMessage}</p> : null}
              </div>
              <div className="job-meta">
                <div className="badge">{job.status}</div>
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${job.progress * 100}%` }} />
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
