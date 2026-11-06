import { useEffect, useMemo, useState } from "react";
import type {
  CollectorPreviewData,
  CollectorRequest,
  CollectorStatus,
  DashboardData,
  JobDetail,
  JobFilters,
  JobRecord,
  JobRecordUpdate,
  JobStatus,
  ManualJobInput,
  MigrationPreview,
  SavedView,
  TaskRecord,
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

const collectorCities = [
  { name: "杭州", code: 101210100 },
  { name: "宁波", code: 101210400 },
  { name: "嘉兴", code: 101210300 },
  { name: "丽水", code: 101210800 },
] as const;

const defaultCollectorRequest: CollectorRequest = {
  cities: [collectorCities[0], collectorCities[3]],
  queries: ["软件实施工程师", "技术支持工程师"],
  pagesPerQuery: 1,
  maxSearchRequests: 6,
  detailLimit: 12,
  requestDelayMs: 4_500,
};

const viewCopy = {
  jobs: {
    eyebrow: "JOB PIPELINE",
    title: "职位池",
    description: "筛选、详情、收藏、状态时间线与回收站",
  },
  collector: {
    eyebrow: "COLLECTOR WORKER",
    title: "采集中心",
    description: "专用 Edge、低频采集、候选预览与人工确认导入",
  },
  tasks: {
    eyebrow: "TASK CENTER",
    title: "任务中心",
    description: "持久化任务、进度、取消、重试与重启恢复",
  },
} as const;

const finishedTaskStatuses = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);

