const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { installGasGlobals } = require("./GasMocks");

const SRC_DIR = path.join(__dirname, "../../src");

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

function bootGasRuntime() {
    installGasGlobals();

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
