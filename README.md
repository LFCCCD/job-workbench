# 求职工作台

Windows 本地求职管理工具。当前 `feat/m2-data-core` 分支已打通：

- Electron 桌面外壳、React 界面和 Typed IPC
- Electron 内置 `node:sqlite` 数据库
- 旧版 SQLite 数据库迁移和安全备份
- Schema 版本、完整性检查和迁移预览
- 岗位手动新增、状态修改、批量归档与恢复
- 岗位搜索、方向/状态/收藏筛选、排序和保存筛选视图
- 岗位详情编辑与状态时间线
- 回收站、批量恢复和仅限回收站岗位的永久删除
- SQLite 一致性备份
- 数据库恢复及恢复前自动安全备份
- 持久化 Task 表和重启中断检测
- 任务中心：后台备份、进度、取消、重试和清理已完成记录
- 独立 BOSS Collector Worker（Electron `utilityProcess`）
- 专用 Edge 资料目录、人工扫码登录和本地 CDP 连接
- 低频搜索、短期结果缓存、候选去重及风险即刻停止
- 采集候选预览、批量忽略和人工确认后事务导入
- 采集岗位与已有岗位按 BOSS 来源 ID 去重，更新时保留状态、收藏和备注
- 独立 AI Analysis Worker 和本地规则预分析
- DeepSeek、DashScope、自定义 OpenAI 兼容 Provider
- AI API Key 使用 Electron `safeStorage` 系统加密，不进入 SQLite 和日志
- 单岗位 JD 摘要、硬性要求、事实匹配、风险、面试题和待确认问题
- JD 原句与已核实 factId 证据校验，引用不匹配时拒绝保存
- AI 分析缓存、每日远程调用上限、任务取消、重试和失败记录
- 简历个人资料和事实库 CRUD
- 教育、实习、项目、技能、证书、奖项和校园经历分类
- 事实核实状态；未核实内容默认不进入简历版本和 AI
- 简历版本组合、目标岗位、版式、概述和按版本导出 PDF
- 删除事实时自动清理已有版本中的失效引用
- 求职 CRM：岗位联系人、跟进待办和面试记录
- 跟进逾期、今天到期、未来 7 天和未完成数量统计
- 岗位联系时间与最早待跟进时间自动同步
- 跟进完成后可重新打开，面试包含轮次、方式、问题、结果和复盘
- 联系人、跟进、面试和岗位状态操作统一写入可追溯时间线
- Windows 托盘常驻：关闭窗口后后台任务和到期提醒继续运行
- 到期跟进系统通知，每个任务每天最多提醒一次
- 系统健康页：数据库、备份、Edge、AI、任务、提醒和托盘状态
- 14 天轮转本地日志及脱敏诊断 JSON 导出
- 单实例启动和重复启动时聚焦现有窗口
- 安装版 Windows 登录自启开关
- GitHub Release 手动更新检查和可关闭的启动自动检查
- 更新只提示版本、Release 说明和下载链接，不静默下载或覆盖安装
- Windows NSIS 安装包

采集只保存岗位候选，不自动投递、不自动发送招聘消息，也不绕过验证码或风控。
当前版本仍不包含多岗位 AI 横向比较、实时招聘消息、云同步和移动端。

## 下载

