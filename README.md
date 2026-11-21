# Asal-GAS

**Laravel-inspired Headless MVC & REST API framework for Google Apps Script.**

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Runtime](https://img.shields.io/badge/runtime-Google%20Apps%20Script%20V8-green.svg)
![Node.js](https://img.shields.io/badge/local%20emulator-Node.js%2018%2B-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)

[Quick Start](#quick-start-local-development) · [60-Second Workflow](#60-second-workflow) · [GAS Deployment](#deployment-to-google-apps-script) · [CLI Reference](#cli-reference-gas) · [API Convention](#api-request--payload-convention)

---

## Overview

**Asal-GAS** brings structured backend architecture to **Google Apps Script (GAS)** using Google Sheets as a relational-style datastore. Instead of maintaining monolithic `Code.gs` files, you get a local zero-quota Node.js emulator, schema migrations, database seeders, a unified `gas` CLI, and a hardened **Zero-HTTP-Bootstrap** security model.

### Key Features

- **Zero-Quota Local Emulator:** Build, migrate, seed, and test endpoints locally against `local/storage/db.json` without hitting Google Apps Script execution quotas.
- **Unified `gas` CLI:** Generate controllers, migrations, and seeders, inspect routes (`gas route:list`), or handle `clasp` initialization, push, pull, and Web App deployments from one tool.
- **Zero-HTTP-Bootstrap Security:** Workspace provisioning (`setupWorkspace`) is completely isolated from public `doGet`/`doPost` routes, guarded by `LockService` and owner-only execution (`access: MYSELF`).
- **V8 Load-Order Resilience:** Combines deterministic `filePushOrder` with lazy `Proxy` controller instantiation to prevent `ReferenceError` / `TypeError` caused by GAS V8 file evaluation order.
- **Schema Migrations, Seeders & ORM:** Version-controlled table creation, column alterations, batch rollbacks, soft deletes (`deleted_at`) with `restore()` and `forceDelete()`, `bulkCreate()`, `find()`, multi-level indexing cache, and idempotent seeders.
- **Validation & Lifecycle Hooks:** Built-in `Validator.make(data, rules)` helper and `BaseController` lifecycle hooks (`beforeStore`, `afterStore`, `beforeUpdate`, `afterUpdate`, `beforeDestroy`, `afterDestroy`).
- **CORS-Safe Universal JSON Envelope:** Standardized `POST` payload (`action`, `session`, `id`, `data`) engineered to avoid HTTP `OPTIONS` preflight failures in GAS Web Apps.
- **Built-In Auth, TTL & Rate Limiting:** Salted PBKDF2 password hashing (`Hash.make`, `Hash.check`, `Hash.needsRehash`), session expiration (`session_expires_at`), `throttle` middleware, and automatic password field redaction.

---

## Project Structure

```text
├── gas                         # Unified CLI executable (Unix/macOS/Git Bash)
├── gas.cmd                     # Unified CLI wrapper (Windows CMD/PowerShell)
├── .clasp.json.example         # Template clasp config with deterministic filePushOrder
├── .claspignore                # Files excluded from Google Apps Script push
├── package.json                # Dependencies and npm scripts
├── local/
│   ├── runtime/
│   │   ├── GasLoader.js        # Loads src/ modules into local Node.js runtime
│   │   └── GasMocks.js         # Emulates SpreadsheetApp, PropertiesService, Utilities, etc.
│   └── storage/
│       └── .gitkeep            # Local JSON database directory (db.json is gitignored)
└── src/
    ├── appsscript.json         # GAS V8 manifest (executionApi: MYSELF, Web App settings)
    ├── main.js                 # Clean HTTP entry points (doGet & doPost)
    ├── app/
    │   └── Controllers/        # Resource (Proxy) & Plain controllers
    ├── config/
    │   └── config.js           # Lazy ScriptProperties getter & WorkspaceSetup provisioner
    ├── core/
    │   ├── Controller_Base.js  # Base CRUD controller with hooks, soft delete & relations
    │   ├── Core_Router.js      # Route registration, middleware & dispatching engine
    │   ├── Database_Migration.js
    │   ├── Database_Seeder.js
    │   ├── crud.js             # Spreadsheet query, index cache, lock & mutation engine
    │   ├── database.js         # Spreadsheet connection & sheet resolver
    │   ├── foglobal.js         # Validator, sanitizer, response & utility helpers
    │   └── hash.js             # PBKDF2 password hashing & verification
    ├── database/
    │   ├── migrations/         # Timestamped schema migration files
    │   └── seeders/            # Database seeder definitions
    ├── middleware/
    │   └── middleware.js       # Session authentication & expiration guards
    ├── routes/
    │   └── api.js              # API route definitions
    └── tools/
        ├── CodeGenerator.js    # GAS Web Editor module/migration/controller generator
        └── DevTools.js         # Owner-only diagnostic & auth verification helpers
```

---

## Prerequisites

- **Node.js** `v18.0.0` or higher
- **Google Account** with Google Drive & Google Apps Script access
- **Google Apps Script API** enabled at [script.google.com/home/usersettings](https://script.google.com/home/usersettings)

---

## Quick Start (Local Development)

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/aqshalzuhdi/asal-gas.git
   cd asal-gas
   npm install
   ```

2. **Initialize the local database and run seeders:**
   ```bash
   gas migrate:fresh --seed
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Verify the health-check endpoint:**
   ```bash
   curl "http://localhost:3000"
   ```

---

## 60-Second Workflow

Create a complete CRUD resource from scratch in four steps:

1. **Scaffold Migration, Seeder, and Controller:**
   ```bash
   gas make:module Project
   ```

2. **Define columns in the generated migration (`src/database/migrations/..._CreateProjectsTable.js`):**
   ```javascript
   Schema.create("projects", function (table) {
       table.id();
       table.string("name");
       table.string("status");
       table.timestamps();
       table.softDeletes();
   });
   ```

3. **Register the resource route in `src/routes/api.js`:**
   ```javascript
   Route.resource("projects", "ProjectController");
   ```

4. **Migrate locally, test, and deploy to Google Apps Script:**
   ```bash
   gas migrate
   gas deploy "Add projects module"
   ```

---

## Deployment to Google Apps Script

### 1. Authenticate & Create Remote Project
```bash
gas login
gas init "My GAS Backend"
```
*(To connect an existing GAS project instead, run `gas init --id <SCRIPT_ID>`.)*

### 2. Deploy as Web App
```bash
gas deploy "v1.0.0"
```
This pushes `src/` to Google Apps Script, publishes a versioned Web App deployment, and outputs your production URL (`[https://script.google.com/macros/s/](https://script.google.com/macros/s/)<DEPLOYMENT_ID>/exec`).

### 3. One-Time Workspace Provisioning (Owner-Only)
Because public HTTP routes are locked against unauthenticated bootstrapping:

1. Open the GAS Web Editor:
   ```bash
   gas open
   ```
2. Select **`setupWorkspace`** from the function dropdown in the top toolbar and click **Run**.
3. Approve the Google OAuth consent screen (**Review permissions → Advanced → Allow**).
   - `setupWorkspace()` creates a dedicated Google Spreadsheet, stores `SHEET_ID` in **Script Properties**, executes all pending migrations, and runs initial seeders.
4. *(Optional)* Copy the `Web App URL` from your terminal and save it as `BASE_URL` in **Project Settings → Script Properties** (or let `CONFIG.BASE_URL` auto-capture it on the first live `/exec` request).

### 4. Subsequent Updates
For future releases, run:
```bash
gas deploy "v1.0.1"
```
`gas deploy` automatically reuses your saved `deploymentId` so your production `/exec` URL remains constant.

---

## CLI Reference (`gas`)

> **Windows users:** Run `gas` directly via `gas.cmd` in Command Prompt/PowerShell, or execute `npm link` once to register `gas` globally.

### Google Apps Script & Deployment

| Command | Description |
| :--- | :--- |
| `gas init [Title] [--id <ScriptId>] [-f]` | Create a new standalone GAS project or link an existing `scriptId` in `.clasp.json`. |
| `gas login` | Authenticate your Google account via `clasp`. |
| `gas push [-f] [--seed] [--setup]` | Push `src/` to GAS and sync via private OAuth (`MYSELF`) if configured. |
| `gas pull` | Pull remote files from Google Apps Script into `src/`. |
| `gas status` | Check file sync status between local `src/` and remote GAS. |
| `gas open` | Open the active project in the Google Apps Script Web Editor. |
| `gas deploy [Description] [--setup]` | Push latest code and create or update the production Web App deployment. |

### Code Generators

| Command | Description |
| :--- | :--- |
| `gas make:module <Entity> [-r\|--plain]` | Generate a Migration, Seeder, and Controller in one command. |
| `gas make:migration <Name>` | Create a timestamped migration in `src/database/migrations/`. |
| `gas make:controller <Name> [-r\|--plain]` | Create a lazy-Proxy resource controller (`-r`, default) or plain controller (`--plain`). |
| `gas make:seeder <Name>` | Create a seeder file in `src/database/seeders/`. |

### Local Database, Routing & Diagnostics

| Command | Description |
| :--- | :--- |
| `gas migrate [--seed]` | Run all pending migrations against `local/storage/db.json`. |
| `gas migrate:fresh [--seed]` | Reset `local/storage/db.json`, re-run all migrations, and optionally seed. |
| `gas migrate:rollback` | Roll back the last migration batch. |
| `gas migrate:status` | List all migrations and their execution status. |
| `gas db:seed` | Execute registered seeders via `DatabaseSeeder`. |
| `gas db:reindex` | Rebuild local schema metadata and row lookup indexes. |
| `gas route:list [Filter] [--method <HTTP>]` | Display all registered routes, HTTP methods, actions, middlewares, and sheets. |

---

## API Request & Payload Convention

Google Apps Script Web Apps dispatch routes via the `route` query parameter (`?route=<path>`). When `?route` is omitted, requests automatically resolve to the root route (`""` or `"/"`). Because GAS does not support HTTP `OPTIONS` preflight requests, all mutations use a standardized JSON envelope over `POST`.

### 1. Health Check (`GET`)
```http
GET https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```

### 2. Authentication (`POST ?route=auth/login`)
```json
{
    "username": "admin",
    "password": "password123"
}
```

### 3. Query & Pagination (`GET ?route=<resource>`)
```http
GET https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?route=users&session={{session}}&page=1&per_page=15&sort=-id
```

### 4. Universal Mutation Envelope (`POST ?route=<resource>`)

**Create Record (`action: "create"`):**
```json
{
    "action": "create",
    "session": "{{session}}",
    "data": {
        "name": "Acme Corporation",
        "email": "contact@example.com"
    }
}
```

**Update Record (`action: "update"`):**
```json
{
    "action": "update",
    "session": "{{session}}",
    "data": {
        "id": 1,
        "name": "Acme Global Ltd."
    }
}
```

**Soft Delete Record (`action: "delete"`):**
```json
{
    "action": "delete",
    "session": "{{session}}",
    "id": 1
}
```

**Restore Soft-Deleted Record (`action: "restore"`):**
```json
{
    "action": "restore",
    "session": "{{session}}",
    "id": 1
}
```

**Permanently Delete Record (`action: "force-delete"`):**
```json
{
    "action": "force-delete",
    "session": "{{session}}",
    "id": 1
}
```

---

## Architecture & Security Design

### 1. Zero-HTTP-Bootstrap
`src/main.js` only dispatches registered application routes. Workspace provisioning (`WorkspaceSetup.init()`) cannot be triggered by anonymous HTTP requests, eliminating first-claim hijacking or unauthorized spreadsheet creation on public deployments.

### 2. GAS V8 Load-Order Safety
In Google Apps Script's V8 runtime, top-level code executes sequentially by file order. Resource controllers wrap `BaseController.init(...)` inside an ES6 `Proxy` so initialization is deferred until the first incoming request—guaranteeing all `src/core/` dependencies are loaded first:

```javascript
var ProjectController = (function () {
    var _instance;
    return new Proxy({}, {
        get: function (_, prop) {
            if (!_instance) {
                _instance = BaseController.init({
                    sheet: "projects",
                    with: []
                });
            }
            var val = _instance[prop];
            return typeof val === "function" ? val.bind(_instance) : val;
        }
    });
})();
```

### 3. Sensitive File Isolation
`.clasp.json`, `creds.json`, and `local/storage/*.json` are ignored via `.gitignore` so personal Script IDs, Deployment IDs, and local test records are never leaked to version control.

---

## License

Released under the [MIT License](LICENSE).
