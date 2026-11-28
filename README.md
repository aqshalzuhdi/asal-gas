# Asal-GAS

**Laravel-inspired Hybrid Web & REST API MVC framework for Google Apps Script.**

![Version](https://img.shields.io/badge/version-3.0.1-blue.svg)
![Runtime](https://img.shields.io/badge/runtime-Google%20Apps%20Script%20V8-green.svg)
![Node.js](https://img.shields.io/badge/local%20emulator-Node.js%2018%2B-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)

[Quick Start](#quick-start-local-development) · [Web & API Modes](#hybrid-web--api-routing-modes) · [Blade-Lite Views](#blade-lite-view-engine) · [60-Second Workflow](#60-second-workflow) · [GAS Deployment](#deployment-to-google-apps-script) · [CLI Reference](#cli-reference-gas) · [API Convention](#api-request--payload-convention)

---

## Overview

**Asal-GAS** brings structured full-stack and API backend architecture to **Google Apps Script (GAS)** using Google Sheets as a relational-style datastore. Instead of maintaining monolithic `Code.gs` files, you get a local zero-quota Node.js emulator, Eloquent-style ORM models, a Blade-lite HTML templating engine, isolated GAS Web App SPA navigation, dual Web & API routing layers, stateless CSRF protection, schema migrations, database seeders, a unified `gas` CLI, and a hardened **Zero-HTTP-Bootstrap** security model.

### Key Features

- **Zero-Quota Local Emulator:** Build, migrate, seed, and test Web pages or JSON endpoints locally against `local/storage/db.json` with automatic port fallback and SSE live-reload (`APP_DEBUG=true`) without hitting Google Apps Script execution quotas.
- **Eloquent-Style ORM Models (`Model.js`):** Define models in `src/app/Models/` with mandatory `fillable` / `guarded` mass-assignment protection (plus `forceUpdate()` bypass for internal system fields), optional `hidden` output redaction, `casts` (`boolean`, `integer`, `float`, `json`, `array`, `string`), fluent query chains (`where()`, `whereIn()`, `orderBy()`, `latest()`, `with()`, `withHidden()`, `first()`, `get()`, `paginate()`, `datatable()`, `find()`), `belongsTo` / `hasMany` relationships with multi-level eager loading, soft deletes (`restore()`, `forceDelete()`, `withTrashed()`, `onlyTrashed()`), and `bulkCreate()`.
- **Hybrid Web & API Architecture:** Separate `src/routes/web.js` and `src/routes/api.js` layers controlled by `APP_MODE` (`web` or `api`) and configurable `API_PREFIX` in `.env`. In `api` mode, web routes are completely disabled and `/` or `/index` resolve directly to your API index JSON response.
- **Blade-Lite View Engine (`View.js`):** Write pure HTML templates in `src/resources/views/**/*.gas.js` with `@extends`, `@section`, `@yield`, `@include`, `@if`, `@forelse`, `@csrf`, `{{ }}`, and `{!! !!}`—with instant local hot-reload and automatic compilation to `src/core/CompiledViews.js` during `gas push` / `gas deploy`.
- **Isolated GAS Web App SPA Navigation:** Automatically intercepts internal links and form submissions (`POST`, `PUT`, `DELETE`) inside `HtmlService` iframes via `google.script.run` (`gasNavigate`) and `google.script.history`, preventing `X-Frame-Options` white screens and full iframe reloads while keeping user view layouts 100% pure HTML.
- **Stateless CSRF Protection (`Csrf.js` & `APP_KEY`):** Built-in HMAC-SHA256 + stream-cipher encrypted CSRF tokens, `@csrf` Blade directive, automatic verification middleware on mutating web routes (HTTP `419` on mismatch), and `gas key:generate` CLI management.
- **Unified `gas` CLI:** Scaffold models (`gas make:model`), full CRUD modules (`gas make:module`), controllers (`--plain`/`--web`, `--api`, `-r`/`--resource`), views, migrations, and seeders; inspect routes (`gas route:list`); generate `APP_KEY`; sync framework core updates (`gas framework:update` with 3-way manifest merging); or manage `clasp` initialization, safe Script Properties sync, remote migrations, and Web App deployments from one tool.
- **Zero-HTTP-Bootstrap Security (`Workspace.js`):** Workspace provisioning (`setupWorkspace` / `inspectWorkspace`) is completely isolated from public `doGet`/`doPost` routes in `src/main.js`, guarded by `LockService` and owner-only execution (`access: MYSELF`).
- **V8 Load-Order Resilience & Request Caching:** Combines deterministic `filePushOrder`, deferred singleton class instantiation (`Controller.resolve()`), per-request `ScriptProperties` caching (`Config.js`), and derived HMAC key caching to eliminate `ReferenceError` issues and redundant RPC overhead.
- **Laravel-Style Request, Validation & Controllers:** Extend `Controller` in `src/app/Controllers/` with `Request.js` (`request.only()`, `request.input()`, `request.header()`, `request.user()`, `request.wantsJson()`), `Validator.js` (`Validator.make(data, rules)`), and `Response.js` (`failResponse()`, `createHtmlOutputSafe()`).
- **CORS-Safe Universal JSON Envelope:** Standardized `POST` payload (`action`, `session`, `id`, `data`) engineered to avoid HTTP `OPTIONS` preflight failures in GAS Web Apps.
- **Built-In Auth, TTL & Rate Limiting (`Authenticate.js` & `Hash.js`):** Salted PBKDF2 password hashing (`Hash.make`, `Hash.check`, `Hash.needsRehash`), session expiration (`session_expires_at`), `throttle` middleware, and automatic password field redaction.

---

## Project Structure

```text
├── gas                         # Unified CLI executable (Unix/macOS/Git Bash)
├── gas.cmd                     # Unified CLI wrapper (Windows CMD/PowerShell)
├── .env.example                # Environment template (APP_MODE, API_PREFIX, APP_DEBUG, APP_KEY, etc.)
├── .clasp.json.example         # Template clasp config with deterministic filePushOrder
├── .claspignore                # Excludes raw .gas.js views & local files from GAS push
├── package.json                # Dependencies and npm scripts
├── local/
│   ├── server.js               # Local HTTP dev server with auto port fallback & SSE hot-reload
│   ├── runtime/
│   │   ├── EnvLoader.js        # Local .env parser & writer
│   │   ├── GasLoader.js        # V8 context loader for src/ & views
│   │   ├── GasMocks.js         # Emulates SpreadsheetApp, PropertiesService, Utilities, etc.
│   │   └── SetupShell.js       # Configures shell PATH & CLI integration helpers
│   └── storage/
│       └── .gitkeep            # Local JSON database directory (db.json is gitignored)
└── src/
    ├── appsscript.json         # GAS V8 manifest (executionApi: MYSELF, Web App settings)
    ├── main.js                 # Slim entry point (doGet, doPost & gasNavigate SPA bridge)
    ├── app/
    │   ├── Controllers/
    │   │   ├── AuthController.js
    │   │   ├── HomeController.js
    │   │   └── UserController.js
    │   └── Models/
    │       └── User.js
    ├── config/
    │   └── Config.js           # Cached ScriptProperties loader & CONFIG getters
    ├── core/
    │   ├── CompiledViews.js    # Auto-generated build from view:compile (gitignored)
    │   ├── Controller.js       # Base Controller class (alias BaseController)
    │   ├── Csrf.js             # Stateless HMAC-SHA256 CSRF token generator & verifier
    │   ├── Database.js         # Spreadsheet connection & sheet resolver
    │   ├── Hash.js             # PBKDF2 password hashing & verification
    │   ├── Helpers.js          # Global utilities, sanitizer & GAS iframe SPA client runtime
    │   ├── Migration.js        # Schema builder & migration runner
    │   ├── Model.js            # Eloquent-style ORM & fluent query builder
    │   ├── Request.js          # HTTP Request wrapper (input, only, header, auth, wantsJson)
    │   ├── Response.js         # JSON/HTML response helpers & createHtmlOutputSafe()
    │   ├── Router.js           # Web/API router, middleware pipeline & dispatcher
    │   ├── Seeder.js           # Database seeder registry & runner
    │   ├── SheetStore.js       # Spreadsheet query, index cache, lock & row mutation engine
    │   ├── Validator.js        # Laravel-style input validation engine (Validator.make)
    │   ├── View.js             # Blade-lite template compiler & layout engine
    │   └── Workspace.js        # EnvSync, inspectWorkspace & owner-only setupWorkspace provisioner
    ├── database/
    │   ├── migrations/         # Timestamped schema migration files
    │   └── seeders/            # Database seeder definitions
    ├── middleware/
    │   └── Authenticate.js     # Session & token expiration guard
    ├── resources/
    │   └── views/              # Pure HTML + Blade-lite templates (*.gas.js)
    │       ├── layouts/
    │       │   └── app.gas.js
    │       └── home.gas.js
    ├── routes/
    │   ├── api.js              # API routes (registerRoutes, auto-prefixed by API_PREFIX)
    │   └── web.js              # Web routes (registerWebRoutes)
    └── tools/
        ├── CodeGenerator.js    # GAS Web Editor module/migration/controller generator
        └── DevTools.js         # Owner-only diagnostic & auth verification helpers
```

---

## Prerequisites

- **Node.js** `v18.0.0` or higher
- **Google Account** with Google Drive & Google Apps Script access
- **Google Apps Script API** enabled at https://script.google.com/home/usersettings

---

## Quick Start (Local Development)

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/aqshalzuhdi/asal-gas.git
   cd asal-gas
   npm install
   ```

2. **Copy `.env.example` to `.env`, generate `APP_KEY`, and configure your runtime mode:**
   ```bash
   cp .env.example .env
   gas key:generate
   ```
   ```env
   APP_NAME="Asal-GAS"
   APP_MODE=web
   API_PREFIX=api
   APP_DEBUG=true
   APP_KEY="base64:..."
   ```

3. **Initialize the local database and run seeders:**
   ```bash
   gas migrate:fresh --seed
   ```

4. **Start the local development server:**
   ```bash
   npm run dev
   ```

5. **Open in browser or verify via curl:**
   ```bash
   curl "http://localhost:3000"
   curl "http://localhost:3000/api"
   ```

---

## Hybrid Web & API Routing Modes

Asal-GAS splits routing into two clean files:
- **`src/routes/web.js`** (`registerWebRoutes()`) — serves HTML views and CSRF-protected browser forms without an API prefix.
- **`src/routes/api.js`** (`registerRoutes()`) — automatically prefixed with `API_PREFIX` from `.env` (defaults to `api`).

Behavior switches automatically based on `APP_MODE` in `.env` (synced to GAS Script Properties on `gas push` / `gas deploy`):

| `APP_MODE` | `src/routes/web.js` | `src/routes/api.js` (e.g., `API_PREFIX=api`) |
| :--- | :--- | :--- |
| **`web`** | All web routes (`/`, `/index`, `/users/create`, etc.) are active and render HTML views. | All API routes (`/api`, `/api/login`, `/api/users`, etc.) are active and return JSON. |
| **`api`** | Completely disabled/skipped. `View.make()` also forces JSON responses. | All API routes remain active under `/${API_PREFIX}`. Accessing `/`, `/index`, `?route=`, or `?route=index` automatically resolves to the API index route (`""` or `"index"` in `api.js`) as JSON. |

*(To disable the API prefix completely, set `API_PREFIX=none` in `.env`.)*

---

## Blade-Lite View Engine

Views live in `src/resources/views/` using the `.gas.js` extension and contain **100% pure HTML + Blade-lite directives** without manual `View.register()` calls or framework-coupled scripts. Dot notation maps directly to directory paths (`view("users.create")` resolves `src/resources/views/users/create.gas.js`).

### Layout Example (`src/resources/views/layouts/app.gas.js`)
```html
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('title', appName)</title>
    @stack('styles')
</head>
<body>
    <nav>
        <a href="{{ url('/') }}">Home</a>
    </nav>
    <main>
        @yield('content')
    </main>
    @stack('scripts')
</body>
</html>
```

### Page & Form Example (`src/resources/views/home.gas.js`)
```html
@extends('layouts.app')

@section('title', 'Home - ' + appName)

@section('content')
    <h1>Welcome, {{ user.name }}</h1>
    <p>API Endpoint: <code>{{ apiUrl('/users') }}</code></p>

    <form method="POST" action="{{ url('/users') }}">
        @csrf
        <input type="text" name="name" required>
        <button type="submit">Save</button>
    </form>

    <ul>
        @forelse (items as item)
            <li>{{ loop.iteration }}. {{ item.name }}</li>
        @empty
            <li>No records found.</li>
        @endforelse
    </ul>
@endsection
```

### Supported Directives & Helpers
- **Layouts & Partials:** `@extends('layouts.app')`, `@section('name') ... @endsection`, `@yield('name', 'default')`, `@include('partials.alert')`, `@includeIf(...)`, `@push('scripts') ... @endpush`, `@stack('scripts')`
- **Control Flow & Loops:** `@if`, `@elseif`, `@else`, `@endif`, `@unless`, `@isset`, `@empty`, `@foreach (items as key => item)`, `@forelse (items as item) ... @empty ... @endforelse`, `@for` (with `loop.index`, `loop.iteration`, `loop.first`, `loop.last`, `loop.count`)
- **Security, Output & Routing:** `@csrf`, `csrfToken()`, `csrfField()`, `{{ escaped }}`, `{!! rawHtml !!}`, `{{-- comment --}}`, `url('/path')`, `apiUrl('/users')`, `route('users.edit', { id: 1 })`, `json(data)`
- **GAS Compilation & Runtime Isolation:** During local development (`APP_DEBUG=true`), `.gas.js` views hot-reload automatically via SSE. When running `gas push` or `gas deploy`, `compileViews()` bundles all templates into `src/core/CompiledViews.js`. On Google Apps Script Web Apps, `createHtmlOutputSafe()` in `src/core/Response.js` injects an isolated client runtime from `src/core/Helpers.js` (`google.script.run` + `google.script.history`) automatically so your views stay completely framework-agnostic and safe from `gas framework:update`.

---

## 60-Second Workflow

Create a complete CRUD resource from scratch in four steps:

1. **Scaffold Model, Migration, Seeder, and Controller:**
   ```bash
   gas make:module Project
   ```
   *(Defaults to `--api` 5-method controller. Pass `--resource` / `-r` for a 7-method Web+API resource controller, or scaffold individual pieces via `gas make:model Project -m -c -s`.)*

2. **Configure fields in the generated Model (`src/app/Models/Project.js`) and Migration (`src/database/migrations/..._CreateProjectsTable.js`):**
   ```javascript
   // src/app/Models/Project.js
   class Project extends Model {
       // Define either fillable or guarded (required):
       fillable = ["name", "status"];
       // guarded = ["id"];

       // Optional output redaction:
       hidden = ["deleted_at"];
   }
   ```
   ```javascript
   // src/database/migrations/..._CreateProjectsTable.js
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
   Route.resource("projects", ProjectController);
   // Or string notation: Route.resource("projects", "ProjectController");
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
gas deploy
```
On the first push/deploy, if `APP_KEY` is not yet set, the CLI automatically generates and saves one (or prompts when `GAS_DEPLOY_AUTO_KEY=false`). `gas deploy` compiles views, pushes `src/` to Google Apps Script, publishes a versioned Web App deployment, safely syncs `.env` keys (`APP_MODE`, `API_PREFIX`, `APP_DEBUG`, `APP_KEY`) to Script Properties without clobbering existing production keys, and outputs your production URL (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`).

### 3. One-Time Workspace Provisioning (Owner-Only)
Because public HTTP routes are locked against unauthenticated bootstrapping:

1. Open the GAS Web Editor:
   ```bash
   gas open
   ```
2. Select **`setupWorkspace`** from the function dropdown in the top toolbar and click **Run**.
3. Approve the Google OAuth consent screen (**Review permissions → Advanced → Allow**).
   - `setupWorkspace()` creates a dedicated Google Spreadsheet, stores `SHEET_ID` in **Script Properties**, executes all pending migrations, and runs initial seeders.
4. *(Optional)* Copy the `Web App URL` from your terminal and save it as `BASE_URL` in **Project Settings → Script Properties**.

*(Alternatively, configure desktop OAuth credentials once via `gas creds` to run remote migrations, seeders, and safe Script Properties sync directly from your terminal using `gas deploy --migrate --seed` or `gas deploy --fresh --migrate --seed`.)*

**Execution Log Output (`setupWorkspace`):**

![setupWorkspace Execution Output](docs/img/output-setupWorkspace.png)

**Configured Script Properties (`SHEET_ID` & `BASE_URL`):**

![Configured Script Properties](docs/img/assign-propertyScript.png)

### 4. Subsequent Updates
For future releases, run:
```bash
gas deploy "v3.0.1"
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
| `gas creds [-f\|--force]` | Setup `creds.json` & authenticate `clasp` for remote CLI execution (`clasp run`). |
| `gas key:generate [-f\|--force]` | Generate `APP_KEY` in `.env` & `.clasp.json`, and sync it to GAS Script Properties. |
| `gas push [-f\|--force] [--seed] [--setup] [--env-sync <mode>] [--sheet <mode>] [--fresh] [-y\|--yes]` | Compile views, push `src/` to GAS, and safely sync Script Properties via `setupWorkspace`. |
| `gas pull` | Pull remote files from Google Apps Script into `src/`. |
| `gas status` | Check file sync status between local `src/` and remote GAS. |
| `gas open` | Open the active project in the Google Apps Script Web Editor. |
| `gas deploy [Description] [--migrate] [--seed] [--setup] [--env-sync <ask\|keep\|merge\|overwrite>] [--sheet <ask\|keep\|env\|generate>] [--fresh] [-y\|--yes]` | Compile views, push latest code, create or update the production Web App deployment, and sync Script Properties. |
| `gas framework:update [--dry-run] [--commit] [--remote <name>] [--branch <branch\|tag>] [--repo <url>]` | Pull updates for core framework (`Model.js`, `Controller.js`, `Request.js`, `SheetStore.js`, etc.), local runtime, and CLI files (`gas`, `gas.cmd`, `src/core`, `src/middleware/Authenticate.js`, `src/tools`, `src/config/Config.js`, `local/runtime`, `local/server.js`), and 3-way smart-merge `src/appsscript.json`, `.clasp.json`, `package.json`, `.gitignore`, and `.claspignore` without overwriting project files (`src/app/`, `src/routes/`, `src/resources/`, `src/database/`). |

### Code Generators & Views

| Command | Description |
| :--- | :--- |
| `gas make:module <Entity> [--api\|-r\|--resource]` | Generate a Model, Migration, Seeder, and Controller in one command (defaults to `--api`). |
| `gas make:model <Name> [-m] [-c] [-s] [-r] [-a] [--api] [--plain\|--web]` | Create an Eloquent-style Model in `src/app/Models/` with optional Migration (`-m`), Controller (`-c` / `-r`), Seeder (`-s`), or all (`-a`). |
| `gas make:migration <Name>` | Create a timestamped migration in `src/database/migrations/`. |
| `gas make:controller <Name> [--plain\|--web\|--api\|-r\|--resource]` | Create an empty (`--plain`/`--web`, default), API (`--api`, 5 methods), or Resource (`-r`/`--resource`, 7 methods) controller. |
| `gas make:seeder <Name>` | Create a seeder file in `src/database/seeders/`. |
| `gas make:view <Name>` | Create a Blade-lite `.gas.js` template in `src/resources/views/`. |
| `gas view:compile` | Compile all `src/resources/views/**/*.gas.js` templates into `src/core/CompiledViews.js`. |

### Local & Remote Database, Routing & Diagnostics

| Command | Description |
| :--- | :--- |
| `gas route:list [Filter] [--method <HTTP>]` | Display all registered Web & API routes, HTTP methods, actions, middlewares, and sheets. |
| `gas migrate [--seed] [--no-count]` | Run all pending migrations against `local/storage/db.json` (and optionally seed). |
| `gas migrate:fresh [--seed] [--no-count]` | Reset `local/storage/db.json`, re-run all migrations, and optionally seed. |
| `gas migrate:rollback` | Roll back the last local migration batch. |
| `gas migrate:status` | List all migrations and their local execution status. |
| `gas migrate:remote [--seed] [--no-count]` | Run all pending migrations (and optionally seed) on remote Google Sheets. |
| `gas migrate:remote:rollback` | Roll back the last migration batch on remote Google Sheets. |
| `gas migrate:remote:refresh [--seed] [--no-count]` | Roll back and re-run remote migrations (and optionally seed) on Google Sheets. |
| `gas db:seed [Seeder] [--remote] [--no-count]` | Execute `DatabaseSeeder` (or a specific seeder) locally or on remote Google Sheets. |
| `gas db:seed:remote [Seeder] [--no-count]` | Execute `DatabaseSeeder` (or a specific seeder) directly on remote Google Sheets. |
| `gas db:reindex` | Rebuild local schema metadata and row lookup indexes. |

---

### Updating Framework in an Existing Project

To pull framework, local runtime, and CLI improvements from `asal-gas` into an existing project without overwriting custom models (`src/app/Models`), controllers (`src/app/Controllers`), routes (`src/routes/web.js`, `src/routes/api.js`), views (`src/resources/views`), migrations, seeders, custom `src/appsscript.json` scopes/settings, or local credentials:

```bash
gas framework:update --dry-run
gas framework:update
```

---

## API Request & Payload Convention

Google Apps Script Web Apps dispatch routes via the `route` query parameter (`?route=<path>`), while the local Node.js server supports both clean paths (`/api/users`) and `?route=api/users`. All routes in `src/routes/api.js` are automatically prefixed with `API_PREFIX` (default: `api`). Because GAS does not support HTTP `OPTIONS` preflight requests, all mutations use a standardized JSON envelope over `POST`.

### 1. API Health Check (`GET`)
```http
GET https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?route=api
```

### 2. Authentication (`POST ?route=api/login`)
```json
{
    "username": "admin",
    "password": "password123"
}
```

### 3. Query & Pagination (`GET ?route=api/<resource>`)
```http
GET https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?route=api/users&session={{session}}&page=1&per_page=15&sort=-id
```

### 4. Universal Mutation Envelope (`POST ?route=api/<resource>`)

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
`src/main.js` acts strictly as an entry point dispatching registered application routes (`doGet`, `doPost`, and `gasNavigate`). Workspace provisioning (`setupWorkspace` / `inspectWorkspace` in `src/core/Workspace.js`) cannot be triggered by anonymous HTTP requests, eliminating first-claim hijacking or unauthorized spreadsheet creation on public deployments.

### 2. Stateless CSRF Protection (`APP_KEY`)
All mutating web routes (`POST`, `PUT`, `PATCH`, `DELETE`) registered in `src/routes/web.js` automatically prepend the `csrf` middleware (pass `{ withoutCsrf: true }` in route options to opt out). `src/core/Csrf.js` signs and encrypts expiring tokens using keys derived from `APP_KEY` via HMAC-SHA256, validating `_token`, `csrf_token`, or `X-CSRF-TOKEN` / `X-XSRF-TOKEN` headers without storing server-side session state.

### 3. Isolated GAS Iframe SPA Runtime
Google Apps Script Web Apps render inside nested sandboxed iframes that block standard cross-frame reloads (`X-Frame-Options`). `createHtmlOutputSafe()` in `src/core/Response.js` configures `XFrameOptionsMode.ALLOWALL` and injects the self-contained client runtime from `src/core/Helpers.js` that intercepts internal navigation and form submissions via `google.script.run.gasNavigate(...)` and `google.script.history`, keeping user Blade views in `src/resources/views/` completely clean.

### 4. GAS V8 Load-Order Safety & Request-Driven Controllers
In Google Apps Script's V8 runtime, top-level code executes sequentially by file order. `filePushOrder` in `.clasp.json` loads `Config.js`, `Database.js`, `Helpers.js`, `Validator.js`, `Response.js`, `View.js`, `CompiledViews.js`, `Hash.js`, `Csrf.js`, `SheetStore.js`, `Router.js`, `Migration.js`, `Seeder.js`, `Model.js`, `Controller.js`, `Authenticate.js`, and `Workspace.js` in deterministic order. Controllers extend `Controller` directly with deferred singleton instantiation (`Controller.resolve()`) and receive a `Request` wrapper (`src/core/Request.js`) on every action:

```javascript
class ProjectController extends Controller {
    index(request) {
        if (request.wantsJson()) {
            return Project.datatable(request);
        }

        return view("projects.index", {
            items: Project.with("owner").latest().get()
        });
    }

    store(request) {
        var data = request.only(["name", "status"]);
        var validation = Validator.make(data, {
            name: "required|string|max:255",
            status: "required|string|max:50"
        });
        if (validation.fails()) {
            return failResponse("Validation failed.", 422, { errors: validation.errors() });
        }

        return Project.create(data);
    }
}
```

Routes can be registered using string notation (`"ProjectController@index"`), Laravel tuple notation (`[ProjectController, "index"]`), or `Route.resource("projects", ProjectController)`.

### 5. Mass-Assignment Guard (`fillable` / `guarded`) & Output Redaction (`hidden`)
Every `Model` subclass (`src/core/Model.js`) must explicitly define at least `fillable` (allowed columns) or `guarded` (blocked columns, including `guarded = ["*"]` or `guarded = []`); omitting both throws `ModelConfigurationError`. Columns listed in `guarded` cannot be written or altered via `create()` or `update()`, while trusted system operations (such as updating `session` and `session_expires_at` during login/logout) use `Model.forceUpdate()` to bypass mass-assignment guards. `hidden` operates independently as an optional output filter (`[]` by default) and can be selectively revealed via `.withHidden(...)`.

### 6. Sensitive & Generated File Isolation
`.env`, `.clasp.json`, `.clasprc.json`, `creds.json`, `local/storage/*.json`, and `src/core/CompiledViews.js` are ignored via `.gitignore` so personal credentials, local test records, and compiled view artifacts stay out of version control.

---

## License

Released under the [MIT License](LICENSE).
