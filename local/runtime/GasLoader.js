const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { installGasGlobals } = require("./GasMocks");
const { loadLocalEnv } = require("./EnvLoader");

const ROOT_DIR = path.resolve(__dirname, "../..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const ENV_FILE = path.join(ROOT_DIR, ".env");

const REQUIRED_CORE = [
    "config/Config.js",
    "core/Database.js",
    "core/Helpers.js",
    "core/Validator.js",
    "core/Response.js",
    "core/View.js",
    "core/Hash.js",
    "core/Csrf.js",
    "core/SheetStore.js",
    "core/Request.js",
    "core/Router.js",
    "core/Migration.js",
    "core/Seeder.js",
    "core/Model.js",
    "core/Controller.js",
    "middleware/Authenticate.js",
    "core/Workspace.js"
];

const OPTIONAL_CORE = [
    "core/CompiledViews.js"
];

const LAYER_FOLDERS = [
    "config",
    "core",
    "middleware",
    "tools",
    "app",
    "database/migrations",
    "database/seeders",
    "routes"
];

const OVERRIDABLE_ENV_KEYS = [
    "APP_NAME",
    "APP_MODE",
    "APP_ENV",
    "APP_DEBUG",
    "APP_KEY",
    "API_PREFIX",
    "SESSION_TTL_MINUTES",
    "SHEET_ID",
    "BASE_URL"
];

const CLEARABLE_EMPTY_KEYS = new Set([
    "API_PREFIX"
]);

function getJsFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    let files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(getJsFilesRecursive(fullPath));
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }
    return files;
}

function hydrateLocalEnvToProperties() {
    const fileEnv = loadLocalEnv(ENV_FILE);
    const mergedEnv = { ...fileEnv };

    for (const key of OVERRIDABLE_ENV_KEYS) {
        if (process.env[key] !== undefined && String(process.env[key]).trim() !== "") {
            mergedEnv[key] = String(process.env[key]).trim();
        }
    }

    if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
        const props = PropertiesService.getScriptProperties();
        const updates = {};

        for (const key of Object.keys(mergedEnv)) {
            const val = String(mergedEnv[key] ?? "").trim();
            if (val === "") {
                if (CLEARABLE_EMPTY_KEYS.has(key)) {
                    updates[key] = "";
                }
                continue;
            }
            updates[key] = val;
        }

        const existingKey = typeof props.getProperty === "function" ? props.getProperty("APP_KEY") : null;
        if (!updates.APP_KEY && (!existingKey || String(existingKey).trim() === "")) {
            updates.APP_KEY = "base64:" + crypto.randomBytes(32).toString("base64");
        }

        if (Object.keys(updates).length > 0 && typeof props.setProperties === "function") {
            props.setProperties(updates, false);
        }
    }
}

function registerViewsFromDisk() {
    const viewsRoot = path.join(SRC_DIR, "resources", "views");
    if (!fs.existsSync(viewsRoot) || typeof global.View === "undefined") {
        return;
    }

    function walkViews(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walkViews(fullPath);
            } else if (entry.isFile() && /\.gas\.js$/i.test(entry.name)) {
                const relPath = path.relative(viewsRoot, fullPath).replace(/\\/g, "/");
                const viewName = relPath.replace(/\.gas\.js$/i, "").replace(/\//g, ".");
                const rawHtml = fs.readFileSync(fullPath, "utf8");
                global.View.register(viewName, rawHtml);
            }
        }
    }

    walkViews(viewsRoot);
}

function bootGasRuntime() {
    installGasGlobals();
    hydrateLocalEnvToProperties();

    for (const relPath of REQUIRED_CORE) {
        const fullPath = path.join(SRC_DIR, relPath);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Core file does not exist in src/: ${relPath}`);
        }
    }

    const loaded = new Set();

    function loadFile(fullPath) {
        const normalized = path.normalize(fullPath);
        if (loaded.has(normalized) || !fs.existsSync(normalized)) return;
        vm.runInThisContext(fs.readFileSync(normalized, "utf8"), { filename: normalized });
        loaded.add(normalized);
    }

    for (const relPath of REQUIRED_CORE) {
        loadFile(path.join(SRC_DIR, relPath));
    }

    for (const relPath of OPTIONAL_CORE) {
        loadFile(path.join(SRC_DIR, relPath));
    }

    for (const folder of LAYER_FOLDERS) {
        const files = getJsFilesRecursive(path.join(SRC_DIR, folder));
        for (const file of files) {
            loadFile(file);
        }
    }

    loadFile(path.join(SRC_DIR, "main.js"));
    registerViewsFromDisk();
}

module.exports = { bootGasRuntime };
