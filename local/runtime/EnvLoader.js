const fs = require("fs");
const path = require("path");

function unescapeDoubleQuoted(str) {
    return str
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}

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

        if (isDoubleQuoted) {
            val = unescapeDoubleQuoted(val.slice(1, -1));
        } else if (isSingleQuoted) {
            val = val.slice(1, -1);
        } else {
            const commentMatch = val.match(/\s+#/);
            if (commentMatch && commentMatch.index !== undefined) {
                val = val.slice(0, commentMatch.index).trim();
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

function serializeEnvValue(value) {
    if (value === undefined || value === null) return "";
    const str = String(value);
    if (str === "") return "";

    if (/[\s#"'\\]/.test(str)) {
        const escaped = str
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n");
        return `"${escaped}"`;
    }

    return str;
}

function setLocalEnvValues(updates, envPath) {
    if (!updates || typeof updates !== "object") return;
    const target = envPath || path.join(process.cwd(), ".env");
    const existingContent = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    const lines = existingContent ? existingContent.split(/\r?\n/) : [];
    const pending = Object.assign({}, updates);
    const handled = new Set();

    const updatedLines = lines.map((rawLine) => {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith("#")) return rawLine;

        const hasExport = trimmed.startsWith("export ");
        const clean = hasExport ? trimmed.slice(7).trim() : trimmed;
        const eqIdx = clean.indexOf("=");
        if (eqIdx === -1) return rawLine;

        const key = clean.slice(0, eqIdx).trim();
        if (!Object.prototype.hasOwnProperty.call(pending, key)) {
            return rawLine;
        }

        handled.add(key);
        const formatted = serializeEnvValue(pending[key]);
        return `${hasExport ? "export " : ""}${key}=${formatted}`;
    });

    for (const [key, val] of Object.entries(pending)) {
        if (!handled.has(key) && val !== undefined) {
            updatedLines.push(`${key}=${serializeEnvValue(val)}`);
        }
    }

    const finalText = updatedLines.join("\n").replace(/\n*$/, "\n");
    fs.writeFileSync(target, finalText, "utf8");
}

module.exports = {
    parseEnvContent,
    loadLocalEnv,
    serializeEnvValue,
    setLocalEnvValues
};
