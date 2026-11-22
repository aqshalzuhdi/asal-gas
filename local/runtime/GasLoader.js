const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { installGasGlobals } = require("./GasMocks");
const { loadLocalEnv } = require("./EnvLoader");

const ROOT_DIR = path.join(__dirname, "../..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const ENV_FILE = path.join(ROOT_DIR, ".env");

const REQUIRED_CORE = [
    "config/config.js",
    "core/database.js",
    "core/foglobal.js",
    "core/hash.js",
    "core/crud.js",
    "core/Core_Router.js",
    "core/Database_Migration.js",
    "core/Database_Seeder.js",
    "core/Controller_Base.js",
    "middleware/middleware.js"
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
    "SHEET_ID",
    "BASE_URL",
    "JWT_SECRET",
    "API_KEY"
];

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

    const keys = Object.keys(mergedEnv);
    if (keys.length === 0) return;

    if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
        const props = PropertiesService.getScriptProperties();
        const updates = {};

        for (const key of keys) {
            const val = String(mergedEnv[key] ?? "").trim();
            if (val === "") continue;
            updates[key] = val;
        }

        if (Object.keys(updates).length > 0 && typeof props.setProperties === "function") {
            props.setProperties(updates, false);
        }
    }
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

    for (const folder of LAYER_FOLDERS) {
        const files = getJsFilesRecursive(path.join(SRC_DIR, folder));
        for (const file of files) {
            loadFile(file);
        }
    }

    loadFile(path.join(SRC_DIR, "main.js"));
}

module.exports = { bootGasRuntime };
