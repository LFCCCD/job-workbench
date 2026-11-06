import { useEffect, useMemo, useState } from "react";
import type {
  DashboardData,
  JobDetail,
  JobFilters,
  JobRecord,
  JobRecordUpdate,
  JobStatus,
  ManualJobInput,
  MigrationPreview,
  SavedView,
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

const defaultFilters: JobFilters = {
  query: "",
  category: "",
  status: "",
  favoriteOnly: false,
  archived: "active",
  sort: "updated",
};

const emptyEditForm: JobRecordUpdate = {
  title: "",
  company: "",
  salary: "",
  city: "",
  district: "",
  experience: "",
  degree: "",
  category: "",
  link: "",
  description: "",
  notes: "",
};

function editFormFromJob(job: JobRecord): JobRecordUpdate {
  return {
    title: job.title,
    company: job.company,
    salary: job.salary,
    city: job.city,
    district: job.district,
    experience: job.experience,
    degree: job.degree,
    category: job.category,
    link: job.link,
    description: job.description,
    notes: job.notes,
  };
}

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    status_change: "状态变更",
    job_edit: "编辑岗位",
    archived: "移入回收站",
    restored: "恢复岗位",
  };
  return labels[eventType] || eventType;
}

export function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [filters, setFilters] = useState<JobFilters>(defaultFilters);
  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<JobRecordUpdate>(emptyEditForm);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [migrationPreview, setMigrationPreview] =
    useState<MigrationPreview | null>(null);
  const [form, setForm] = useState<ManualJobInput>(emptyForm);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(nextFilters = filters) {
    const [nextDashboard, nextJobs, nextViews] = await Promise.all([
      window.jobWorkbench.getDashboard(),
      window.jobWorkbench.listJobs(nextFilters),
      window.jobWorkbench.listSavedViews(),
    ]);
    setDashboard(nextDashboard);
    setJobs(nextJobs);
    setViews(nextViews);
    setSelected((current) => {
      const available = new Set(nextJobs.map((job) => job.id));
      return new Set([...current].filter((id) => available.has(id)));
    });
    if (selectedJobId) {
      try {
        setDetail(await window.jobWorkbench.getJobDetail(selectedJobId));
      } catch {
        setSelectedJobId(null);
        setDetail(null);
        setEditing(false);
      }
    }
  }

  useEffect(() => {
    refresh().catch((error) => showMessage(String(error)));
  }, []);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2800);
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

  function patchFilters(patch: Partial<JobFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    setSelected(new Set());
    void refresh(next).catch((error) => showMessage(String(error)));
  }

  async function openJob(id: string) {
    const nextDetail = await window.jobWorkbench.getJobDetail(id);
    setSelectedJobId(id);
    setDetail(nextDetail);
    setEditing(false);
    setEditForm(editFormFromJob(nextDetail.job));
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

  async function toggleFavorite(job: JobRecord) {
    await runOperation(async () => {
      await window.jobWorkbench.setJobFavorite(job.id, !job.favorite);
      showMessage(job.favorite ? "已取消收藏" : "已收藏");
    });
  }

  async function saveDetail() {
    if (!selectedJobId) return;
    await runOperation(async () => {
      await window.jobWorkbench.updateJob(selectedJobId, editForm);
      setEditing(false);
      await openJob(selectedJobId);
      showMessage("岗位信息已保存");
    });
  }

  async function archiveSelected() {
    if (!selected.size) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.archiveJobs([...selected]);
      setSelected(new Set());
      setSelectedJobId(null);
      setDetail(null);
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

  async function permanentlyDeleteSelected() {
    if (!selected.size) return;
    const confirmed = window.confirm(
      `永久删除选中的 ${selected.size} 个岗位？岗位事件和跟进记录也会删除，此操作无法撤销。`,
    );
    if (!confirmed) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.permanentlyDeleteJobs([
        ...selected,
      ]);
      setSelected(new Set());
      setSelectedJobId(null);
      setDetail(null);
      showMessage(result.message);
    });
  }

  async function saveCurrentView() {
    const name = window.prompt("筛选视图名称");
    if (!name?.trim()) return;
    await runOperation(async () => {
      await window.jobWorkbench.saveView(name.trim(), filters);
      showMessage("筛选视图已保存");
    });
  }

  async function deleteCurrentView() {
    if (!selectedViewId) return;
    const confirmed = window.confirm("删除当前筛选视图？");
    if (!confirmed) return;
    await runOperation(async () => {
      await window.jobWorkbench.deleteSavedView(selectedViewId);
      setSelectedViewId("");
      showMessage("筛选视图已删除");
    });
  }

  async function migrate() {
    setBusy(true);
    try {
      const preview = await window.jobWorkbench.inspectLegacyDatabase();
      if (preview) setMigrationPreview(preview);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmMigration() {
    await runOperation(async () => {
      const result = await window.jobWorkbench.confirmLegacyMigration();
      setMigrationPreview(null);
      showMessage(
        `迁移完成：${Object.entries(result.counts)
          .map(([table, count]) => `${table} ${count}`)
          .join("，")}`,
      );
    });
  }

  async function restoreBackup() {
    await runOperation(async () => {
      const result = await window.jobWorkbench.chooseAndRestore();
      if (result) showMessage(`已从备份恢复：${result.restoredFrom}`);
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
  const categoryOptions = [...new Set(jobs.map((job) => job.category).filter(Boolean))];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <strong>求职工作台</strong>
            <small>M2 · Data Core</small>
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
          Schema v{dashboard?.schemaVersion ?? "-"} · 本地连接
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">JOB PIPELINE</p>
            <h1>职位池</h1>
            <p className="muted">筛选、详情、收藏、状态时间线与回收站</p>
          </div>
          <div className="top-actions">
            <button onClick={() => void migrate()} disabled={busy}>
              迁移数据库
            </button>
            <button onClick={() => void backup()} disabled={busy}>
              创建备份
            </button>
            <button onClick={() => void restoreBackup()} disabled={busy}>
              恢复备份
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
            <span>回收站</span>
            <strong>{dashboard?.archived ?? 0}</strong>
          </article>
          <article>
            <span>平均匹配分</span>
            <strong>{dashboard?.averageScore ?? 0}</strong>
          </article>
        </section>

        <section className="panel">
          <div className="filter-grid">
            <label>
              搜索
              <input
                value={filters.query}
                placeholder="岗位、公司、城市或描述"
                onChange={(event) => patchFilters({ query: event.target.value })}
              />
            </label>
            <label>
              方向
              <select
                value={filters.category}
                onChange={(event) =>
                  patchFilters({ category: event.target.value })
                }
              >
                <option value="">全部方向</option>
                {categoryOptions.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              状态
              <select
                value={filters.status}
                onChange={(event) =>
                  patchFilters({ status: event.target.value as JobFilters["status"] })
                }
              >
                <option value="">全部状态</option>
                {jobStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              范围
              <select
                value={filters.archived}
                onChange={(event) =>
                  patchFilters({
                    archived: event.target.value as JobFilters["archived"],
                  })
                }
              >
                <option value="active">当前职位池</option>
                <option value="archived">回收站</option>
                <option value="all">全部岗位</option>
              </select>
            </label>
            <label>
              排序
              <select
                value={filters.sort}
                onChange={(event) =>
                  patchFilters({
                    sort: event.target.value as JobFilters["sort"],
                  })
                }
              >
                <option value="updated">最近更新</option>
                <option value="score">匹配分</option>
                <option value="company">公司名称</option>
              </select>
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={filters.favoriteOnly}
                onChange={(event) =>
                  patchFilters({ favoriteOnly: event.target.checked })
                }
              />
              <span>仅看收藏</span>
            </label>
          </div>

          <div className="view-strip">
            <select
              value={selectedViewId}
              onChange={(event) => {
                const id = event.target.value;
                setSelectedViewId(id);
                const view = views.find((item) => item.id === id);
                if (view) {
                  setFilters(view.filters);
                  void refresh(view.filters);
                }
              }}
            >
              <option value="">选择筛选视图</option>
              {views.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
            <button onClick={() => void saveCurrentView()} disabled={busy}>
              保存当前视图
            </button>
            <button
              onClick={() => void deleteCurrentView()}
              disabled={!selectedViewId || busy}
            >
              删除视图
            </button>
          </div>

          <div className="list-head">
            <label className="check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(visibleIds))
                }
              />
              <span>全选</span>
            </label>
            <span className="muted">已选 {selected.size} 个</span>
            <button
              className={filters.archived === "archived" ? "" : "danger"}
              onClick={() =>
                void (filters.archived === "archived"
                  ? restoreSelected()
                  : archiveSelected())
              }
              disabled={!selected.size || busy}
            >
              {filters.archived === "archived" ? "恢复选中" : "归档选中"}
            </button>
            {filters.archived !== "active" ? (
              <button
                className="danger"
                onClick={() => void permanentlyDeleteSelected()}
                disabled={!selected.size || busy}
              >
                永久删除
              </button>
            ) : null}
          </div>

          <div className={`workspace ${detail ? "with-detail" : ""}`}>
            <div>
              {jobs.length === 0 ? (
                <div className="empty">
                  <strong>还没有岗位</strong>
                  <p>迁移旧数据库，或者手动添加一条岗位记录。</p>
                </div>
              ) : (
                <div className="jobs">
                  {jobs.map((job) => (
                    <article
                      key={job.id}
                      className={`job ${
                        selected.has(job.id) ? "selected" : ""
                      } ${selectedJobId === job.id ? "active" : ""}`}
                    >
                      <input
                        className="job-select"
                        type="checkbox"
                        checked={selected.has(job.id)}
                        onChange={() => toggleSelected(job.id)}
                        aria-label={`选择 ${job.title}`}
                      />
                      <button
                        className="job-main"
                        type="button"
                        onClick={() => void openJob(job.id)}
                      >
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
                      </button>
                      <div className="job-controls">
                        <button
                          className={`favorite ${job.favorite ? "active" : ""}`}
                          onClick={() => void toggleFavorite(job)}
                          aria-label={job.favorite ? "取消收藏" : "收藏"}
                        >
                          {job.favorite ? "★" : "☆"}
                        </button>
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
                        {job.archivedAt ? (
                          <span className="archived">已归档</span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {detail ? (
              <aside className="detail-panel">
                <div className="detail-head">
                  <div>
                    <p className="eyebrow">JOB DETAIL</p>
                    <h2>{detail.job.title}</h2>
                    <p className="muted">
                      {detail.job.company} · {detail.job.status}
                    </p>
                  </div>
                  <button onClick={() => setDetail(null)} aria-label="关闭详情">
                    ×
                  </button>
                </div>

                {editing ? (
                  <div className="edit-form">
                    {(
                      [
                        ["title", "岗位名称"],
                        ["company", "公司"],
                        ["salary", "薪资"],
                        ["city", "城市"],
                        ["district", "区域"],
                        ["experience", "经验"],
                        ["degree", "学历"],
                        ["category", "方向"],
                        ["link", "岗位链接"],
                      ] as Array<[keyof JobRecordUpdate, string]>
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          value={String(editForm[key] || "")}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              [key]: event.target.value,
                            })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      岗位描述
                      <textarea
                        rows={5}
                        value={editForm.description}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      个人备注
                      <textarea
                        rows={4}
                        value={editForm.notes}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            notes: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="button-row">
                      <button onClick={() => setEditing(false)}>取消</button>
                      <button
                        className="primary"
                        onClick={() => void saveDetail()}
                        disabled={busy}
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <dl className="detail-facts">
                      <dt>薪资</dt>
                      <dd>{detail.job.salary || "未填写"}</dd>
                      <dt>地点</dt>
                      <dd>
                        {detail.job.city || "未填写"}{" "}
                        {detail.job.district}
                      </dd>
                      <dt>经验 / 学历</dt>
                      <dd>
                        {detail.job.experience || "未填写"} /{" "}
                        {detail.job.degree || "未填写"}
                      </dd>
                      <dt>方向</dt>
                      <dd>{detail.job.category || "未填写"}</dd>
                    </dl>
                    <h3>岗位描述</h3>
                    <p className="detail-description">
                      {detail.job.description || "暂无岗位描述"}
                    </p>
                    <h3>个人备注</h3>
                    <p className="detail-description">
                      {detail.job.notes || "暂无备注"}
                    </p>
                    <div className="button-row">
                      <button onClick={() => setEditing(true)}>编辑岗位</button>
                      {detail.job.link ? (
                        <a href={detail.job.link} target="_blank" rel="noreferrer">
                          打开原岗位
                        </a>
                      ) : null}
                    </div>
                    <h3>状态时间线</h3>
                    <div className="timeline">
                      {detail.events.length ? (
                        detail.events.map((event) => (
                          <div key={event.id} className="timeline-item">
                            <strong>{eventLabel(event.eventType)}</strong>
                            <p>
                              {event.fromStatus && event.toStatus
                                ? `${event.fromStatus} → ${event.toStatus}`
                                : event.note || "已记录"}
                            </p>
                            <time>{new Date(event.createdAt).toLocaleString()}</time>
                          </div>
                        ))
                      ) : (
                        <p className="muted">还没有操作记录</p>
                      )}
                    </div>
                  </>
                )}
              </aside>
            ) : null}
          </div>
        </section>

        <footer>
          数据库：{dashboard?.databasePath || "正在初始化"} · Schema v
          {dashboard?.schemaVersion ?? "-"} · 待处理任务{" "}
          {dashboard?.pendingTasks ?? 0}
        </footer>
      </main>

      {migrationPreview ? (
        <div className="modal-backdrop">
          <section className="modal migration-preview">
            <p className="eyebrow">MIGRATION PREVIEW</p>
            <h2>确认迁移旧数据库</h2>
            <p className="muted">迁移前会自动创建当前数据库的安全备份。</p>
            <dl>
              <dt>源数据库</dt>
              <dd>{migrationPreview.sourcePath}</dd>
              <dt>完整性</dt>
              <dd>{migrationPreview.integrity}</dd>
              <dt>源 Schema</dt>
              <dd>v{migrationPreview.schemaVersion || "未记录"}</dd>
            </dl>
            <div className="count-grid">
              {Object.entries(migrationPreview.counts).map(
                ([table, count]) => (
                  <div key={table}>
                    <span>{table}</span>
                    <strong>{count}</strong>
                  </div>
                ),
              )}
            </div>
            {migrationPreview.warnings.length ? (
              <ul className="warnings">
                {migrationPreview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="modal-actions">
              <button type="button" onClick={() => setMigrationPreview(null)}>
                取消
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => void confirmMigration()}
                disabled={busy}
              >
                确认迁移
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
