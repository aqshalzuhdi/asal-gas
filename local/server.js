const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { loadLocalEnv } = require("./runtime/EnvLoader");
const { bootGasRuntime } = require("./runtime/GasLoader");

const sseClients = new Set();
const viewsWatchDir = path.join(__dirname, "..", "src", "resources", "views");
let reloadDebounce = null;

const envMap = loadLocalEnv(path.resolve(__dirname, "../.env"));
for (const [key, val] of Object.entries(envMap)) {
    if (!(key in process.env) && val !== "") {
        process.env[key] = val;
    }
}

bootGasRuntime();

const START_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT = START_PORT + 100;

function isHotReloadEnabled() {
    if (typeof global.isDebugEnabled === "function") {
        return global.isDebugEnabled();
    }
    return String(process.env.APP_DEBUG || "true").trim().toLowerCase() === "true";
}

function injectLiveReloadScript(html) {
    if (!isHotReloadEnabled() || typeof html !== "string") return html;
    if (html.includes("/__gas_reload")) return html;

    const liveReloadScript = `<script>(function(){var es=new EventSource("/__gas_reload");es.onmessage=function(e){if(e.data==="reload")location.reload();};window.addEventListener("beforeunload",function(){es.close();});window.addEventListener("pagehide",function(){es.close();});})();</script>`;
    return html.includes("</body>")
        ? html.replace("</body>", `${liveReloadScript}</body>`)
        : `${html}${liveReloadScript}`;
}

function detectHtmlResponse(output, rawText) {
    if (output && typeof output.getMimeType === "function") {
        const mime = String(output.getMimeType() || "").toUpperCase();
        if (mime.includes("HTML")) return true;
        if (mime.includes("JSON")) return false;
    }
    const trimmed = String(rawText || "").trim();
    return trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html");
}

function extractStatusCode(output, rawText, isHtml) {
    if (output && typeof output._statusCode === "number") {
        return output._statusCode;
    }
    if (isHtml) {
        const metaMatch = String(rawText || "").match(/<meta\s+name=["']http-status["']\s+content=["'](\d{3})["']/i);
        if (metaMatch) return Number(metaMatch[1]);
        return 200;
    }
    try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed.code === "number") return parsed.code;
    } catch (_) { }
    return 200;
}