[Windows x64 M2 Beta 安装程序](https://github.com/LFCCCD/job-workbench/releases/download/v0.2.0-m2/Setup.0.2.0-m2.exe)

SHA256：

```text
AACF6A3003DFCE87B25F102A75CC07F2352DEB2E59CE6DBAC6AD66CBF6D10CAF
```

当前安装包未签名，Windows 可能显示 SmartScreen 提示。

## 开发

```powershell
npm install
npm start
```

开发模式：

```powershell
npm run dev
```

## 构建

```powershell
npm run check
npm test
npm run dist
```

构建产物：

`release/求职工作台 Setup 0.2.0-m2.exe`

## 本地数据

开发版默认使用：

`%LOCALAPPDATA%\JobHunter`

自动化测试可通过 `JOB_WORKBENCH_USER_DATA` 指向临时目录。

## 测试

- `npm run check`：TypeScript 类型检查
- `npm test`：SQLite、Schema、Task 恢复、岗位流程、BOSS 适配器、AI 证据校验和 Provider 测试
- `node scripts/electron-smoke.cjs`：真实 Electron 流程测试

## BOSS 采集

1. 打开应用中的“采集中心”。
2. 点击“启动专用 Edge”，在弹出的浏览器中手动扫码登录。
3. 选择城市、填写关键词并启动采集。
4. 在“任务中心”查看进度；失败或中断后可重试。
5. 回到“采集中心”，勾选候选并确认导入正式职位池。

专用 Edge 使用应用数据目录下的 `collector-edge-profile`，不会读取日常浏览器资料。
搜索响应只缓存标准化后的岗位候选，不保存 Cookie、Token 或认证请求头。

## AI 分析

AI 分析默认使用无需联网的本地预分析。也可以配置 DeepSeek、DashScope 或任意
OpenAI Chat Completions 兼容接口：

1. 打开“AI 分析”，选择 Provider 并填写 Base URL、模型和 API Key。
2. 点击“保存设置”；API Key 通过 Windows 系统加密保存在应用数据目录。
3. 在职位池或 AI 分析页选择岗位，然后点击“开始分析”。
4. 分析结果会展示 JD 引用、已核实事实证据、风险和面试准备。

远程请求只包含当前岗位 JD、已核实事实、简历版本名称和摘要，不发送姓名、电话、
邮箱、Cookie 或招聘聊天。模型输出必须通过共享 Schema、JD 原文匹配和事实 ID
白名单校验，否则分析失败且不会写入有效结果。

## 简历事实与版本

1. 打开“简历”，先保存姓名、联系方式和目标岗位。
2. 新建真实的教育、实习、项目或校园经历，填写可验证依据。
3. 确认内容真实后标记为“已核实”。
4. 新建简历版本，勾选适合目标岗位的已核实事实。
5. 在版本卡片中导出 PDF；导出的文件只包含该版本选中且已核实的事实。

AI 分析和 PDF 导出共用同一事实库，但远程 AI 只接收已核实事实，不接收电话、
邮箱或姓名等联系方式。

## 跟进 CRM

1. 打开“跟进”，在左侧选择岗位。
2. 记录招聘者、内推人或 HR 的渠道、最近联系时间和备注。
3. 新建跟进待办并设置计划时间；逾期、今天和未来 7 天会在首页统计。
4. 记录面试轮次、方式、地点、问题、结果、复盘和下一步。
5. 完成跟进后可重新打开，所有变化都会进入岗位时间线。

联系人信息只保存在本机，不会进入 AI 请求。

## 托盘、提醒与诊断

关闭主窗口后，应用会保留在 Windows 系统托盘。托盘菜单可以显示窗口、检查提醒、
打开数据目录或彻底退出。首次启动及之后每五分钟检查一次到期跟进；同一跟进任务
每天最多发送一次 Windows 通知。

“系统”页面显示数据库完整性、最近备份、BOSS Edge、AI Provider、后台任务和
提醒状态。诊断报告为脱敏 JSON，只包含版本、运行环境、状态、数量和脱敏后的日志；
不会包含 API Key、Cookie、联系人、简历正文、招聘聊天或完整岗位描述。

安装版可以在“系统 → 启动与更新”中开启 Windows 登录自启。更新检查默认每 6
小时最多请求一次公开 Release；只打开发布页面或下载链接，不会自动执行安装包。
当前安装包没有代码签名证书，Windows 可能显示 SmartScreen 提示。

## 技术决策

初始方案使用 `better-sqlite3`，但 M1 验证发现它要求在本机安装 Visual Studio C++ 工具链。
Electron 45 自带 Node 24，其 `node:sqlite` 已通过读写和打包测试，因此改用内置 SQLite，
减少原生模块编译和 ABI 维护成本。

Electron 版本固定为 `45.2.3`，防止 `node:sqlite` API 随主版本变化。
