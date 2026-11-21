const http = require("http");
const net = require("net");
const { bootGasRuntime } = require("./runtime/GasLoader");

bootGasRuntime();

const START_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT = START_PORT + 100;

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    if (!query.route && parsedUrl.pathname && parsedUrl.pathname !== "/") {
        query.route = parsedUrl.pathname.replace(/^\/+|\/+$/g, "");
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
            postData: body ? { contents: body, type: req.headers["content-type"] || "application/json" } : null
        };

        try {
            const output = req.method === "GET" ? global.doGet(event) : global.doPost(event);
            const rawText = typeof output?.getContent === "function" ? output.getContent() : JSON.stringify(output);
            let statusCode = 200;
            try {
                const parsed = JSON.parse(rawText);
                if (parsed && typeof parsed.code === "number") statusCode = parsed.code;
            } catch (_) { }

            res.writeHead(statusCode, { "Content-Type": "application/json" });
            res.end(rawText);
        } catch (err) {
            console.error("[LOCAL SERVER ERROR]", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: false, message: err.message }));
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
