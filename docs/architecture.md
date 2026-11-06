# Architecture Notes

## Scope

The first milestone proves the complete local desktop path:

1. Install or launch the Electron application.
2. Open a local SQLite database.
3. Migrate an older workbench database.
4. Add and manage jobs.
5. Update status and archive jobs in a transaction.
6. Create a consistent database backup.
7. Render verified resume facts to PDF.
8. Package the application as a Windows NSIS installer.

## Process model

- Main process owns the database and exposes a narrow IPC API.
- Preload uses CommonJS because Electron sandboxed preload scripts do not support ESM.
- Renderer has no Node integration and only receives the typed `jobWorkbench` API.
- PDF rendering uses a hidden BrowserWindow and never loads remote resources.
- Data-layer migration is transactional, checked with `PRAGMA integrity_check`, and preceded by
  a safety backup.
- `schema_migrations` records schema versions. The current schema version is 4.
- Durable tasks are stored in SQLite with idempotency keys and interrupted-on-restart handling.
- The task center executes registered task types in the main process, exposes progress and
  errors through IPC, and supports cancel, retry, and finished-record cleanup.
- Job filters are validated with shared Zod contracts and saved views are stored in SQLite.
- Permanent deletion is restricted to jobs already in the recycle bin.
- BOSS collection runs in an Electron `utilityProcess`; the worker never opens SQLite.
- The worker connects to a dedicated Edge profile through local CDP and receives only typed
  collection requests plus normalized cached search results.
- The main process validates worker messages, stages candidates in SQLite, and is the only
  process allowed to import candidates into the job table.
- Collection stops on login failure, risk-control messages, CAPTCHA messages, or abnormal
  responses. It never automates applications, messages, CAPTCHA, or rate-limit bypasses.

## Database decision

`better-sqlite3` was evaluated but required a local C++ build toolchain. Electron 45 ships Node
24.22.2, including `node:sqlite`. The built-in module passed an Electron smoke test, so M1 uses it
to avoid native ABI rebuilds and installer packaging risk.

## Deferred work

- AI Provider and AI utility process
- Full CRM and interview records
- Full multi-version resume editor
- Auto update and code signing
