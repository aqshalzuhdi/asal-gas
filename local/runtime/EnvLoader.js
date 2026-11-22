const fs = require("fs");
const path = require("path");

function parseEnvContent(rawContent) {
    const out = {};
    if (!rawContent || typeof rawContent !== "string") return out;

    const lines = rawContent.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const clean = line.startsWith("export ") ? line.slice(7).trim() : line;
        const eqIdx = clean.indexOf("=");
        if (eqIdx === -1) continue;

        const key = clean.slice(0, eqIdx).trim();
        let val = clean.slice(eqIdx + 1).trim();

        const isDoubleQuoted = val.startsWith('"') && val.endsWith('"') && val.length >= 2;
        const isSingleQuoted = val.startsWith("'") && val.endsWith("'") && val.length >= 2;

        if (isDoubleQuoted || isSingleQuoted) {
            val = val.slice(1, -1);
        } else {
            const commentIdx = val.indexOf(" #");
            if (commentIdx !== -1) {
                val = val.slice(0, commentIdx).trim();
            }
        }

        if (key) {
            out[key] = val;
        }
    }

    return out;
}

function loadLocalEnv(envPath) {
    const target = envPath || path.join(process.cwd(), ".env");
    if (!fs.existsSync(target)) return {};
    return parseEnvContent(fs.readFileSync(target, "utf8"));
}

module.exports = {
    parseEnvContent,
    loadLocalEnv
};
