# M1 Architecture Notes

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
- `schema_migrations` records schema versions. The current schema version is 2.
- Durable tasks are stored in SQLite with idempotency keys and interrupted-on-restart handling.

## Database decision

`better-sqlite3` was evaluated but required a local C++ build toolchain. Electron 45 ships Node
24.22.2, including `node:sqlite`. The built-in module passed an Electron smoke test, so M1 uses it
to avoid native ABI rebuilds and installer packaging risk.

## Deferred work

- BOSS Collector utility process
- AI Provider and AI utility process
- Durable task queue and recovery UI
- Full CRM and interview records
- Multi-version resume editor
- Auto update and code signing