const taskStatusLabels: Record<TaskRecord["status"], string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
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
  const [view, setView] = useState<"jobs" | "collector" | "tasks">("jobs");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [filters, setFilters] = useState<JobFilters>(defaultFilters);
  const [views, setViews] = useState<SavedView[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [collectorPreview, setCollectorPreview] =
    useState<CollectorPreviewData | null>(null);
  const [collectorStatus, setCollectorStatus] =
    useState<CollectorStatus | null>(null);
  const [collectorRequest, setCollectorRequest] =
    useState<CollectorRequest>(defaultCollectorRequest);
  const [collectorQueriesText, setCollectorQueriesText] = useState(
    defaultCollectorRequest.queries.join("\n"),
  );
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(
    new Set(),
  );
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
    const [
      nextDashboard,
      nextJobs,
      nextViews,
      nextTasks,
      nextCollectorPreview,
      nextCollectorStatus,
    ] = await Promise.all([
      window.jobWorkbench.getDashboard(),
      window.jobWorkbench.listJobs(nextFilters),
      window.jobWorkbench.listSavedViews(),
      window.jobWorkbench.listTasks(),
      window.jobWorkbench.listCollectorPreview(),
      window.jobWorkbench.getCollectorStatus(),
    ]);
    setDashboard(nextDashboard);
    setJobs(nextJobs);
    setViews(nextViews);
    setTasks(nextTasks);
    setCollectorPreview(nextCollectorPreview);
    setCollectorStatus(nextCollectorStatus);
    setSelectedCandidates((current) => {
      const available = new Set(
        nextCollectorPreview.candidates.map(
          (candidate) => candidate.candidate.sourceKey,
        ),
      );
      return new Set([...current].filter((id) => available.has(id)));
    });
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

  useEffect(() => {
    if (
      !tasks.some(
        (task) => task.status === "queued" || task.status === "running",
      )
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void Promise.all([
        window.jobWorkbench.listTasks(),
        window.jobWorkbench.getDashboard(),
        window.jobWorkbench.listCollectorPreview(),
      ]).then(([nextTasks, nextDashboard, nextCollectorPreview]) => {
        setTasks(nextTasks);
        setDashboard(nextDashboard);
        setCollectorPreview(nextCollectorPreview);
      });
    }, 800);
    return () => window.clearInterval(timer);
  }, [tasks]);

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
      await window.jobWorkbench.createBackupTask();
      setView("tasks");
      showMessage("备份任务已创建");
    });
  }

  async function openCollectorBrowser() {
    await runOperation(async () => {
      const status = await window.jobWorkbench.openCollectorBrowser();
      setCollectorStatus(status);
      showMessage("专用 Edge 已启动，请完成扫码登录");
    });
  }

  async function startCollector() {
    const queries = collectorQueriesText
      .split(/\r?\n|,|，/)
      .map((query) => query.trim())
      .filter(Boolean);
    if (!queries.length) {
      showMessage("至少填写一个搜索关键词");
      return;
    }
    if (!collectorRequest.cities.length) {
      showMessage("至少选择一个城市");
      return;
    }
    await runOperation(async () => {
      await window.jobWorkbench.createCollectorTask({
        ...collectorRequest,
        queries,
      });
      setView("tasks");
      showMessage("采集任务已创建，完成后候选岗位会进入采集中心");
    });
  }

  function toggleCollectorCity(code: number, checked: boolean) {
    const city = collectorCities.find((item) => item.code === code);
    if (!city) return;
    setCollectorRequest((current) => ({
      ...current,
      cities: checked
        ? [...current.cities.filter((item) => item.code !== code), city]
        : current.cities.filter((item) => item.code !== code),
    }));
  }

  function toggleCandidate(sourceKey: string) {
    setSelectedCandidates((current) => {
      const next = new Set(current);
      if (next.has(sourceKey)) next.delete(sourceKey);
      else next.add(sourceKey);
      return next;
    });
  }

  async function importCandidates() {
    if (!selectedCandidates.size) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.importCollectorCandidates([
        ...selectedCandidates,
      ]);
      setSelectedCandidates(new Set());
      setView("jobs");
      showMessage(result.message);
    });
  }

  async function dismissCandidates() {
    if (!selectedCandidates.size) return;
    const confirmed = window.confirm(
      `从候选预览中移除选中的 ${selectedCandidates.size} 个岗位？`,
    );
    if (!confirmed) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.dismissCollectorCandidates([
        ...selectedCandidates,
      ]);
      setSelectedCandidates(new Set());
      showMessage(result.message);
    });
  }

  async function cancelTask(id: string) {
    await runOperation(async () => {
      await window.jobWorkbench.cancelTask(id);
      showMessage("任务已取消");
    });
  }

  async function retryTask(id: string) {
    await runOperation(async () => {
      await window.jobWorkbench.retryTask(id);
      showMessage("任务已重新排队");
    });
  }

  async function clearFinishedTasks() {
    await runOperation(async () => {
      const result = await window.jobWorkbench.clearFinishedTasks();
      showMessage(result.message);
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
  const candidateIds =
    collectorPreview?.candidates.map(
      (candidate) => candidate.candidate.sourceKey,
    ) || [];
  const allCandidatesSelected =
    candidateIds.length > 0 &&
    candidateIds.every((id) => selectedCandidates.has(id));
  const activeCollectorTask = tasks.find(
    (task) =>
      task.type === "collector" &&
      (task.status === "queued" || task.status === "running"),
  );
  const lastCollectorTask = tasks.find((task) => task.type === "collector");
  const copy = viewCopy[view];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <strong>求职工作台</strong>
            <small>M2 · Collector Worker</small>
          </div>
        </div>
        <nav>
          <button
            className={view === "jobs" ? "active" : ""}
            onClick={() => setView("jobs")}
          >
            职位池
          </button>
          <button
            className={view === "collector" ? "active" : ""}
            onClick={() => setView("collector")}
          >
            采集中心
            {collectorPreview?.counts.total ? (
              <span className="nav-count">{collectorPreview.counts.total}</span>
            ) : null}
          </button>
          <button
            className={view === "tasks" ? "active" : ""}
            onClick={() => setView("tasks")}
          >
            任务中心
          </button>
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
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="muted">{copy.description}</p>
          </div>
          <div className="top-actions">
            {view === "jobs" ? (
              <>
                <button onClick={() => void migrate()} disabled={busy}>
                  迁移数据库
                </button>
                <button onClick={() => void backup()} disabled={busy}>
                  后台备份
                </button>
                <button onClick={() => void restoreBackup()} disabled={busy}>
                  恢复备份
                </button>
                <button onClick={() => void exportResume()} disabled={busy}>
                  导出简历 PDF
                </button>
                <button
                  className="primary"
                  onClick={() => setShowAddDialog(true)}
                >
                  手动添加岗位
                </button>
              </>
            ) : view === "collector" ? (
              <>
                <button
                  onClick={() => void openCollectorBrowser()}
                  disabled={busy}
                >
                  启动专用 Edge
                </button>
                <button
                  onClick={() => void runOperation(async () => {
                    setCollectorStatus(
                      await window.jobWorkbench.getCollectorStatus(),
                    );
                  })}
                  disabled={busy}
                >
                  刷新连接
                </button>
                <button
                  className="primary"
                  onClick={() => void startCollector()}
                  disabled={busy || Boolean(activeCollectorTask)}
                >
                  {activeCollectorTask ? "采集进行中" : "开始采集"}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => void backup()} disabled={busy}>
                  新建备份任务
                </button>
                <button onClick={() => void clearFinishedTasks()} disabled={busy}>
                  清理已完成记录
                </button>
              </>
            )}
          </div>
        </header>

        <div hidden={view !== "jobs"}>
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
        </div>

        <section
          hidden={view !== "collector"}
          className="collector-center"
        >
          <section className="collector-metrics">
            <article>
              <span>专用 Edge</span>
              <strong
                className={collectorStatus?.edgeRunning ? "online" : ""}
              >
                {collectorStatus?.edgeRunning ? "已连接" : "未连接"}
              </strong>
            </article>
            <article>
              <span>待预览候选</span>
              <strong>{collectorPreview?.counts.total ?? 0}</strong>
            </article>
            <article>
              <span>职位池中没有</span>
              <strong>{collectorPreview?.counts.newInJobs ?? 0}</strong>
            </article>
            <article>
              <span>已有岗位更新</span>
              <strong>{collectorPreview?.counts.existingInJobs ?? 0}</strong>
            </article>
          </section>

          <section className="panel collector-setup">
            <div className="collector-intro">
              <div>
                <p className="eyebrow">SAFE COLLECTION</p>
                <h2>采集条件</h2>
                <p className="muted">
                  Worker 使用独立 Edge 资料目录，不读取 Cookie，不自动投递或发送消息。
                </p>
              </div>
              <div
                className={`connection-pill ${
                  collectorStatus?.edgeRunning ? "connected" : ""
                }`}
              >
                <span className="dot" />
                {collectorStatus?.edgeRunning
                  ? "Edge 调试连接正常"
                  : "请先启动专用 Edge 并扫码登录"}
              </div>
            </div>

            <div className="collector-form">
              <fieldset>
                <legend>目标城市</legend>
                <div className="city-options">
                  {collectorCities.map((city) => (
                    <label key={city.code}>
                      <input
                        type="checkbox"
                        checked={collectorRequest.cities.some(
                          (selectedCity) =>
                            selectedCity.code === city.code,
                        )}
                        onChange={(event) =>
                          toggleCollectorCity(
                            city.code,
                            event.target.checked,
                          )
                        }
                      />
                      {city.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                搜索关键词（每行一个）
                <textarea
                  rows={4}
                  value={collectorQueriesText}
                  onChange={(event) =>
                    setCollectorQueriesText(event.target.value)
                  }
                />
              </label>
              <div className="collector-number-grid">
                <label>
                  每个条件页数
                  <input
                    type="number"
                    min={1}
                    max={3}
                    value={collectorRequest.pagesPerQuery}
                    onChange={(event) =>
                      setCollectorRequest({
                        ...collectorRequest,
                        pagesPerQuery: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  本轮请求上限
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={collectorRequest.maxSearchRequests}
                    onChange={(event) =>
                      setCollectorRequest({
                        ...collectorRequest,
                        maxSearchRequests: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  详情读取上限
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={collectorRequest.detailLimit}
                    onChange={(event) =>
                      setCollectorRequest({
                        ...collectorRequest,
                        detailLimit: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  请求间隔（毫秒）
                  <input
                    type="number"
                    min={3500}
                    max={15000}
                    step={500}
                    value={collectorRequest.requestDelayMs}
                    onChange={(event) =>
                      setCollectorRequest({
                        ...collectorRequest,
                        requestDelayMs: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="safety-note">
                遇到登录失效、环境异常、访问频繁或验证码提示时，采集会立即停止。
                请保持低频使用，并优先在 BOSS 客户端或网页中人工查看岗位。
              </div>
            </div>

            {activeCollectorTask ? (
              <div className="active-collector-task">
                <div>
                  <strong>采集任务运行中</strong>
                  <span>{activeCollectorTask.progress}%</span>
                </div>
                <div className="progress-line">
                  <span
                    style={{ width: `${activeCollectorTask.progress}%` }}
                  />
                </div>
                <button
                  className="danger"
                  onClick={() => void cancelTask(activeCollectorTask.id)}
                  disabled={busy}
                >
                  停止采集
                </button>
              </div>
            ) : lastCollectorTask?.status === "failed" ? (
              <div className="collector-last-result failed">
                <strong>最近一次采集失败</strong>
                <p>{lastCollectorTask.error}</p>
                <button
                  onClick={() => void retryTask(lastCollectorTask.id)}
                  disabled={busy}
                >
                  重试采集
                </button>
              </div>
            ) : lastCollectorTask?.status === "succeeded" ? (
              <div className="collector-last-result">
                最近一次采集抓取{" "}
                {String(lastCollectorTask.result.captured ?? 0)} 个岗位，新增预览{" "}
                {String(lastCollectorTask.result.addedToPreview ?? 0)} 个。
              </div>
            ) : null}
          </section>

          <section className="panel collector-preview">
            <div className="candidate-heading">
              <div>
                <p className="eyebrow">CANDIDATE REVIEW</p>
                <h2>候选岗位预览</h2>
                <p className="muted">
                  采集结果先进入暂存区。确认后才会写入正式职位池；已有岗位只更新描述和来源字段。
                </p>
              </div>
              <span className="status-badge">
                新增 {collectorPreview?.counts.newInJobs ?? 0} · 已有{" "}
                {collectorPreview?.counts.existingInJobs ?? 0}
              </span>
            </div>
            {collectorPreview?.candidates.length ? (
              <>
                <div className="list-head candidate-actions">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={allCandidatesSelected}
                      onChange={() =>
                        setSelectedCandidates(
                          allCandidatesSelected
                            ? new Set()
                            : new Set(candidateIds),
                        )
                      }
                    />
                    <span>全选</span>
                  </label>
                  <span className="muted">
                    已选 {selectedCandidates.size} 个
                  </span>
                  <button
                    onClick={() => void dismissCandidates()}
                    disabled={!selectedCandidates.size || busy}
                  >
                    忽略选中
                  </button>
                  <button
                    className="primary"
                    onClick={() => void importCandidates()}
                    disabled={!selectedCandidates.size || busy}
                  >
                    导入选中岗位
                  </button>
                </div>
                <div className="candidate-list">
                  {collectorPreview.candidates.map((item) => {
                    const candidate = item.candidate;
                    return (
                      <article
                        className={`candidate-card ${
                          selectedCandidates.has(candidate.sourceKey)
                            ? "selected"
                            : ""
                        }`}
                        key={candidate.sourceKey}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCandidates.has(
                            candidate.sourceKey,
                          )}
                          onChange={() =>
                            toggleCandidate(candidate.sourceKey)
                          }
                          aria-label={`选择候选 ${candidate.title}`}
                        />
                        <div>
                          <div className="job-title">
                            <h3>{candidate.title}</h3>
                            <span>{candidate.salary || "薪资未填"}</span>
                          </div>
                          <p className="company">
                            {candidate.company} · {candidate.city}
                            {candidate.district
                              ? ` · ${candidate.district}`
                              : ""}
                          </p>
                          <p className="job-meta">
                            {candidate.experience || "经验未填"} ·{" "}
                            {candidate.degree || "学历未填"} ·{" "}
                            {candidate.category} · 匹配分 {candidate.score}
                          </p>
                          {candidate.reason ? (
                            <p className="candidate-reason">
                              {candidate.reason}
                            </p>
                          ) : null}
                          {candidate.risks.length ? (
                            <ul className="candidate-risks">
                              {candidate.risks.map((risk) => (
                                <li key={risk}>{risk}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className="candidate-side">
                          <span
                            className={
                              item.existsInJobs ? "existing" : "new"
                            }
                          >
                            {item.existsInJobs ? "更新已有" : "新增岗位"}
                          </span>
                          {item.seenCount > 1 ? (
                            <small>第 {item.seenCount} 次采集</small>
                          ) : null}
                          {candidate.link ? (
                            <a
                              href={candidate.link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              打开 BOSS
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty">
                <strong>暂无待预览岗位</strong>
                <p>先完成专用 Edge 登录，再启动一次低频采集。</p>
              </div>
            )}
          </section>
        </section>

        <section hidden={view !== "tasks"} className="panel task-center">
          <div className="task-summary">
            <div>
              <p className="eyebrow">DURABLE TASKS</p>
              <h2>任务历史</h2>
              <p className="muted">
                运行中的任务在应用重启后会标记为已中断，可手动重试。
              </p>
            </div>
            <span className="status-badge">
              待处理 {dashboard?.pendingTasks ?? 0}
            </span>
          </div>
          {tasks.length ? (
            <div className="task-list">
              {tasks.map((task) => {
                const isActive =
                  task.status === "queued" || task.status === "running";
                return (
                  <article className="task-card" key={task.id}>
                    <div className="task-head">
                      <div>
                        <strong>
                          {task.type === "backup"
                            ? "数据库备份"
                            : task.type === "collector"
                              ? "BOSS 候选采集"
                              : task.type}
                        </strong>
                        <p className="muted">
                          {task.id} · {new Date(task.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`task-status status-${task.status}`}
                      >
                        {taskStatusLabels[task.status]}
                      </span>
                    </div>
                    <div className="progress-line">
                      <span style={{ width: `${task.progress}%` }} />
                    </div>
                    <div className="task-meta">
                      <span>进度 {task.progress}%</span>
                      <span>尝试 {task.attempts + 1} 次</span>
                      {task.finishedAt ? (
                        <span>
                          完成于 {new Date(task.finishedAt).toLocaleTimeString()}
                        </span>
                      ) : null}
                    </div>
                    {task.error ? (
                      <p className="task-error">{task.error}</p>
                    ) : null}
                    {typeof task.result.path === "string" ? (
                      <p className="task-result">
                        备份文件：<code>{task.result.path}</code>
                      </p>
                    ) : null}
                    {task.type === "collector" &&
                    typeof task.result.captured === "number" ? (
                      <p className="task-result">
                        抓取 {task.result.captured} 个岗位 · 新增预览{" "}
                        {String(task.result.addedToPreview ?? 0)} · 已有岗位{" "}
                        {String(task.result.existingInJobPool ?? 0)}
                      </p>
                    ) : null}
                    <div className="button-row">
                      {isActive ? (
                        <button
                          className="danger"
                          onClick={() => void cancelTask(task.id)}
                          disabled={busy}
                        >
                          取消任务
                        </button>
                      ) : null}
                      {["failed", "cancelled", "interrupted"].includes(
                        task.status,
                      ) ? (
                        <button
                          onClick={() => void retryTask(task.id)}
                          disabled={busy}
                        >
                          重试
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <strong>暂无任务</strong>
              <p>创建一个后台备份任务，或在采集中心启动 BOSS 候选采集。</p>
            </div>
          )}
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
