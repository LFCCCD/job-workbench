# 求职工作台

Windows 本地求职管理工具。当前实现为 M1 垂直切片，已打通：

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
- 已验证简历事实导出 PDF
- Windows NSIS 安装包

当前版本是技术验证版，不包含 BOSS 自动采集、AI 分析和完整 CRM。

## 下载

[Windows x64 M1 安装程序](https://github.com/LFCCCD/job-workbench/releases/download/v0.1.0-m1/Setup.0.1.0.exe)

SHA256：

```text
E1D1F3DC3CF45557FF0C04B2AD7FD6D6BA0C0EC081F61E8F768A9D7B151A4D62
```

当前安装包未签名，Windows 可能显示 SmartScreen 提示。

## 开发

```powershell
npm install
npm run dev
```

## 构建

```powershell
npm run check
npm test
npm run dist
```

构建产物：

`release/求职工作台 Setup 0.1.0.exe`

## 本地数据

开发版默认使用：

`%LOCALAPPDATA%\JobHunter`

自动化测试可通过 `JOB_WORKBENCH_USER_DATA` 指向临时目录。

## 测试

- `npm run check`：TypeScript 类型检查
- `npm test`：SQLite、Schema、Task、状态、归档、备份、恢复和迁移测试
- `node scripts/electron-smoke.cjs`：真实 Electron 流程测试

## 技术决策

初始方案使用 `better-sqlite3`，但 M1 验证发现它要求在本机安装 Visual Studio C++ 工具链。
Electron 45 自带 Node 24，其 `node:sqlite` 已通过读写和打包测试，因此改用内置 SQLite，
减少原生模块编译和 ABI 维护成本。

Electron 版本固定为 `45.2.3`，防止 `node:sqlite` API 随主版本变化。
