import { useEffect, useMemo, useState } from "react";
import type {
  DashboardData,
  JobRecord,
  JobStatus,
  ManualJobInput,
} from "../../shared/contracts";
import { jobStatuses } from "../../shared/contracts";

const emptyForm: ManualJobInput = {
  title: "",
  company: "",
  salary: "",
  city: "",
  link: "",
  description: "",
};

export function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState<ManualJobInput>(emptyForm);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(nextIncludeArchived = includeArchived) {
    const [nextDashboard, nextJobs] = await Promise.all([
      window.jobWorkbench.getDashboard(),
      window.jobWorkbench.listJobs(nextIncludeArchived),
    ]);
    setDashboard(nextDashboard);
    setJobs(nextJobs);
    setSelected((current) => {
      const available = new Set(nextJobs.map((job) => job.id));
      return new Set([...current].filter((id) => available.has(id)));
    });
  }

  useEffect(() => {
    refresh().catch((error) => showMessage(String(error)));
  }, []);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2600);
  }

  async function runOperation(operation: () => Promise<void>) {
    setBusy(true);
    try {
      await operation();
      await refresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchived(value: boolean) {
    setIncludeArchived(value);
    setSelected(new Set());
    await refresh(value);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addJob() {
    await runOperation(async () => {
      await window.jobWorkbench.addJob(form);
      setForm(emptyForm);
      setShowAddDialog(false);
      showMessage("岗位已添加");
    });
  }

  async function updateStatus(id: string, status: JobStatus) {
    await runOperation(async () => {
      await window.jobWorkbench.updateJobStatus({ id, status });
      showMessage("岗位状态已更新");
    });
  }

  async function archiveSelected() {
    if (!selected.size) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.archiveJobs([...selected]);
      setSelected(new Set());
      showMessage(result.message);
    });
  }

  async function restoreSelected() {
    if (!selected.size) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.restoreJobs([...selected]);
      setSelected(new Set());
      showMessage(result.message);
    });
  }

  async function migrate() {
    await runOperation(async () => {
      const result = await window.jobWorkbench.chooseAndMigrate();
      if (result) {
        showMessage(
          `迁移完成：${Object.entries(result.counts)
            .map(([table, count]) => `${table} ${count}`)
            .join("，")}`,
        );
      }
    });
  }

  async function backup() {
    await runOperation(async () => {
      const destination = await window.jobWorkbench.createBackup();
      showMessage(`备份已创建：${destination}`);
    });
  }

  async function exportResume() {
    await runOperation(async () => {
      const destination = await window.jobWorkbench.exportResumePdf();
      if (destination) showMessage(`简历已导出：${destination}`);
    });
  }

  const visibleIds = useMemo(() => jobs.map((job) => job.id), [jobs]);
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <strong>求职工作台</strong>
            <small>Desktop M1</small>
          </div>
        </div>
        <nav>
          <button className="active">职位池</button>
          <button disabled>AI 分析</button>
          <button disabled>简历</button>
          <button disabled>跟进</button>
        </nav>
        <div className="sidebar-status">
          <span className="dot" />
          本地 SQLite 已连接
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">JOB PIPELINE</p>
            <h1>职位池</h1>
            <p className="muted">M1 垂直切片：迁移、岗位、状态、归档、备份与 PDF</p>
          </div>
          <div className="top-actions">
            <button onClick={() => void migrate()} disabled={busy}>
              迁移旧数据库
            </button>
            <button onClick={() => void backup()} disabled={busy}>
              创建备份
            </button>
            <button onClick={() => void exportResume()} disabled={busy}>
              导出简历 PDF
            </button>
            <button className="primary" onClick={() => setShowAddDialog(true)}>
              手动添加岗位
            </button>
          </div>
        </header>

        <section className="metrics">
          <article>
            <span>岗位总数</span>
            <strong>{dashboard?.total ?? 0}</strong>
          </article>
          <article>
            <span>当前职位池</span>
            <strong>{dashboard?.active ?? 0}</strong>
          </article>
          <article>
            <span>已归档</span>
            <strong>{dashboard?.archived ?? 0}</strong>
          </article>
          <article>
            <span>平均匹配分</span>
            <strong>{dashboard?.averageScore ?? 0}</strong>
          </article>
        </section>

        <section className="panel">
          <div className="list-head">
            <label className="check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  setSelected(
                    allSelected ? new Set() : new Set(visibleIds),
                  );
                }}
              />
              <span>全选</span>
            </label>
            <span className="muted">已选 {selected.size} 个</span>
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => void toggleArchived(event.target.checked)}
              />
              <span>查看归档</span>
            </label>
            <button
              className={includeArchived ? "" : "danger"}
              onClick={() =>
                void (includeArchived ? restoreSelected() : archiveSelected())
              }
              disabled={!selected.size || busy}
            >
              {includeArchived ? "恢复选中" : "归档选中"}
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="empty">
              <strong>还没有岗位</strong>
              <p>先迁移旧数据库，或者手动添加一条岗位记录。</p>
            </div>
          ) : (
            <div className="jobs">
              {jobs.map((job) => (
                <article
                  key={job.id}
                  className={`job ${selected.has(job.id) ? "selected" : ""}`}
                >
                  <input
                    className="job-select"
                    type="checkbox"
                    checked={selected.has(job.id)}
                    onChange={() => toggleSelected(job.id)}
                    aria-label={`选择 ${job.title}`}
                  />
                  <div className="job-main">
                    <div className="job-title">
                      <h2>{job.title}</h2>
                      <span>{job.salary || "薪资未填"}</span>
                    </div>
                    <p className="company">
                      {job.company} · {job.city || "城市未填"}
                    </p>
                    <p className="job-meta">
                      {job.experience || "经验未填"} ·{" "}
                      {job.degree || "学历未填"} · 匹配分 {job.score}
                    </p>
                    {job.description ? (
                      <p className="description">{job.description}</p>
                    ) : null}
                    {job.link ? (
                      <a href={job.link} target="_blank" rel="noreferrer">
                        打开岗位链接
                      </a>
                    ) : null}
                  </div>
                  <select
                    value={job.status}
                    onChange={(event) =>
                      void updateStatus(
                        job.id,
                        event.target.value as JobStatus,
                      )
                    }
                    disabled={busy}
                  >
                    {jobStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                  {job.archivedAt ? <span className="archived">已归档</span> : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <footer>
          数据库：{dashboard?.databasePath || "正在初始化"}
        </footer>
      </main>

      {showAddDialog ? (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(event) => {
              event.preventDefault();
              void addJob();
            }}
          >
            <h2>手动添加岗位</h2>
            <label>
              岗位名称
              <input
                required
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </label>
            <label>
              公司名称
              <input
                required
                value={form.company}
                onChange={(event) =>
                  setForm({ ...form, company: event.target.value })
                }
              />
            </label>
            <div className="form-row">
              <label>
                薪资
                <input
                  value={form.salary}
                  onChange={(event) =>
                    setForm({ ...form, salary: event.target.value })
                  }
                />
              </label>
              <label>
                城市
                <input
                  value={form.city}
                  onChange={(event) =>
                    setForm({ ...form, city: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              岗位链接
              <input
                value={form.link}
                onChange={(event) =>
                  setForm({ ...form, link: event.target.value })
                }
              />
            </label>
            <label>
              岗位描述
              <textarea
                rows={6}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowAddDialog(false)}>
                取消
              </button>
              <button className="primary" type="submit" disabled={busy}>
                添加
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {message ? <div className="toast">{message}</div> : null}
    </div>
  );
}
