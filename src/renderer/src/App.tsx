import { useEffect, useMemo, useState } from "react";
import type {
  AiAnalysisRecord,
  AiProviderKind,
  AiSettingsView,
  AiUsageSummary,
  CollectorPreviewData,
  CollectorRequest,
  CollectorStatus,
  ContactFields,
  CrmOverview,
  CrmWorkspace,
  DashboardData,
  FollowUpFields,
  FollowUpRecord,
  FollowUpStatus,
  InterviewFields,
  InterviewRecord,
  JobDetail,
  JobFilters,
  JobRecord,
  JobRecordUpdate,
  JobStatus,
  ManualJobInput,
  MigrationPreview,
  ResumeFactFields,
  ResumeFactKind,
  ResumeFactRecord,
  ResumeProfileInput,
  ResumeVersionFields,
  ResumeVersionRecord,
  ResumeWorkspace,
  SavedView,
  SystemHealth,
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

const aiProviderDefaults: Record<
  AiProviderKind,
  { baseUrl: string; model: string }
> = {
  local: { baseUrl: "", model: "local-rules-v1" },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  dashscope: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  custom: { baseUrl: "", model: "" },
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
  ai: {
    eyebrow: "AI EVIDENCE LAB",
    title: "AI 分析",
    description: "结构化要求、事实匹配、风险证据与面试准备",
  },
  resume: {
    eyebrow: "RESUME FACT LIBRARY",
    title: "简历",
    description: "已核实事实、岗位版本组合与 PDF 导出",
  },
  followup: {
    eyebrow: "JOB SEARCH CRM",
    title: "跟进",
    description: "联系人、待办提醒、面试安排与沟通时间线",
  },
  system: {
    eyebrow: "SYSTEM HEALTH",
    title: "系统",
    description: "托盘、通知、健康检查、备份与脱敏诊断",
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

const aiRequirementStatusLabels = {
  satisfied: "已满足",
  partial: "部分满足",
  missing: "缺失",
  unknown: "待核实",
} as const;

const aiSeverityLabels = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
} as const;

const resumeFactKindOptions: ResumeFactKind[] = [
  "教育经历",
  "实习经历",
  "项目经历",
  "技能",
  "证书",
  "奖项",
  "校园经历",
];

const emptyResumeProfile: ResumeProfileInput = {
  fullName: "",
  phone: "",
  email: "",
  currentCity: "",
  targetRoles: [],
  summary: "",
};

const emptyResumeFact: ResumeFactFields = {
  kind: "项目经历",
  title: "",
  organization: "",
  role: "",
  startDate: "",
  endDate: "",
  location: "",
  bullets: [],
  skills: [],
  evidence: "",
  verified: false,
  sortOrder: 0,
};

const emptyResumeVersion: ResumeVersionFields = {
  name: "",
  targetRole: "",
  template: "general",
  summary: "",
  selectedFactIds: [],
  includeUnverified: false,
};

function toLocalDateTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalDateTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function defaultFollowUpTime(): string {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  date.setHours(10, 0, 0, 0);
  return toLocalDateTime(date.toISOString());
}

const emptyContact: ContactFields = {
  name: "",
  role: "",
  channel: "BOSS",
  contactInfo: "",
  notes: "",
  lastContactAt: "",
};

const emptyFollowUp: FollowUpFields = {
  title: "",
  dueAt: "",
  status: "pending",
  notes: "",
};

const emptyInterview: InterviewFields = {
  round: "一面",
  scheduledAt: "",
  mode: "视频",
  location: "",
  questions: [],
  reflection: "",
  result: "",
  nextStep: "",
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
    contact_created: "新增联系人",
    contact_updated: "更新联系人",
    contact_deleted: "删除联系人",
    follow_up_saved: "保存跟进",
    follow_up_status: "跟进状态",
    follow_up_deleted: "删除跟进",
    interview_saved: "保存面试",
    interview_deleted: "删除面试",
  };
  return labels[eventType] || eventType;
}

export function App() {
  const [view, setView] = useState<
    "jobs" | "collector" | "ai" | "resume" | "followup" | "system" | "tasks"
  >("jobs");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [filters, setFilters] = useState<JobFilters>(defaultFilters);
  const [views, setViews] = useState<SavedView[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [collectorPreview, setCollectorPreview] =
    useState<CollectorPreviewData | null>(null);
  const [collectorStatus, setCollectorStatus] =
    useState<CollectorStatus | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettingsView | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);
  const [aiAnalyses, setAiAnalyses] = useState<AiAnalysisRecord[]>([]);
  const [aiCurrent, setAiCurrent] = useState<AiAnalysisRecord | null>(null);
  const [selectedAiJobId, setSelectedAiJobId] = useState<string | null>(null);
  const [aiSelectedJob, setAiSelectedJob] = useState<JobRecord | null>(null);
  const [aiForm, setAiForm] = useState<{
    provider: AiProviderKind;
    baseUrl: string;
    model: string;
    dailyRequestLimit: number;
    apiKey: string;
  }>({
    provider: "local",
    baseUrl: "",
    model: "local-rules-v1",
    dailyRequestLimit: 20,
    apiKey: "",
  });
  const [resumeWorkspace, setResumeWorkspace] =
    useState<ResumeWorkspace | null>(null);
  const [resumeProfileForm, setResumeProfileForm] =
    useState<ResumeProfileInput>(emptyResumeProfile);
  const [resumeFactEditor, setResumeFactEditor] = useState<{
    id: string | null;
    fields: ResumeFactFields;
  } | null>(null);
  const [resumeVersionEditor, setResumeVersionEditor] = useState<{
    id: string | null;
    fields: ResumeVersionFields;
  } | null>(null);
  const [resumeFactFilter, setResumeFactFilter] = useState<
    ResumeFactKind | ""
  >("");
  const [selectedResumeVersionId, setSelectedResumeVersionId] =
    useState<string>("");
  const [allActiveJobs, setAllActiveJobs] = useState<JobRecord[]>([]);
  const [crmOverview, setCrmOverview] = useState<CrmOverview | null>(null);
  const [crmWorkspace, setCrmWorkspace] = useState<CrmWorkspace | null>(null);
  const [selectedCrmJobId, setSelectedCrmJobId] = useState<string | null>(
    null,
  );
  const [contactEditor, setContactEditor] = useState<{
    id: string | null;
    fields: ContactFields;
  } | null>(null);
  const [followUpEditor, setFollowUpEditor] = useState<{
    id: string | null;
    fields: FollowUpFields;
  } | null>(null);
  const [interviewEditor, setInterviewEditor] = useState<{
    id: string | null;
    fields: InterviewFields;
  } | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
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
      nextAiSettings,
      nextAiUsage,
      nextAiAnalyses,
      nextResumeWorkspace,
      nextAllActiveJobs,
      nextCrmOverview,
    ] = await Promise.all([
      window.jobWorkbench.getDashboard(),
      window.jobWorkbench.listJobs(nextFilters),
      window.jobWorkbench.listSavedViews(),
      window.jobWorkbench.listTasks(),
      window.jobWorkbench.listCollectorPreview(),
      window.jobWorkbench.getCollectorStatus(),
      window.jobWorkbench.getAiSettings(),
      window.jobWorkbench.getAiUsage(),
      window.jobWorkbench.listAiAnalyses(),
      window.jobWorkbench.getResumeWorkspace(),
      window.jobWorkbench.listJobs({ archived: "active" }),
      window.jobWorkbench.getCrmOverview(),
    ]);
    setDashboard(nextDashboard);
    setJobs(nextJobs);
    setViews(nextViews);
    setTasks(nextTasks);
    setCollectorPreview(nextCollectorPreview);
    setCollectorStatus(nextCollectorStatus);
    setAiSettings(nextAiSettings);
    setAiUsage(nextAiUsage);
    setAiAnalyses(nextAiAnalyses);
    setResumeWorkspace(nextResumeWorkspace);
    setAllActiveJobs(nextAllActiveJobs);
    setCrmOverview(nextCrmOverview);
    if (nextResumeWorkspace.profile) {
      setResumeProfileForm({
        fullName: nextResumeWorkspace.profile.fullName,
        phone: nextResumeWorkspace.profile.phone,
        email: nextResumeWorkspace.profile.email,
        currentCity: nextResumeWorkspace.profile.currentCity,
        targetRoles: nextResumeWorkspace.profile.targetRoles,
        summary: nextResumeWorkspace.profile.summary,
      });
    }
    setSelectedResumeVersionId((current) =>
      nextResumeWorkspace.versions.some((version) => version.id === current)
        ? current
        : nextResumeWorkspace.versions[0]?.id || "",
    );
    setAiForm((current) => ({
      provider: nextAiSettings.provider,
      baseUrl: nextAiSettings.baseUrl,
      model: nextAiSettings.model,
      dailyRequestLimit: nextAiSettings.dailyRequestLimit,
      apiKey:
        current.provider === nextAiSettings.provider ? current.apiKey : "",
    }));
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
    if (selectedAiJobId) {
      const jobStillVisible = nextJobs.some(
        (job) => job.id === selectedAiJobId,
      );
      const [analysis, jobDetail] = await Promise.all([
        window.jobWorkbench.getJobAiAnalysis(selectedAiJobId),
        jobStillVisible
          ? window.jobWorkbench.getJobDetail(selectedAiJobId)
          : Promise.resolve(null),
      ]);
      setAiCurrent(analysis);
      if (jobDetail) setAiSelectedJob(jobDetail.job);
    }
    if (
      selectedCrmJobId &&
      nextAllActiveJobs.some((job) => job.id === selectedCrmJobId)
    ) {
      setCrmWorkspace(
        await window.jobWorkbench.getCrmWorkspace(selectedCrmJobId),
      );
    } else if (selectedCrmJobId) {
      setSelectedCrmJobId(null);
      setCrmWorkspace(null);
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
        window.jobWorkbench.listAiAnalyses(),
        window.jobWorkbench.getAiUsage(),
      ]).then(([
        nextTasks,
        nextDashboard,
        nextCollectorPreview,
        nextAiAnalyses,
        nextAiUsage,
      ]) => {
        setTasks(nextTasks);
        setDashboard(nextDashboard);
        setCollectorPreview(nextCollectorPreview);
        setAiAnalyses(nextAiAnalyses);
        setAiUsage(nextAiUsage);
        if (selectedAiJobId) {
          void window.jobWorkbench
            .getJobAiAnalysis(selectedAiJobId)
            .then(setAiCurrent);
        }
      });
    }, 800);
    return () => window.clearInterval(timer);
  }, [tasks, selectedAiJobId]);

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

  async function openAiAnalysis(jobId?: string) {
    const nextJobId = jobId || selectedAiJobId || jobs[0]?.id || null;
    setSelectedAiJobId(nextJobId);
    if (nextJobId) {
      const [analysis, jobDetail] = await Promise.all([
        window.jobWorkbench.getJobAiAnalysis(nextJobId),
        window.jobWorkbench.getJobDetail(nextJobId),
      ]);
      setAiCurrent(analysis);
      setAiSelectedJob(jobDetail.job);
    } else {
      setAiCurrent(null);
      setAiSelectedJob(null);
    }
    setView("ai");
  }

  async function saveAiProvider() {
    await runOperation(async () => {
      const saved = await window.jobWorkbench.saveAiSettings({
        provider: aiForm.provider,
        baseUrl: aiForm.baseUrl,
        model: aiForm.model,
        dailyRequestLimit: aiForm.dailyRequestLimit,
        ...(aiForm.apiKey.trim() ? { apiKey: aiForm.apiKey.trim() } : {}),
      });
      setAiSettings(saved);
      setAiForm({
        provider: saved.provider,
        baseUrl: saved.baseUrl,
        model: saved.model,
        dailyRequestLimit: saved.dailyRequestLimit,
        apiKey: "",
      });
      showMessage("AI Provider 设置已保存");
    });
  }

  async function clearAiKey() {
    const confirmed = window.confirm("清除已加密保存的 AI API Key？");
    if (!confirmed) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.clearAiApiKey();
      setAiForm((current) => ({ ...current, apiKey: "" }));
      showMessage(result.message);
    });
  }

  async function startAiAnalysis(force = false) {
    if (!selectedAiJobId) {
      showMessage("请先选择岗位");
      return;
    }
    await runOperation(async () => {
      await window.jobWorkbench.createAiAnalysisTask({
        jobId: selectedAiJobId,
        force,
      });
      setView("tasks");
      showMessage("AI 分析任务已创建");
    });
  }

  async function deleteAiAnalysis(id: string) {
    const confirmed = window.confirm("删除这条 AI 分析记录？");
    if (!confirmed) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.deleteAiAnalysis(id);
      showMessage(result.message);
    });
  }

  async function saveResumeProfile() {
    if (!resumeProfileForm.fullName.trim()) {
      showMessage("姓名不能为空");
      return;
    }
    await runOperation(async () => {
      await window.jobWorkbench.saveResumeProfile(resumeProfileForm);
      showMessage("个人资料已保存");
    });
  }

  function openNewResumeFact() {
    setResumeFactEditor({
      id: null,
      fields: {
        ...emptyResumeFact,
        sortOrder: (resumeWorkspace?.facts.length || 0) * 10 + 10,
      },
    });
  }

  function openResumeFact(fact: ResumeFactRecord) {
    setResumeFactEditor({
      id: fact.id,
      fields: {
        kind: fact.kind,
        title: fact.title,
        organization: fact.organization,
        role: fact.role,
        startDate: fact.startDate,
        endDate: fact.endDate,
        location: fact.location,
        bullets: [...fact.bullets],
        skills: [...fact.skills],
        evidence: fact.evidence,
        verified: fact.verified,
        sortOrder: fact.sortOrder,
      },
    });
  }

  async function saveResumeFact() {
    if (!resumeFactEditor) return;
    if (!resumeFactEditor.fields.title.trim()) {
      showMessage("事实标题不能为空");
      return;
    }
    await runOperation(async () => {
      await window.jobWorkbench.saveResumeFact(
        resumeFactEditor.id,
        resumeFactEditor.fields,
      );
      setResumeFactEditor(null);
      showMessage("简历事实已保存");
    });
  }

  async function toggleResumeFactVerified(fact: ResumeFactRecord) {
    await runOperation(async () => {
      await window.jobWorkbench.setResumeFactVerified(
        fact.id,
        !fact.verified,
      );
      showMessage(fact.verified ? "已取消核实" : "事实已核实");
    });
  }

  async function deleteResumeFact(fact: ResumeFactRecord) {
    const confirmed = window.confirm(
      `删除“${fact.title}”？已有简历版本中的该事实引用也会移除。`,
    );
    if (!confirmed) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.deleteResumeFact(fact.id);
      showMessage(result.message);
    });
  }

  function openNewResumeVersion() {
    setResumeVersionEditor({
      id: null,
      fields: {
        ...emptyResumeVersion,
        name: "默认求职版本",
        targetRole: resumeProfileForm.targetRoles[0] || "",
        selectedFactIds:
          resumeWorkspace?.facts
            .filter((fact) => fact.verified)
            .map((fact) => fact.id) || [],
      },
    });
  }

  function openResumeVersion(version: ResumeVersionRecord) {
    setResumeVersionEditor({
      id: version.id,
      fields: {
        name: version.name,
        targetRole: version.targetRole,
        template: version.template,
        summary: version.summary,
        selectedFactIds: [...version.selectedFactIds],
        includeUnverified: version.includeUnverified,
      },
    });
  }

  async function saveResumeVersion() {
    if (!resumeVersionEditor) return;
    if (!resumeVersionEditor.fields.name.trim()) {
      showMessage("版本名称不能为空");
      return;
    }
    await runOperation(async () => {
      const saved = await window.jobWorkbench.saveResumeVersion(
        resumeVersionEditor.id,
        resumeVersionEditor.fields,
      );
      setSelectedResumeVersionId(saved.id);
      setResumeVersionEditor(null);
      showMessage("简历版本已保存");
    });
  }

  async function deleteResumeVersion(version: ResumeVersionRecord) {
    const confirmed = window.confirm(`删除简历版本“${version.name}”？`);
    if (!confirmed) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.deleteResumeVersion(version.id);
      showMessage(result.message);
    });
  }

  async function exportResumeVersion(versionId?: string | null) {
    await runOperation(async () => {
      const destination = await window.jobWorkbench.exportResumePdf(
        versionId || selectedResumeVersionId || null,
      );
      if (destination) showMessage(`简历已导出：${destination}`);
    });
  }

  async function openCrm(jobId?: string) {
    const nextJobId =
      jobId || selectedCrmJobId || allActiveJobs[0]?.id || null;
    setSelectedCrmJobId(nextJobId);
    if (nextJobId) {
      setCrmWorkspace(await window.jobWorkbench.getCrmWorkspace(nextJobId));
    } else {
      setCrmWorkspace(null);
    }
    setView("followup");
  }

  function startNewContact() {
    setContactEditor({
      id: null,
      fields: { ...emptyContact, lastContactAt: toLocalDateTime(new Date().toISOString()) },
    });
  }

  function editContact(contact: CrmWorkspace["contacts"][number]) {
    setContactEditor({
      id: contact.id,
      fields: {
        name: contact.name,
        role: contact.role,
        channel: contact.channel,
        contactInfo: contact.contactInfo,
        notes: contact.notes,
        lastContactAt: toLocalDateTime(contact.lastContactAt),
      },
    });
  }

  async function saveContact() {
    if (!contactEditor || !selectedCrmJobId) return;
    if (!contactEditor.fields.name.trim()) {
      showMessage("联系人名称不能为空");
      return;
    }
    await runOperation(async () => {
      await window.jobWorkbench.saveJobContact(
        selectedCrmJobId,
        contactEditor.id,
        {
          ...contactEditor.fields,
          lastContactAt: fromLocalDateTime(
            contactEditor.fields.lastContactAt,
          ),
        },
      );
      setContactEditor(null);
      showMessage("联系人已保存");
    });
  }

  function startNewFollowUp() {
    setFollowUpEditor({
      id: null,
      fields: {
        ...emptyFollowUp,
        title: "确认招聘进度",
        dueAt: defaultFollowUpTime(),
      },
    });
  }

  function editFollowUp(followUp: FollowUpRecord) {
    setFollowUpEditor({
      id: followUp.id,
      fields: {
        title: followUp.title,
        dueAt: toLocalDateTime(followUp.dueAt),
        status: followUp.status,
        notes: followUp.notes,
      },
    });
  }

  async function saveFollowUp() {
    if (!followUpEditor || !selectedCrmJobId) return;
    if (!followUpEditor.fields.dueAt) {
      showMessage("请选择跟进时间");
      return;
    }
    await runOperation(async () => {
      await window.jobWorkbench.saveFollowUp(
        selectedCrmJobId,
        followUpEditor.id,
        {
          ...followUpEditor.fields,
          dueAt: fromLocalDateTime(followUpEditor.fields.dueAt),
        },
      );
      setFollowUpEditor(null);
      showMessage("跟进任务已保存");
    });
  }

  async function updateFollowUpStatus(
    followUp: FollowUpRecord,
    status: FollowUpStatus,
  ) {
    await runOperation(async () => {
      await window.jobWorkbench.setFollowUpStatus(followUp.id, status);
      showMessage(status === "completed" ? "跟进已完成" : "跟进状态已更新");
    });
  }

  function startNewInterview() {
    setInterviewEditor({
      id: null,
      fields: {
        ...emptyInterview,
        scheduledAt: defaultFollowUpTime(),
      },
    });
  }

  function editInterview(interview: InterviewRecord) {
    setInterviewEditor({
      id: interview.id,
      fields: {
        round: interview.round,
        scheduledAt: toLocalDateTime(interview.scheduledAt),
        mode: interview.mode,
        location: interview.location,
        questions: [...interview.questions],
        reflection: interview.reflection,
        result: interview.result,
        nextStep: interview.nextStep,
      },
    });
  }

  async function saveInterview() {
    if (!interviewEditor || !selectedCrmJobId) return;
    await runOperation(async () => {
      await window.jobWorkbench.saveInterview(
        selectedCrmJobId,
        interviewEditor.id,
        {
          ...interviewEditor.fields,
          scheduledAt: fromLocalDateTime(
            interviewEditor.fields.scheduledAt,
          ),
        },
      );
      setInterviewEditor(null);
      showMessage("面试记录已保存");
    });
  }

  async function deleteContact(id: string) {
    if (!window.confirm("删除这个联系人？")) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.deleteJobContact(id);
      showMessage(result.message);
    });
  }

  async function deleteFollowUp(id: string) {
    if (!window.confirm("删除这条跟进任务？")) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.deleteFollowUp(id);
      showMessage(result.message);
    });
  }

  async function deleteInterview(id: string) {
    if (!window.confirm("删除这条面试记录？")) return;
    await runOperation(async () => {
      const result = await window.jobWorkbench.deleteInterview(id);
      showMessage(result.message);
    });
  }

  async function refreshSystemHealth() {
    setSystemHealth(await window.jobWorkbench.getSystemHealth());
  }

  async function openSystemPage() {
    await refreshSystemHealth();
    setView("system");
  }

  async function setNotificationsEnabled(enabled: boolean) {
    await runOperation(async () => {
      const result = await window.jobWorkbench.setNotificationsEnabled(enabled);
      await refreshSystemHealth();
      showMessage(result.message);
    });
  }

  async function runReminderCheck() {
    await runOperation(async () => {
      const result = await window.jobWorkbench.runReminderCheck();
      await refreshSystemHealth();
      showMessage(
        result.suppressed
          ? `已检查 ${result.due} 个到期跟进；测试模式已抑制弹窗`
          : result.delivered
            ? `已发送 ${result.delivered} 条到期提醒`
            : result.due
              ? "到期提醒今天已经发送过"
              : "当前没有到期跟进",
      );
    });
  }

  async function openDataDirectory() {
    await runOperation(async () => {
      const result = await window.jobWorkbench.openDataDirectory();
      showMessage(result.message);
    });
  }

  async function exportDiagnostics() {
    await runOperation(async () => {
      const destination = await window.jobWorkbench.exportDiagnostics();
      if (destination) showMessage(`诊断报告已保存：${destination}`);
    });
  }

  async function setAutoLaunch(enabled: boolean) {
    await runOperation(async () => {
      const result = await window.jobWorkbench.setAutoLaunchEnabled(enabled);
      await refreshSystemHealth();
      showMessage(result.message);
    });
  }

  async function checkForUpdates() {
    await runOperation(async () => {
      const info = await window.jobWorkbench.checkForUpdates(true);
      await refreshSystemHealth();
      showMessage(
        info.available
          ? `发现新版本 ${info.latestTag}`
          : `当前已是可用版本 ${info.currentVersion}`,
      );
    });
  }

  async function setUpdateAutoCheck(enabled: boolean) {
    await runOperation(async () => {
      const result = await window.jobWorkbench.setUpdateAutoCheck(enabled);
      await refreshSystemHealth();
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
  const selectedAiJob =
    aiSelectedJob ||
    jobs.find((job) => job.id === selectedAiJobId) ||
    null;
  const activeAiTask = tasks.find(
    (task) =>
      task.type === "ai-analysis" &&
      (task.status === "queued" || task.status === "running"),
  );
  const aiResult =
    aiCurrent?.status === "succeeded" ? aiCurrent.result : null;
  const activeResumeVersion =
    resumeWorkspace?.versions.find(
      (version) => version.id === selectedResumeVersionId,
    ) ||
    resumeWorkspace?.versions[0] ||
    null;
  const filteredResumeFacts =
    resumeWorkspace?.facts.filter(
      (fact) => !resumeFactFilter || fact.kind === resumeFactFilter,
    ) || [];
  const selectedCrmJob =
    crmWorkspace?.job ||
    allActiveJobs.find((job) => job.id === selectedCrmJobId) ||
    null;
  const pendingCrmFollowUps =
    crmWorkspace?.followUps.filter(
      (followUp) => followUp.status === "pending",
    ) || [];
  const copy = viewCopy[view];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <strong>求职工作台</strong>
            <small>M2 · Career OS</small>
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
            className={view === "ai" ? "active" : ""}
            onClick={() => void openAiAnalysis()}
          >
            AI 分析
          </button>
          <button
            className={view === "resume" ? "active" : ""}
            onClick={() => setView("resume")}
          >
            简历
          </button>
          <button
            className={view === "followup" ? "active" : ""}
            onClick={() => void openCrm()}
          >
            跟进
            {crmOverview?.metrics.overdue ? (
              <span className="nav-count">{crmOverview.metrics.overdue}</span>
            ) : null}
          </button>
          <button
            className={view === "tasks" ? "active" : ""}
            onClick={() => setView("tasks")}
          >
            任务中心
          </button>
          <button
            className={view === "system" ? "active" : ""}
            onClick={() => void openSystemPage()}
          >
            系统
          </button>
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
                <button
                  onClick={() => void exportResumeVersion(null)}
                  disabled={busy || !resumeWorkspace?.stats.readyForAi}
                >
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
            ) : view === "ai" ? (
              <>
                <button
                  onClick={() => void openAiAnalysis()}
                  disabled={busy || !jobs.length}
                >
                  刷新分析
                </button>
                <button
                  className="primary"
                  onClick={() => void startAiAnalysis(Boolean(aiResult))}
                  disabled={
                    busy ||
                    !selectedAiJobId ||
                    Boolean(activeAiTask)
                  }
                >
                  {activeAiTask
                    ? "分析进行中"
                    : aiResult
                      ? "重新分析"
                      : "开始分析"}
                </button>
              </>
            ) : view === "resume" ? (
              <>
                <button
                  onClick={() => void saveResumeProfile()}
                  disabled={busy}
                >
                  保存个人资料
                </button>
                <button onClick={openNewResumeFact} disabled={busy}>
                  新建事实
                </button>
                <button onClick={openNewResumeVersion} disabled={busy}>
                  新建版本
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    void exportResumeVersion(
                      selectedResumeVersionId || null,
                    )
                  }
                  disabled={
                    busy ||
                    !activeResumeVersion ||
                    !activeResumeVersion.selectedFactIds.length
                  }
                >
                  导出当前版本
                </button>
              </>
            ) : view === "followup" ? (
              <>
                <button
                  onClick={() =>
                    void runOperation(async () => {
                      setCrmOverview(
                        await window.jobWorkbench.getCrmOverview(),
                      );
                    })
                  }
                  disabled={busy}
                >
                  刷新提醒
                </button>
                <button
                  onClick={startNewContact}
                  disabled={busy || !selectedCrmJobId}
                >
                  新增联系人
                </button>
                <button
                  onClick={startNewFollowUp}
                  disabled={busy || !selectedCrmJobId}
                >
                  新增跟进
                </button>
                <button
                  className="primary"
                  onClick={startNewInterview}
                  disabled={busy || !selectedCrmJobId}
                >
                  新增面试
                </button>
              </>
            ) : view === "system" ? (
              <>
                <button
                  onClick={() => void refreshSystemHealth()}
                  disabled={busy}
                >
                  重新检查
                </button>
                <button
                  onClick={() => void runReminderCheck()}
                  disabled={busy}
                >
                  立即检查提醒
                </button>
                <button
                  onClick={() => void openDataDirectory()}
                  disabled={busy}
                >
                  打开数据目录
                </button>
                <button
                  className="primary"
                  onClick={() => void exportDiagnostics()}
                  disabled={busy}
                >
                  导出诊断报告
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
                      <button
                        onClick={() =>
                          void openAiAnalysis(detail.job.id)
                        }
                      >
                        AI 分析
                      </button>
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

        <section hidden={view !== "resume"} className="resume-center">
          <section className="resume-stats">
            <article>
              <span>事实总数</span>
              <strong>{resumeWorkspace?.stats.totalFacts ?? 0}</strong>
            </article>
            <article>
              <span>已核实</span>
              <strong>{resumeWorkspace?.stats.verifiedFacts ?? 0}</strong>
            </article>
            <article>
              <span>简历版本</span>
              <strong>{resumeWorkspace?.stats.versionCount ?? 0}</strong>
            </article>
            <article>
              <span>AI 可用事实</span>
              <strong
                className={
                  resumeWorkspace?.stats.readyForAi ? "ready" : ""
                }
              >
                {resumeWorkspace?.stats.readyForAi ? "已就绪" : "待补充"}
              </strong>
            </article>
          </section>

          <section className="panel resume-profile-panel">
            <div className="resume-section-head">
              <div>
                <p className="eyebrow">RESUME PROFILE</p>
                <h2>个人资料</h2>
                <p className="muted">
                  联系方式只会写入你主动导出的 PDF，不会发送给 AI。
                </p>
              </div>
              <span className="status-badge">
                {resumeWorkspace?.profile
                  ? `更新于 ${new Date(
                      resumeWorkspace.profile.updatedAt,
                    ).toLocaleString()}`
                  : "尚未填写"}
              </span>
            </div>
            <div className="resume-profile-grid">
              <label>
                姓名
                <input
                  value={resumeProfileForm.fullName}
                  onChange={(event) =>
                    setResumeProfileForm({
                      ...resumeProfileForm,
                      fullName: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                电话
                <input
                  value={resumeProfileForm.phone}
                  onChange={(event) =>
                    setResumeProfileForm({
                      ...resumeProfileForm,
                      phone: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                邮箱
                <input
                  value={resumeProfileForm.email}
                  onChange={(event) =>
                    setResumeProfileForm({
                      ...resumeProfileForm,
                      email: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                当前城市
                <input
                  value={resumeProfileForm.currentCity}
                  onChange={(event) =>
                    setResumeProfileForm({
                      ...resumeProfileForm,
                      currentCity: event.target.value,
                    })
                  }
                />
              </label>
              <label className="resume-target-roles">
                目标岗位（用顿号或逗号分隔）
                <input
                  value={resumeProfileForm.targetRoles.join("、")}
                  onChange={(event) =>
                    setResumeProfileForm({
                      ...resumeProfileForm,
                      targetRoles: event.target.value
                        .split(/[、,，]/)
                        .map((role) => role.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="resume-summary-field">
                个人概述
                <textarea
                  rows={3}
                  value={resumeProfileForm.summary}
                  onChange={(event) =>
                    setResumeProfileForm({
                      ...resumeProfileForm,
                      summary: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          </section>

          <div className="resume-workspace">
            <section className="panel resume-facts-panel">
              <div className="resume-section-head">
                <div>
                  <p className="eyebrow">VERIFIED FACTS</p>
                  <h2>事实库</h2>
                  <p className="muted">
                    项目、职责、指标和技能必须来自真实材料；核实后才默认进入版本和 AI。
                  </p>
                </div>
                <button onClick={openNewResumeFact} disabled={busy}>
                  新建事实
                </button>
              </div>
              <div className="resume-filter-row">
                <select
                  value={resumeFactFilter}
                  onChange={(event) =>
                    setResumeFactFilter(
                      event.target.value as ResumeFactKind | "",
                    )
                  }
                >
                  <option value="">全部事实</option>
                  {resumeFactKindOptions.map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
                <span className="muted">
                  当前显示 {filteredResumeFacts.length} 条
                </span>
              </div>
              {filteredResumeFacts.length ? (
                <div className="resume-fact-list">
                  {filteredResumeFacts.map((fact) => (
                    <article
                      className={`resume-fact-card ${
                        fact.verified ? "verified" : "unverified"
                      }`}
                      key={fact.id}
                    >
                      <div className="resume-fact-head">
                        <div>
                          <span className="fact-kind">{fact.kind}</span>
                          <h3>{fact.title}</h3>
                          <p>
                            {[fact.organization, fact.role]
                              .filter(Boolean)
                              .join(" · ") || "未填写组织或角色"}
                          </p>
                        </div>
                        <span
                          className={`fact-verification ${
                            fact.verified ? "verified" : ""
                          }`}
                        >
                          {fact.verified ? "已核实" : "未核实"}
                        </span>
                      </div>
                      <p className="fact-date">
                        {[fact.startDate, fact.endDate]
                          .filter(Boolean)
                          .join(" - ") || "时间未填写"}
                        {fact.location ? ` · ${fact.location}` : ""}
                      </p>
                      {fact.bullets.length ? (
                        <ul className="fact-bullets">
                          {fact.bullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                          ))}
                        </ul>
                      ) : null}
                      {fact.skills.length ? (
                        <div className="fact-skills">
                          {fact.skills.map((skill) => (
                            <span key={skill}>{skill}</span>
                          ))}
                        </div>
                      ) : null}
                      {fact.evidence ? (
                        <p className="fact-evidence">
                          依据：{fact.evidence}
                        </p>
                      ) : null}
                      <div className="fact-actions">
                        <button onClick={() => openResumeFact(fact)}>
                          编辑
                        </button>
                        <button
                          onClick={() =>
                            void toggleResumeFactVerified(fact)
                          }
                          disabled={busy}
                        >
                          {fact.verified ? "取消核实" : "确认核实"}
                        </button>
                        <button
                          className="danger"
                          onClick={() => void deleteResumeFact(fact)}
                          disabled={busy}
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty resume-empty">
                  <strong>
                    {resumeWorkspace?.stats.totalFacts
                      ? "当前分类没有事实"
                      : "还没有简历事实"}
                  </strong>
                  <p>
                    先录入教育、实习、项目和校园经历，再标记为已核实。
                  </p>
                  <button
                    className="primary"
                    onClick={openNewResumeFact}
                    disabled={busy}
                  >
                    新建第一条事实
                  </button>
                </div>
              )}
            </section>

            <aside className="panel resume-versions-panel">
              <div className="resume-section-head">
                <div>
                  <p className="eyebrow">TAILORED VERSIONS</p>
                  <h2>版本组合</h2>
                </div>
                <button onClick={openNewResumeVersion} disabled={busy}>
                  新建版本
                </button>
              </div>
              {resumeWorkspace?.versions.length ? (
                <div className="resume-version-list">
                  {resumeWorkspace.versions.map((version) => (
                    <button
                      className={
                        activeResumeVersion?.id === version.id
                          ? "active"
                          : ""
                      }
                      key={version.id}
                      onClick={() => setSelectedResumeVersionId(version.id)}
                    >
                      <strong>{version.name}</strong>
                      <span>{version.targetRole || "未设置目标岗位"}</span>
                      <small>
                        {version.selectedFactIds.length} 条事实 ·{" "}
                        {version.includeUnverified
                          ? "包含未核实"
                          : "仅已核实"}
                      </small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">还没有简历版本。</p>
              )}

              {activeResumeVersion ? (
                <div className="active-resume-version">
                  <div>
                    <span>当前版本</span>
                    <strong>{activeResumeVersion.name}</strong>
                  </div>
                  {activeResumeVersion.summary ? (
                    <p>{activeResumeVersion.summary}</p>
                  ) : null}
                  <div className="selected-version-facts">
                    {activeResumeVersion.selectedFactIds.map((factId) => {
                      const fact = resumeWorkspace?.facts.find(
                        (candidate) => candidate.id === factId,
                      );
                      return fact ? (
                        <span key={factId}>
                          {fact.verified ? "✓" : "!"} {fact.title}
                        </span>
                      ) : (
                        <span className="missing" key={factId}>
                          事实 #{factId} 已删除
                        </span>
                      );
                    })}
                  </div>
                  <div className="button-row">
                    <button
                      onClick={() => openResumeVersion(activeResumeVersion)}
                    >
                      编辑版本
                    </button>
                    <button
                      className="primary"
                      onClick={() =>
                        void exportResumeVersion(activeResumeVersion.id)
                      }
                      disabled={
                        busy || !activeResumeVersion.selectedFactIds.length
                      }
                    >
                      导出 PDF
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        void deleteResumeVersion(activeResumeVersion)
                      }
                      disabled={busy}
                    >
                      删除版本
                    </button>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>

          {!resumeWorkspace?.stats.readyForAi ? (
            <div className="resume-readiness-note">
              当前没有已核实事实。AI 分析仍可提取 JD，但匹配度置信度会很低。
            </div>
          ) : null}
        </section>

        <section hidden={view !== "ai"} className="ai-center">
          <section className="ai-status-grid">
            <article>
              <span>当前 Provider</span>
              <strong>
                {aiSettings?.provider === "local"
                  ? "本地预分析"
                  : aiSettings?.provider || "-"}
              </strong>
            </article>
            <article>
              <span>今日远程调用</span>
              <strong>
                {aiUsage?.todayRemoteCalls ?? 0}/
                {aiUsage?.dailyLimit ?? aiSettings?.dailyRequestLimit ?? 20}
              </strong>
            </article>
            <article>
              <span>分析记录</span>
              <strong>{aiUsage?.totalAnalyses ?? aiAnalyses.length}</strong>
            </article>
            <article>
              <span>缓存命中</span>
              <strong>{aiUsage?.cachedHits ?? 0}</strong>
            </article>
          </section>

          <section className="panel ai-settings-panel">
            <div className="ai-section-head">
              <div>
                <p className="eyebrow">PROVIDER SETTINGS</p>
                <h2>AI Provider</h2>
                <p className="muted">
                  免费本地预分析无需联网；远程 Provider 只发送当前 JD 和已核实事实。
                </p>
              </div>
              <span
                className={`secure-pill ${
                  aiSettings?.encryptionAvailable ? "ready" : ""
                }`}
              >
                {aiSettings?.encryptionAvailable
                  ? "系统加密可用"
                  : "系统加密不可用"}
              </span>
            </div>
            <div className="ai-settings-grid">
              <label>
                Provider
                <select
                  value={aiForm.provider}
                  onChange={(event) => {
                    const provider = event.target
                      .value as AiProviderKind;
                    const defaults = aiProviderDefaults[provider];
                    setAiForm({
                      ...aiForm,
                      provider,
                      baseUrl: defaults.baseUrl,
                      model: defaults.model,
                      apiKey: "",
                    });
                  }}
                >
                  <option value="local">本地预分析（无需 Key）</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="dashscope">阿里云百炼 / DashScope</option>
                  <option value="custom">自定义 OpenAI 兼容接口</option>
                </select>
              </label>
              <label>
                Base URL
                <input
                  value={aiForm.baseUrl}
                  disabled={aiForm.provider === "local"}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) =>
                    setAiForm({ ...aiForm, baseUrl: event.target.value })
                  }
                />
              </label>
              <label>
                模型
                <input
                  value={aiForm.model}
                  disabled={aiForm.provider === "local"}
                  onChange={(event) =>
                    setAiForm({ ...aiForm, model: event.target.value })
                  }
                />
              </label>
              <label>
                每日远程调用上限
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={aiForm.dailyRequestLimit}
                  onChange={(event) =>
                    setAiForm({
                      ...aiForm,
                      dailyRequestLimit: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="ai-key-field">
                API Key
                <input
                  type="password"
                  autoComplete="off"
                  value={aiForm.apiKey}
                  disabled={aiForm.provider === "local"}
                  placeholder={
                    aiSettings?.hasApiKey
                      ? "已加密保存，留空表示不修改"
                      : "输入后将使用系统加密存储"
                  }
                  onChange={(event) =>
                    setAiForm({ ...aiForm, apiKey: event.target.value })
                  }
                />
              </label>
              <div className="button-row ai-settings-actions">
                <button
                  className="primary"
                  onClick={() => void saveAiProvider()}
                  disabled={busy}
                >
                  保存设置
                </button>
                <button
                  onClick={() => void clearAiKey()}
                  disabled={busy || !aiSettings?.hasApiKey}
                >
                  清除 API Key
                </button>
              </div>
            </div>
            <p className="ai-privacy-note">
              不会发送姓名、电话、邮箱、Cookie 或招聘聊天。远程分析前可选择仅使用已核实事实；
              未核实内容不会进入 AI 输入。
            </p>
          </section>

          <div className="ai-workspace">
            <aside className="panel ai-job-picker">
              <p className="eyebrow">SELECT JOB</p>
              <h2>选择岗位</h2>
              {jobs.length ? (
                <div className="ai-job-list">
                  {jobs.map((job) => (
                    <button
                      key={job.id}
                      className={
                        selectedAiJobId === job.id ? "active" : ""
                      }
                      onClick={() => {
                        setSelectedAiJobId(job.id);
                        setAiSelectedJob(job);
                        void window.jobWorkbench
                          .getJobAiAnalysis(job.id)
                          .then(setAiCurrent);
                      }}
                    >
                      <strong>{job.title}</strong>
                      <span>
                        {job.company} · {job.city || "城市未填"}
                      </span>
                      <small>规则分 {job.score}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">职位池中还没有岗位。</p>
              )}
            </aside>

            <section className="panel ai-report">
              {selectedAiJob ? (
                <>
                  <div className="ai-report-head">
                    <div>
                      <p className="eyebrow">JOB EVIDENCE REPORT</p>
                      <h2>{selectedAiJob.title}</h2>
                      <p className="muted">
                        {selectedAiJob.company} · {selectedAiJob.city}
                        {selectedAiJob.district
                          ? ` · ${selectedAiJob.district}`
                          : ""}
                      </p>
                    </div>
                    {aiCurrent ? (
                      <span
                        className={`analysis-state state-${aiCurrent.status}`}
                      >
                        {aiCurrent.status === "succeeded"
                          ? "分析完成"
                          : aiCurrent.status === "running"
                            ? "分析中"
                            : aiCurrent.status === "cancelled"
                              ? "已取消"
                              : "失败"}
                      </span>
                    ) : null}
                  </div>

                  {activeAiTask ? (
                    <div className="ai-active-task">
                      <div>
                        <strong>AI Worker 正在分析</strong>
                        <span>{activeAiTask.progress}%</span>
                      </div>
                      <div className="progress-line">
                        <span
                          style={{ width: `${activeAiTask.progress}%` }}
                        />
                      </div>
                      <button
                        className="danger"
                        onClick={() => void cancelTask(activeAiTask.id)}
                        disabled={busy}
                      >
                        取消分析
                      </button>
                    </div>
                  ) : null}

                  {aiCurrent?.status === "failed" ? (
                    <div className="ai-analysis-error">
                      <strong>分析失败</strong>
                      <p>{aiCurrent.error}</p>
                      <button
                        onClick={() => void startAiAnalysis(true)}
                        disabled={busy}
                      >
                        重新分析
                      </button>
                    </div>
                  ) : null}

                  {aiResult ? (
                    <div className="ai-result">
                      <section className="ai-result-summary">
                        <div>
                          <span>岗位摘要</span>
                          <strong>{aiResult.jobSummary.responsibilities}</strong>
                          <p>{aiResult.jobSummary.workMode}</p>
                          {aiResult.jobSummary.evidence.map(
                            (evidence, index) => (
                              <blockquote key={index}>
                                {evidence.source === "fact"
                                  ? `事实 #${evidence.factId}：`
                                  : "JD："}
                                {evidence.quote}
                              </blockquote>
                            ),
                          )}
                        </div>
                        <div className={`confidence ${aiResult.confidence}`}>
                          <span>置信度</span>
                          <strong>
                            {aiResult.confidence === "high"
                              ? "高"
                              : aiResult.confidence === "medium"
                                ? "中"
                                : "低"}
                          </strong>
                        </div>
                      </section>
                      <p className="confidence-reason">
                        {aiResult.confidenceReason}
                      </p>

                      <h3>硬性要求与事实匹配</h3>
                      <div className="requirement-list">
                        {aiResult.hardRequirements.map(
                          (requirement, index) => (
                            <article
                              className={`requirement status-${requirement.status}`}
                              key={`${requirement.requirement}-${index}`}
                            >
                              <div>
                                <strong>{requirement.requirement}</strong>
                                <span>
                                  {
                                    aiRequirementStatusLabels[
                                      requirement.status
                                    ]
                                  }
                                </span>
                              </div>
                              {requirement.note ? (
                                <p>{requirement.note}</p>
                              ) : null}
                              {requirement.evidence.map((evidence, idx) => (
                                <blockquote
                                  key={`${evidence.source}-${evidence.factId}-${idx}`}
                                >
                                  {evidence.source === "fact"
                                    ? `事实 #${evidence.factId}：`
                                    : "JD："}
                                  {evidence.quote}
                                </blockquote>
                              ))}
                            </article>
                          ),
                        )}
                      </div>

                      {aiResult.bonuses.length ? (
                        <>
                          <h3>加分项</h3>
                          <div className="requirement-list">
                            {aiResult.bonuses.map((bonus, index) => (
                              <article
                                className="requirement status-partial"
                                key={`${bonus.text}-${index}`}
                              >
                                <div>
                                  <strong>{bonus.text}</strong>
                                  <span>加分项</span>
                                </div>
                                {bonus.evidence.map((evidence, idx) => (
                                  <blockquote key={idx}>
                                    {evidence.source === "fact"
                                      ? `事实 #${evidence.factId}：`
                                      : "JD："}
                                    {evidence.quote}
                                  </blockquote>
                                ))}
                              </article>
                            ))}
                          </div>
                        </>
                      ) : null}

                      <h3>风险与要核实的问题</h3>
                      {aiResult.risks.length ? (
                        <div className="risk-list">
                          {aiResult.risks.map((risk, index) => (
                            <article
                              className={`risk severity-${risk.severity}`}
                              key={`${risk.title}-${index}`}
                            >
                              <div>
                                <strong>{risk.title}</strong>
                                <span>
                                  {aiSeverityLabels[risk.severity]}
                                </span>
                              </div>
                              {risk.evidence.map((evidence, idx) => (
                                <blockquote key={idx}>
                                  {evidence.quote}
                                </blockquote>
                              ))}
                              {risk.question ? (
                                <p>核实问题：{risk.question}</p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">未从当前 JD 识别到明确风险词。</p>
                      )}

                      <div className="ai-two-columns">
                        <section>
                          <h3>面试准备</h3>
                          <div className="question-list">
                            {aiResult.interviewQuestions.map(
                              (question, index) => (
                                <article key={`${question.question}-${index}`}>
                                  <span>{question.category}</span>
                                  <strong>{question.question}</strong>
                                  <p>{question.preparation}</p>
                                </article>
                              ),
                            )}
                          </div>
                        </section>
                        <section>
                          <h3>向招聘者确认</h3>
                          <ul className="ask-list">
                            {aiResult.questionsToAsk.map((question) => (
                              <li key={question}>{question}</li>
                            ))}
                          </ul>
                          <h3>简历建议</h3>
                          <p className="resume-advice">
                            推荐版本：
                            {aiResult.resumeRecommendation.versionName ||
                              "暂无匹配版本"}
                          </p>
                          {aiResult.resumeRecommendation.gaps.length ? (
                            <ul className="gap-list">
                              {aiResult.resumeRecommendation.gaps.map(
                                (gap) => (
                                  <li key={gap}>{gap}</li>
                                ),
                              )}
                            </ul>
                          ) : null}
                        </section>
                      </div>

                      {aiResult.unknowns.length ? (
                        <div className="unknown-box">
                          <strong>仍无法确认</strong>
                          <ul>
                            {aiResult.unknowns.map((unknown) => (
                              <li key={unknown}>{unknown}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="analysis-meta">
                        <span>
                          {aiCurrent?.provider} · {aiCurrent?.model}
                        </span>
                        <span>
                          {aiCurrent?.latencyMs ?? 0}ms · Token{" "}
                          {(aiCurrent?.promptTokens ?? 0) +
                            (aiCurrent?.completionTokens ?? 0)}
                        </span>
                        <button
                          onClick={() =>
                            aiCurrent && void deleteAiAnalysis(aiCurrent.id)
                          }
                          disabled={busy}
                        >
                          删除本次结果
                        </button>
                      </div>
                    </div>
                  ) : !activeAiTask && aiCurrent?.status !== "failed" ? (
                    <div className="empty ai-empty">
                      <strong>还没有 AI 分析</strong>
                      <p>
                        先补充至少一条已核实事实，再生成带证据的岗位判断。
                      </p>
                      <button
                        className="primary"
                        onClick={() => void startAiAnalysis(false)}
                        disabled={
                          busy ||
                          !selectedAiJob.description.trim() ||
                          Boolean(activeAiTask)
                        }
                      >
                        开始分析
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty">
                  <strong>选择一个岗位</strong>
                  <p>分析会使用岗位 JD 和已核实简历事实。</p>
                </div>
              )}
            </section>
          </div>

          <section className="panel ai-history">
            <div className="ai-section-head">
              <div>
                <p className="eyebrow">ANALYSIS CACHE</p>
                <h2>最近分析</h2>
              </div>
              <span className="status-badge">
                缓存命中 {aiUsage?.cachedHits ?? 0}
              </span>
            </div>
            {aiAnalyses.length ? (
              <div className="ai-history-list">
                {aiAnalyses.slice(0, 8).map((analysis) => {
                  const job = jobs.find(
                    (candidate) => candidate.id === analysis.jobId,
                  );
                  return (
                    <button
                      key={analysis.id}
                      onClick={() =>
                        void openAiAnalysis(analysis.jobId)
                      }
                    >
                      <span>
                        {job?.title || "已筛选岗位"} · {analysis.provider}
                      </span>
                      <strong>
                        {analysis.status === "succeeded"
                          ? analysis.cachedFromId
                            ? "缓存复用"
                            : "分析完成"
                          : analysis.status}
                      </strong>
                      <small>
                        {new Date(analysis.createdAt).toLocaleString()}
                      </small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="muted">还没有分析记录。</p>
            )}
          </section>
        </section>

        <section hidden={view !== "followup"} className="crm-center">
          <section className="crm-stats">
            <article>
              <span>已逾期</span>
              <strong className="danger-text">
                {crmOverview?.metrics.overdue ?? 0}
              </strong>
            </article>
            <article>
              <span>今天到期</span>
              <strong>{crmOverview?.metrics.dueToday ?? 0}</strong>
            </article>
            <article>
              <span>未来 7 天</span>
              <strong>{crmOverview?.metrics.upcomingSevenDays ?? 0}</strong>
            </article>
            <article>
              <span>未完成跟进</span>
              <strong>{crmOverview?.metrics.openFollowUps ?? 0}</strong>
            </article>
            <article>
              <span>待进行面试</span>
              <strong>{crmOverview?.metrics.scheduledInterviews ?? 0}</strong>
            </article>
          </section>

          <section className="panel crm-agenda-panel">
            <div className="crm-section-head">
              <div>
                <p className="eyebrow">ACTION QUEUE</p>
                <h2>待办与面试日程</h2>
                <p className="muted">
                  按时间排序，点击可直接打开对应岗位跟进记录。
                </p>
              </div>
              <span className="status-badge">
                未完成 {crmOverview?.metrics.openFollowUps ?? 0}
              </span>
            </div>
            {crmOverview?.agenda.length ? (
              <div className="crm-agenda-list">
                {crmOverview.agenda.map((item) => {
                  const overdue =
                    item.kind === "follow-up" &&
                    Date.parse(item.scheduledAt) <
                      new Date().setHours(0, 0, 0, 0);
                  return (
                    <button
                      className={overdue ? "overdue" : ""}
                      key={`${item.kind}-${item.id}`}
                      onClick={() => void openCrm(item.jobId)}
                    >
                      <span className="agenda-kind">
                        {item.kind === "follow-up" ? "跟进" : "面试"}
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.company} · {item.jobTitle}
                        </small>
                      </span>
                      <time>
                        {new Date(item.scheduledAt).toLocaleString()}
                      </time>
                      <span className="agenda-status">{item.status}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty crm-empty">
                <strong>暂无待办</strong>
                <p>选择岗位后添加跟进或面试日程。</p>
              </div>
            )}
          </section>

          <div className="crm-workspace">
            <aside className="panel crm-job-picker">
              <p className="eyebrow">SELECT JOB</p>
              <h2>选择岗位</h2>
              {allActiveJobs.length ? (
                <div className="crm-job-list">
                  {allActiveJobs.map((job) => (
                    <button
                      className={
                        selectedCrmJobId === job.id ? "active" : ""
                      }
                      key={job.id}
                      onClick={() => void openCrm(job.id)}
                    >
                      <strong>{job.title}</strong>
                      <span>
                        {job.company} · {job.city || "城市未填"}
                      </span>
                      <small>{job.status}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">职位池中还没有岗位。</p>
              )}
            </aside>

            <section className="panel crm-detail">
              {selectedCrmJob && crmWorkspace ? (
                <>
                  <div className="crm-detail-head">
                    <div>
                      <p className="eyebrow">JOB RELATIONSHIP</p>
                      <h2>{selectedCrmJob.title}</h2>
                      <p className="muted">
                        {selectedCrmJob.company} · {selectedCrmJob.status}
                      </p>
                    </div>
                    <div className="crm-head-actions">
                      <button onClick={startNewContact} disabled={busy}>
                        联系人
                      </button>
                      <button onClick={startNewFollowUp} disabled={busy}>
                        跟进
                      </button>
                      <button onClick={startNewInterview} disabled={busy}>
                        面试
                      </button>
                    </div>
                  </div>

                  <section className="crm-block">
                    <div className="crm-block-head">
                      <h3>联系人</h3>
                      <span>{crmWorkspace.contacts.length} 人</span>
                    </div>
                    {crmWorkspace.contacts.length ? (
                      <div className="crm-card-grid">
                        {crmWorkspace.contacts.map((contact) => (
                          <article className="crm-card" key={contact.id}>
                            <div>
                              <strong>{contact.name}</strong>
                              <span>{contact.role || "角色未填"}</span>
                            </div>
                            <p>
                              {contact.channel}
                              {contact.contactInfo
                                ? ` · ${contact.contactInfo}`
                                : ""}
                            </p>
                            {contact.lastContactAt ? (
                              <small>
                                最近联系{" "}
                                {new Date(
                                  contact.lastContactAt,
                                ).toLocaleString()}
                              </small>
                            ) : null}
                            {contact.notes ? <p>{contact.notes}</p> : null}
                            <div className="crm-card-actions">
                              <button onClick={() => editContact(contact)}>
                                编辑
                              </button>
                              <button
                                className="danger"
                                onClick={() => void deleteContact(contact.id)}
                                disabled={busy}
                              >
                                删除
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="crm-empty-line">
                        还没有联系人，记录招聘者或内推人信息。
                      </p>
                    )}
                  </section>

                  <section className="crm-block">
                    <div className="crm-block-head">
                      <h3>跟进任务</h3>
                      <span>{pendingCrmFollowUps.length} 个待处理</span>
                    </div>
                    {crmWorkspace.followUps.length ? (
                      <div className="crm-timeline-list">
                        {crmWorkspace.followUps.map((followUp) => {
                          const overdue =
                            followUp.status === "pending" &&
                            Date.parse(followUp.dueAt) < Date.now();
                          return (
                            <article
                              className={`crm-timeline-item follow-${followUp.status} ${
                                overdue ? "overdue" : ""
                              }`}
                              key={followUp.id}
                            >
                              <div>
                                <strong>{followUp.title}</strong>
                                <span>
                                  {followUp.status === "pending"
                                    ? "待处理"
                                    : followUp.status === "completed"
                                      ? "已完成"
                                      : "已取消"}
                                </span>
                              </div>
                              <time>
                                {new Date(followUp.dueAt).toLocaleString()}
                              </time>
                              {followUp.notes ? <p>{followUp.notes}</p> : null}
                              <div className="crm-card-actions">
                                {followUp.status === "pending" ? (
                                  <button
                                    className="primary"
                                    onClick={() =>
                                      void updateFollowUpStatus(
                                        followUp,
                                        "completed",
                                      )
                                    }
                                    disabled={busy}
                                  >
                                    标记完成
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      void updateFollowUpStatus(
                                        followUp,
                                        "pending",
                                      )
                                    }
                                    disabled={busy}
                                  >
                                    重新打开
                                  </button>
                                )}
                                <button onClick={() => editFollowUp(followUp)}>
                                  编辑
                                </button>
                                <button
                                  className="danger"
                                  onClick={() =>
                                    void deleteFollowUp(followUp.id)
                                  }
                                  disabled={busy}
                                >
                                  删除
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="crm-empty-line">
                        没有跟进任务，建议在沟通或投递后三天设置提醒。
                      </p>
                    )}
                  </section>

                  <section className="crm-block">
                    <div className="crm-block-head">
                      <h3>面试记录</h3>
                      <span>{crmWorkspace.interviews.length} 场</span>
                    </div>
                    {crmWorkspace.interviews.length ? (
                      <div className="interview-list">
                        {crmWorkspace.interviews.map((interview) => (
                          <article className="interview-card" key={interview.id}>
                            <div>
                              <strong>{interview.round}</strong>
                              <span>{interview.mode}</span>
                              {interview.scheduledAt ? (
                                <time>
                                  {new Date(
                                    interview.scheduledAt,
                                  ).toLocaleString()}
                                </time>
                              ) : null}
                            </div>
                            {interview.location ? (
                              <p>地点：{interview.location}</p>
                            ) : null}
                            {interview.questions.length ? (
                              <ul>
                                {interview.questions.map((question) => (
                                  <li key={question}>{question}</li>
                                ))}
                              </ul>
                            ) : null}
                            {interview.result ? (
                              <p>结果：{interview.result}</p>
                            ) : null}
                            {interview.reflection ? (
                              <p>复盘：{interview.reflection}</p>
                            ) : null}
                            {interview.nextStep ? (
                              <p>下一步：{interview.nextStep}</p>
                            ) : null}
                            <div className="crm-card-actions">
                              <button onClick={() => editInterview(interview)}>
                                编辑
                              </button>
                              <button
                                className="danger"
                                onClick={() => void deleteInterview(interview.id)}
                                disabled={busy}
                              >
                                删除
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="crm-empty-line">还没有面试记录。</p>
                    )}
                  </section>

                  <section className="crm-block">
                    <div className="crm-block-head">
                      <h3>操作时间线</h3>
                      <span>{crmWorkspace.events.length} 条</span>
                    </div>
                    <div className="timeline">
                      {crmWorkspace.events.slice(0, 20).map((event) => (
                        <div className="timeline-item" key={event.id}>
                          <strong>{eventLabel(event.eventType)}</strong>
                          <p>{event.note || "已记录"}</p>
                          <time>
                            {new Date(event.createdAt).toLocaleString()}
                          </time>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <div className="empty">
                  <strong>选择一个岗位</strong>
                  <p>查看联系人、跟进、面试和完整操作时间线。</p>
                </div>
              )}
            </section>
          </div>
        </section>

        <section hidden={view !== "system"} className="system-center">
          <section
            className={`health-hero health-${systemHealth?.overall || "warning"}`}
          >
            <div>
              <p className="eyebrow">HEALTH SUMMARY</p>
              <h2>
                {systemHealth?.overall === "ok"
                  ? "系统运行正常"
                  : systemHealth?.overall === "error"
                    ? "发现需要处理的问题"
                    : "系统可用，有可优化项"}
              </h2>
              <p>
                数据库、后台任务和本地数据可继续使用；提醒与采集连接状态如下。
              </p>
            </div>
            <div className="health-version">
              <span>应用版本</span>
              <strong>v{systemHealth?.appVersion || "-"}</strong>
              <small>
                运行 {Math.floor((systemHealth?.uptimeSeconds || 0) / 60)} 分钟
              </small>
            </div>
          </section>

          <section className="health-check-grid">
            {(systemHealth?.checks || []).map((check) => (
              <article
                className={`health-check check-${check.status}`}
                key={check.id}
              >
                <div>
                  <span className="health-dot" />
                  <strong>{check.label}</strong>
                </div>
                <p>{check.detail}</p>
              </article>
            ))}
          </section>

          <div className="system-columns">
            <section className="panel system-settings">
              <div className="system-section-head">
                <div>
                  <p className="eyebrow">NOTIFICATIONS & TRAY</p>
                  <h2>提醒与托盘</h2>
                  <p className="muted">
                    关闭窗口后应用保留在托盘，到期跟进每天最多提醒一次。
                  </p>
                </div>
                <span
                  className={`status-badge ${
                    systemHealth?.trayActive ? "" : "muted-badge"
                  }`}
                >
                  托盘{systemHealth?.trayActive ? "已启用" : "未启用"}
                </span>
              </div>
              <label className="system-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(systemHealth?.notificationsEnabled)}
                  disabled={!systemHealth?.notificationSupported || busy}
                  onChange={(event) =>
                    void setNotificationsEnabled(event.target.checked)
                  }
                />
                <span>
                  <strong>Windows 到期提醒</strong>
                  <small>
                    {systemHealth?.notificationSupported
                      ? "支持系统通知"
                      : "当前系统不支持通知"}
                  </small>
                </span>
              </label>
              <div className="system-actions">
                <button
                  onClick={() => void runReminderCheck()}
                  disabled={busy}
                >
                  立即检查到期跟进
                </button>
                <button
                  onClick={() => void openDataDirectory()}
                  disabled={busy}
                >
                  打开数据目录
                </button>
                <button
                  className="primary"
                  onClick={() => void exportDiagnostics()}
                  disabled={busy}
                >
                  导出脱敏诊断报告
                </button>
              </div>
              <p className="system-privacy">
                诊断报告不包含 API Key、Cookie、联系人、简历正文、招聘聊天或完整 JD。
              </p>
            </section>

            <section className="panel system-status-panel">
              <p className="eyebrow">LOCAL STATUS</p>
              <h2>本地状态</h2>
              <dl className="system-facts">
                <dt>Schema</dt>
                <dd>v{systemHealth?.schemaVersion ?? "-"}</dd>
                <dt>数据库完整性</dt>
                <dd>{systemHealth?.databaseIntegrity || "-"}</dd>
                <dt>待处理任务</dt>
                <dd>{systemHealth?.pendingTasks ?? 0}</dd>
                <dt>候选预览</dt>
                <dd>{systemHealth?.pendingCandidates ?? 0}</dd>
                <dt>未完成跟进</dt>
                <dd>{systemHealth?.dueFollowUps ?? 0}</dd>
                <dt>专用 Edge</dt>
                <dd>{systemHealth?.edgeRunning ? "已连接" : "未连接"}</dd>
                <dt>AI Provider</dt>
                <dd>
                  {systemHealth?.aiProvider || "-"} ·{" "}
                  {systemHealth?.aiConfigured ? "可用" : "待配置"}
                </dd>
              </dl>
            </section>
          </div>

          <section className="panel system-updates">
            <div className="system-section-head">
              <div>
                <p className="eyebrow">STARTUP & UPDATES</p>
                <h2>启动与更新</h2>
                <p className="muted">
                  开机自启需要在安装版中开启；更新只检查版本并打开下载页面。
                </p>
              </div>
              <span className="status-badge">
                {systemHealth?.updateInfo?.available
                  ? `发现 ${systemHealth.updateInfo.latestTag}`
                  : "手动更新"}
              </span>
            </div>
            <div className="startup-grid">
              <label className="system-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(systemHealth?.autoLaunchEnabled)}
                  disabled={!systemHealth?.autoLaunchSupported || busy}
                  onChange={(event) =>
                    void setAutoLaunch(event.target.checked)
                  }
                />
                <span>
                  <strong>Windows 登录时启动</strong>
                  <small>
                    {systemHealth?.autoLaunchSupported
                      ? "安装版可用"
                      : "开发版不写入系统自启"}
                  </small>
                </span>
              </label>
              <label className="system-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(systemHealth?.autoUpdateCheckEnabled)}
                  disabled={busy}
                  onChange={(event) =>
                    void setUpdateAutoCheck(event.target.checked)
                  }
                />
                <span>
                  <strong>启动后自动检查更新</strong>
                  <small>最多每 6 小时检查一次</small>
                </span>
              </label>
            </div>
            <div className="update-card">
              <div>
                <span>当前版本</span>
                <strong>v{systemHealth?.appVersion || "-"}</strong>
              </div>
              <div>
                <span>最新版本</span>
                <strong>
                  {systemHealth?.updateInfo?.latestTag || "尚未检查"}
                </strong>
                {systemHealth?.updateInfo?.publishedAt ? (
                  <small>
                    发布于{" "}
                    {new Date(
                      systemHealth.updateInfo.publishedAt,
                    ).toLocaleDateString()}
                  </small>
                ) : null}
              </div>
              <button
                className="primary"
                onClick={() => void checkForUpdates()}
                disabled={busy}
              >
                检查更新
              </button>
            </div>
            {systemHealth?.updateInfo?.notes ? (
              <details className="release-notes">
                <summary>查看 Release 说明</summary>
                <pre>{systemHealth.updateInfo.notes}</pre>
              </details>
            ) : null}
            <div className="button-row">
              {systemHealth?.updateInfo?.htmlUrl ? (
                <a
                  href={systemHealth.updateInfo.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开发布页面
                </a>
              ) : null}
              {systemHealth?.updateInfo?.downloadUrl ? (
                <a
                  href={systemHealth.updateInfo.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  下载安装包
                </a>
              ) : null}
            </div>
            <p className="signing-note">
              当前安装包未配置代码签名证书，Windows 可能显示 SmartScreen
              提示。代码签名不会用自签名证书冒充正式签名。
            </p>
          </section>

          <div className="system-columns">
            <section className="panel system-backups">
              <p className="eyebrow">BACKUPS</p>
              <h2>最近备份</h2>
              {systemHealth?.recentBackups.length ? (
                <div className="backup-list">
                  {systemHealth.recentBackups.map((backup) => (
                    <div key={backup}>
                      <strong>
                        {backup.split(/[\\/]/).pop() || backup}
                      </strong>
                      <small>{backup}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">还没有可用备份。</p>
              )}
            </section>

            <section className="panel system-paths">
              <p className="eyebrow">DATA PATHS</p>
              <h2>数据目录</h2>
              <dl>
                <dt>数据库</dt>
                <dd>{systemHealth?.databasePath || "-"}</dd>
                <dt>备份</dt>
                <dd>{systemHealth?.backupDirectory || "-"}</dd>
                <dt>日志</dt>
                <dd>{systemHealth?.logsDirectory || "-"}</dd>
                <dt>Edge 调试</dt>
                <dd>{systemHealth?.edgeEndpoint || "-"}</dd>
              </dl>
            </section>
          </div>
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
                              : task.type === "ai-analysis"
                                ? "AI 单岗位分析"
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
                    {task.type === "ai-analysis" &&
                    typeof task.result.analysisId === "string" ? (
                      <p className="task-result">
                        {task.result.cached
                          ? "命中分析缓存"
                          : `AI 分析完成 · ${String(task.result.provider || "")} / ${String(task.result.model || "")}`}
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

      {resumeFactEditor ? (
        <div className="modal-backdrop">
          <form
            className="modal resume-fact-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void saveResumeFact();
            }}
          >
            <p className="eyebrow">RESUME FACT</p>
            <h2>
              {resumeFactEditor.id ? "编辑事实" : "新建事实"}
            </h2>
            <div className="form-row">
              <label>
                类型
                <select
                  value={resumeFactEditor.fields.kind}
                  onChange={(event) =>
                    setResumeFactEditor({
                      ...resumeFactEditor,
                      fields: {
                        ...resumeFactEditor.fields,
                        kind: event.target.value as ResumeFactKind,
                      },
                    })
                  }
                >
                  {resumeFactKindOptions.map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
              </label>
              <label>
                排序
                <input
                  type="number"
                  value={resumeFactEditor.fields.sortOrder}
                  onChange={(event) =>
                    setResumeFactEditor({
                      ...resumeFactEditor,
                      fields: {
                        ...resumeFactEditor.fields,
                        sortOrder: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              标题
              <input
                required
                value={resumeFactEditor.fields.title}
                placeholder="例如：电力设备采购平台"
                onChange={(event) =>
                  setResumeFactEditor({
                    ...resumeFactEditor,
                    fields: {
                      ...resumeFactEditor.fields,
                      title: event.target.value,
                    },
                  })
                }
              />
            </label>
            <div className="form-row">
              <label>
                组织 / 学校 / 公司
                <input
                  value={resumeFactEditor.fields.organization}
                  onChange={(event) =>
                    setResumeFactEditor({
                      ...resumeFactEditor,
                      fields: {
                        ...resumeFactEditor.fields,
                        organization: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                角色
                <input
                  value={resumeFactEditor.fields.role}
                  onChange={(event) =>
                    setResumeFactEditor({
                      ...resumeFactEditor,
                      fields: {
                        ...resumeFactEditor.fields,
                        role: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                开始时间
                <input
                  value={resumeFactEditor.fields.startDate}
                  placeholder="2025-09"
                  onChange={(event) =>
                    setResumeFactEditor({
                      ...resumeFactEditor,
                      fields: {
                        ...resumeFactEditor.fields,
                        startDate: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                结束时间
                <input
                  value={resumeFactEditor.fields.endDate}
                  placeholder="2026-05 或 至今"
                  onChange={(event) =>
                    setResumeFactEditor({
                      ...resumeFactEditor,
                      fields: {
                        ...resumeFactEditor.fields,
                        endDate: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              地点
              <input
                value={resumeFactEditor.fields.location}
                onChange={(event) =>
                  setResumeFactEditor({
                    ...resumeFactEditor,
                    fields: {
                      ...resumeFactEditor.fields,
                      location: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              事实条目（每行一条，只写真实完成的内容）
              <textarea
                rows={5}
                value={resumeFactEditor.fields.bullets.join("\n")}
                onChange={(event) =>
                  setResumeFactEditor({
                    ...resumeFactEditor,
                    fields: {
                      ...resumeFactEditor.fields,
                      bullets: event.target.value
                        .split(/\r?\n/)
                        .map((bullet) => bullet.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
            <label>
              技能（用逗号分隔）
              <input
                value={resumeFactEditor.fields.skills.join("、")}
                onChange={(event) =>
                  setResumeFactEditor({
                    ...resumeFactEditor,
                    fields: {
                      ...resumeFactEditor.fields,
                      skills: event.target.value
                        .split(/[、,，]/)
                        .map((skill) => skill.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
            <label>
              真实依据
              <textarea
                rows={3}
                value={resumeFactEditor.fields.evidence}
                placeholder="例如：毕业设计源文件、论文、实习证明、证书编号"
                onChange={(event) =>
                  setResumeFactEditor({
                    ...resumeFactEditor,
                    fields: {
                      ...resumeFactEditor.fields,
                      evidence: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="toggle resume-verify-toggle">
              <input
                type="checkbox"
                checked={resumeFactEditor.fields.verified}
                onChange={(event) =>
                  setResumeFactEditor({
                    ...resumeFactEditor,
                    fields: {
                      ...resumeFactEditor.fields,
                      verified: event.target.checked,
                    },
                  })
                }
              />
              我已确认这条事实真实、准确并能解释
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setResumeFactEditor(null)}>
                取消
              </button>
              <button className="primary" type="submit" disabled={busy}>
                保存事实
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {resumeVersionEditor ? (
        <div className="modal-backdrop">
          <form
            className="modal resume-version-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void saveResumeVersion();
            }}
          >
            <p className="eyebrow">RESUME VERSION</p>
            <h2>
              {resumeVersionEditor.id ? "编辑简历版本" : "新建简历版本"}
            </h2>
            <div className="form-row">
              <label>
                版本名称
                <input
                  required
                  value={resumeVersionEditor.fields.name}
                  onChange={(event) =>
                    setResumeVersionEditor({
                      ...resumeVersionEditor,
                      fields: {
                        ...resumeVersionEditor.fields,
                        name: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                目标岗位
                <input
                  value={resumeVersionEditor.fields.targetRole}
                  onChange={(event) =>
                    setResumeVersionEditor({
                      ...resumeVersionEditor,
                      fields: {
                        ...resumeVersionEditor.fields,
                        targetRole: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              版式
              <select
                value={resumeVersionEditor.fields.template}
                onChange={(event) =>
                  setResumeVersionEditor({
                    ...resumeVersionEditor,
                    fields: {
                      ...resumeVersionEditor.fields,
                      template: event.target
                        .value as ResumeVersionFields["template"],
                    },
                  })
                }
              >
                <option value="general">通用</option>
                <option value="technical">技术岗位</option>
                <option value="implementation">实施/技术支持</option>
              </select>
            </label>
            <label>
              版本概述
              <textarea
                rows={3}
                value={resumeVersionEditor.fields.summary}
                onChange={(event) =>
                  setResumeVersionEditor({
                    ...resumeVersionEditor,
                    fields: {
                      ...resumeVersionEditor.fields,
                      summary: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="toggle resume-verify-toggle">
              <input
                type="checkbox"
                checked={resumeVersionEditor.fields.includeUnverified}
                onChange={(event) => {
                  const includeUnverified = event.target.checked;
                  const verifiedIds = new Set(
                    resumeWorkspace?.facts
                      .filter((fact) => fact.verified)
                      .map((fact) => fact.id) || [],
                  );
                  setResumeVersionEditor({
                    ...resumeVersionEditor,
                    fields: {
                      ...resumeVersionEditor.fields,
                      includeUnverified,
                      selectedFactIds: includeUnverified
                        ? resumeVersionEditor.fields.selectedFactIds
                        : resumeVersionEditor.fields.selectedFactIds.filter(
                            (id) => verifiedIds.has(id),
                          ),
                    },
                  });
                }}
              />
              允许加入未核实事实（不推荐）
            </label>
            <div className="version-fact-picker">
              <div>
                <strong>选择事实</strong>
                <span>
                  已选 {resumeVersionEditor.fields.selectedFactIds.length} 条
                </span>
              </div>
              {resumeWorkspace?.facts.length ? (
                resumeWorkspace.facts.map((fact) => {
                  const checked =
                    resumeVersionEditor.fields.selectedFactIds.includes(
                      fact.id,
                    );
                  const disabled =
                    !fact.verified &&
                    !resumeVersionEditor.fields.includeUnverified;
                  return (
                    <label
                      className={`version-fact-option ${
                        disabled ? "disabled" : ""
                      }`}
                      key={fact.id}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() =>
                          setResumeVersionEditor({
                            ...resumeVersionEditor,
                            fields: {
                              ...resumeVersionEditor.fields,
                              selectedFactIds: checked
                                ? resumeVersionEditor.fields.selectedFactIds.filter(
                                    (id) => id !== fact.id,
                                  )
                                : [
                                    ...resumeVersionEditor.fields
                                      .selectedFactIds,
                                    fact.id,
                                  ],
                            },
                          })
                        }
                      />
                      <span>
                        <strong>{fact.title}</strong>
                        <small>
                          {fact.kind} · {fact.verified ? "已核实" : "未核实"}
                        </small>
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="muted">请先在事实库中录入内容。</p>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setResumeVersionEditor(null)}
              >
                取消
              </button>
              <button className="primary" type="submit" disabled={busy}>
                保存版本
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {contactEditor ? (
        <div className="modal-backdrop">
          <form
            className="modal crm-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void saveContact();
            }}
          >
            <p className="eyebrow">CONTACT</p>
            <h2>{contactEditor.id ? "编辑联系人" : "新增联系人"}</h2>
            <div className="form-row">
              <label>
                姓名
                <input
                  required
                  value={contactEditor.fields.name}
                  onChange={(event) =>
                    setContactEditor({
                      ...contactEditor,
                      fields: {
                        ...contactEditor.fields,
                        name: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                角色
                <input
                  value={contactEditor.fields.role}
                  placeholder="HR、招聘经理、内推人"
                  onChange={(event) =>
                    setContactEditor({
                      ...contactEditor,
                      fields: {
                        ...contactEditor.fields,
                        role: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                渠道
                <select
                  value={contactEditor.fields.channel}
                  onChange={(event) =>
                    setContactEditor({
                      ...contactEditor,
                      fields: {
                        ...contactEditor.fields,
                        channel: event.target
                          .value as ContactFields["channel"],
                      },
                    })
                  }
                >
                  {["BOSS", "微信", "电话", "邮件", "其他"].map(
                    (channel) => (
                      <option key={channel}>{channel}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                联系方式说明
                <input
                  value={contactEditor.fields.contactInfo}
                  placeholder="只保存必要的联系说明"
                  onChange={(event) =>
                    setContactEditor({
                      ...contactEditor,
                      fields: {
                        ...contactEditor.fields,
                        contactInfo: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              最近联系时间
              <input
                type="datetime-local"
                value={contactEditor.fields.lastContactAt}
                onChange={(event) =>
                  setContactEditor({
                    ...contactEditor,
                    fields: {
                      ...contactEditor.fields,
                      lastContactAt: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              备注
              <textarea
                rows={4}
                value={contactEditor.fields.notes}
                onChange={(event) =>
                  setContactEditor({
                    ...contactEditor,
                    fields: {
                      ...contactEditor.fields,
                      notes: event.target.value,
                    },
                  })
                }
              />
            </label>
            <p className="crm-privacy-note">
              联系人信息只保存在本机，不会进入 AI 请求。
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setContactEditor(null)}>
                取消
              </button>
              <button className="primary" type="submit" disabled={busy}>
                保存联系人
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {followUpEditor ? (
        <div className="modal-backdrop">
          <form
            className="modal crm-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void saveFollowUp();
            }}
          >
            <p className="eyebrow">FOLLOW-UP</p>
            <h2>{followUpEditor.id ? "编辑跟进" : "新增跟进"}</h2>
            <label>
              跟进标题
              <input
                required
                value={followUpEditor.fields.title}
                onChange={(event) =>
                  setFollowUpEditor({
                    ...followUpEditor,
                    fields: {
                      ...followUpEditor.fields,
                      title: event.target.value,
                    },
                  })
                }
              />
            </label>
            <div className="form-row">
              <label>
                计划时间
                <input
                  required
                  type="datetime-local"
                  value={followUpEditor.fields.dueAt}
                  onChange={(event) =>
                    setFollowUpEditor({
                      ...followUpEditor,
                      fields: {
                        ...followUpEditor.fields,
                        dueAt: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                状态
                <select
                  value={followUpEditor.fields.status}
                  onChange={(event) =>
                    setFollowUpEditor({
                      ...followUpEditor,
                      fields: {
                        ...followUpEditor.fields,
                        status: event.target
                          .value as FollowUpFields["status"],
                      },
                    })
                  }
                >
                  <option value="pending">待处理</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </label>
            </div>
            <label>
              备注
              <textarea
                rows={4}
                value={followUpEditor.fields.notes}
                onChange={(event) =>
                  setFollowUpEditor({
                    ...followUpEditor,
                    fields: {
                      ...followUpEditor.fields,
                      notes: event.target.value,
                    },
                  })
                }
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setFollowUpEditor(null)}>
                取消
              </button>
              <button className="primary" type="submit" disabled={busy}>
                保存跟进
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {interviewEditor ? (
        <div className="modal-backdrop">
          <form
            className="modal crm-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void saveInterview();
            }}
          >
            <p className="eyebrow">INTERVIEW</p>
            <h2>{interviewEditor.id ? "编辑面试记录" : "新增面试记录"}</h2>
            <div className="form-row">
              <label>
                轮次
                <input
                  required
                  value={interviewEditor.fields.round}
                  onChange={(event) =>
                    setInterviewEditor({
                      ...interviewEditor,
                      fields: {
                        ...interviewEditor.fields,
                        round: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                面试方式
                <select
                  value={interviewEditor.fields.mode}
                  onChange={(event) =>
                    setInterviewEditor({
                      ...interviewEditor,
                      fields: {
                        ...interviewEditor.fields,
                        mode: event.target
                          .value as InterviewFields["mode"],
                      },
                    })
                  }
                >
                  <option>现场</option>
                  <option>电话</option>
                  <option>视频</option>
                  <option>其他</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                面试时间
                <input
                  type="datetime-local"
                  value={interviewEditor.fields.scheduledAt}
                  onChange={(event) =>
                    setInterviewEditor({
                      ...interviewEditor,
                      fields: {
                        ...interviewEditor.fields,
                        scheduledAt: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                地点 / 会议链接
                <input
                  value={interviewEditor.fields.location}
                  onChange={(event) =>
                    setInterviewEditor({
                      ...interviewEditor,
                      fields: {
                        ...interviewEditor.fields,
                        location: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              面试问题（每行一条）
              <textarea
                rows={4}
                value={interviewEditor.fields.questions.join("\n")}
                onChange={(event) =>
                  setInterviewEditor({
                    ...interviewEditor,
                    fields: {
                      ...interviewEditor.fields,
                      questions: event.target.value
                        .split(/\r?\n/)
                        .map((question) => question.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
            <div className="form-row">
              <label>
                结果
                <input
                  value={interviewEditor.fields.result}
                  placeholder="待面试、通过、未通过"
                  onChange={(event) =>
                    setInterviewEditor({
                      ...interviewEditor,
                      fields: {
                        ...interviewEditor.fields,
                        result: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                下一步
                <input
                  value={interviewEditor.fields.nextStep}
                  placeholder="准备二面、等待通知"
                  onChange={(event) =>
                    setInterviewEditor({
                      ...interviewEditor,
                      fields: {
                        ...interviewEditor.fields,
                        nextStep: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              复盘
              <textarea
                rows={4}
                value={interviewEditor.fields.reflection}
                onChange={(event) =>
                  setInterviewEditor({
                    ...interviewEditor,
                    fields: {
                      ...interviewEditor.fields,
                      reflection: event.target.value,
                    },
                  })
                }
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setInterviewEditor(null)}>
                取消
              </button>
              <button className="primary" type="submit" disabled={busy}>
                保存面试
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {message ? <div className="toast">{message}</div> : null}
    </div>
  );
}
