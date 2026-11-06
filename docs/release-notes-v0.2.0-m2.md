# 求职工作台 v0.2.0 M2 Beta

Windows x64 M2 Beta 测试版。

## 主要功能

- BOSS 专用 Edge、低频采集、候选预览和人工确认导入
- 岗位管理、筛选视图、回收站、状态时间线、备份和恢复
- 本地 AI 预分析以及 DeepSeek、DashScope、自定义 OpenAI 兼容 Provider
- JD 原句和已核实事实 ID 证据校验
- 简历个人资料、事实库、核实状态、岗位版本和 PDF 导出
- 联系人、跟进待办、面试记录和到期统计
- Windows 托盘、系统通知、登录自启和更新检查
- 系统健康页、14 天日志和脱敏诊断报告

## 安全边界

- 不自动投递、不自动发送招聘消息
- 不绕过 BOSS 验证码、登录风控或访问频率限制
- AI API Key 使用 Electron `safeStorage` 加密
- 联系人、简历正文、Cookie 和 API Key 不进入诊断报告
- 更新检查不静默下载或执行安装包

## 安装

下载并运行 `Setup.0.2.0-m2.exe`。数据默认保存在：

`%LOCALAPPDATA%\JobHunter`

从 M1 升级前建议先创建备份；应用也保留旧版 SQLite 迁移和安全恢复入口。

## 已知限制

- 当前安装包未配置代码签名证书，Windows 可能显示 SmartScreen 提示
- 自动更新只检查版本，不静默安装
- 登录自启只支持 Windows 安装版
- BOSS 页面或接口改版时，采集适配器可能需要更新

## 校验

SHA256：

```text
561275A6C935DB5B8C61D8F72AC1EAC950824BC3CE0B2520E24631BEF0B99466
```