if (fs.existsSync(viewsWatchDir)) {
    fs.watch(viewsWatchDir, { recursive: true }, (eventType, filename) => {
        if (!filename || !/\.gas\.js$/i.test(filename)) return;
        clearTimeout(reloadDebounce);
        reloadDebounce = setTimeout(() => {
            for (const client of sseClients) {
                try {
                    client.write("data: reload\n\n");
                } catch (_) {
                    sseClients.delete(client);
                }
            }
        }, 120);
    });
}

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Accept, X-Requested-With, X-Session-Key, X-CSRF-Token, X-XSRF-Token"
    );

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (parsedUrl.pathname === "/favicon.ico") {
        res.writeHead(204);
        return res.end();
    }

    if (parsedUrl.pathname === "/__gas_reload") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        });
        res.write(": connected\n\n");
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
    }

    const query = Object.fromEntries(parsedUrl.searchParams.entries());
    const cleanPath = parsedUrl.pathname ? parsedUrl.pathname.replace(/^\/+|\/+$/g, "") : "";

    if (!query.route && cleanPath) {
        query.route = cleanPath;
    }

    if (req.method !== "GET" && req.method !== "POST" && !query._method) {
        query._method = req.method;
    }

    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
        if (global._REQ_MEM) {
            global._REQ_MEM = { rows: {}, indexes: {}, schema: null };
        }
        if (typeof global._SPREADSHEET_INSTANCE !== "undefined") {
            global._SPREADSHEET_INSTANCE = null;
        }

        const parameters = {};
        for (const key of parsedUrl.searchParams.keys()) {
            parameters[key] = parsedUrl.searchParams.getAll(key);
        }
        if (query.route && !parameters.route) {
            parameters.route = [query.route];
        }

        const event = {
            parameter: query,
            parameters: parameters,
            pathInfo: cleanPath,
            queryString: parsedUrl.search.replace(/^\?/, ""),
            headers: req.headers || {},
            postData: body ? { contents: body, type: req.headers["content-type"] || "application/json" } : null
        };

        try {
            const output = req.method === "GET" ? global.doGet(event) : global.doPost(event);
            const rawText = typeof output?.getContent === "function" ? output.getContent() : JSON.stringify(output);
            const isHtml = detectHtmlResponse(output, rawText);
            const statusCode = extractStatusCode(output, rawText, isHtml);
            const finalBody = isHtml ? injectLiveReloadScript(rawText) : rawText;

            res.writeHead(statusCode, {
                "Content-Type": isHtml ? "text/html; charset=utf-8" : "application/json; charset=utf-8"
            });
            res.end(finalBody);
        } catch (err) {
            console.error("[LOCAL SERVER ERROR]", err);

            if (typeof global.handleHttpError === "function") {
                const errOut = global.handleHttpError(err, event, {
                    route: query.route || cleanPath,
                    method: req.method,
                    action: query.action || ""
                });
                const errText = typeof errOut?.getContent === "function" ? errOut.getContent() : JSON.stringify(errOut);
                const isHtml = detectHtmlResponse(errOut, errText);
                const statusCode = extractStatusCode(errOut, errText, isHtml) || 500;
                const finalErrBody = isHtml ? injectLiveReloadScript(errText) : errText;

                res.writeHead(statusCode, {
                    "Content-Type": isHtml ? "text/html; charset=utf-8" : "application/json; charset=utf-8"
                });
                return res.end(finalErrBody);
            }

            const debug = typeof global.isDebugEnabled === "function" && global.isDebugEnabled();
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(
                debug
                    ? { status: false, code: 500, error_type: err.name || "Error", message: err.message, stack: String(err.stack || "") }
                    : { status: false, code: 500, message: "Internal server error." }
            ));
        }
    });
});

function isTcpPortOpen(port, host) {
    return new Promise((resolve) => {
        const socket = net.connect({ port, host });
        socket.setTimeout(150);

        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });

        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });

        socket.once("error", () => {
            socket.destroy();
            resolve(false);
        });
    });
}

function canBindHost(port, host) {
    return new Promise((resolve) => {
        const tester = net.createServer();
        tester.unref();

        tester.once("error", (err) => {
            if (err.code === "EAFNOSUPPORT" || err.code === "EADDRNOTAVAIL") {
                resolve(true);
            } else {
                resolve(false);
            }
        });

        tester.once("listening", () => {
            tester.close(() => resolve(true));
        });

        tester.listen({ port, host, exclusive: true });
    });
}

async function findAvailablePort(startPort, maxPort) {
    for (let port = startPort; port <= maxPort; port++) {
        const inUseV4 = await isTcpPortOpen(port, "127.0.0.1");
        const inUseV6 = await isTcpPortOpen(port, "::1");
        if (inUseV4 || inUseV6) {
            console.log(`⚠️  Port ${port} is already in use, trying port ${port + 1}...`);
            continue;
        }

        const checks = await Promise.all([
            canBindHost(port, "0.0.0.0"),
            canBindHost(port, "127.0.0.1"),
            canBindHost(port, "::"),
            canBindHost(port, "::1")
        ]);

        if (checks.every(Boolean)) {
            return port;
        }

        console.log(`⚠️  Port ${port} is already in use, trying port ${port + 1}...`);
    }

    throw new Error(`No available port found between ${startPort} and ${maxPort}.`);
}

(async () => {
    try {
        const activePort = await findAvailablePort(START_PORT, MAX_PORT);

        server.listen({ port: activePort, exclusive: true }, () => {
            if (global.CONFIG && global.CONFIG._runtime) {
                global.CONFIG._runtime.BASE_URL = `http://localhost:${activePort}`;
            }

            console.log(`🚀 Asal-GAS Local Dev Server running at http://localhost:${activePort}`);
            console.log(`   Example GET: http://localhost:${activePort}`);
        });
    } catch (err) {
        console.error("❌ Failed to start server:", err.message);
        process.exit(1);
    }
})();
