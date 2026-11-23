const CONFIG = {
    _runtime: {},
    _propsCache: null,

    defaults: {
        APP_NAME: "Asal-GAS",
        APP_MODE: "web",
        APP_ENV: "production",
        APP_DEBUG: "false"
    },

    _getProps: function () {
        if (this._propsCache === null) {
            this._propsCache = PropertiesService.getScriptProperties().getProperties() || {};
        }
        return this._propsCache;
    },

    has: function (key) {
        if (this._runtime[key] !== undefined && String(this._runtime[key]).trim() !== "") return true;
        const value = this._getProps()[key];
        return value !== undefined && value !== null && String(value).trim() !== "";
    },

    get: function (key) {
        if (this._runtime[key] !== undefined && String(this._runtime[key]).trim() !== "") {
            return String(this._runtime[key]).trim();
        }

        const value = this._getProps()[key];
        if (!value || String(value).trim() === "") {
            throw new Error("Missing required configuration: " + key + ". Run setupWorkspace() first.");
        }
        return String(value).trim();
    },

    getOptional: function (key, defaultValue) {
        if (this._runtime[key] !== undefined && String(this._runtime[key]).trim() !== "") {
            return String(this._runtime[key]).trim();
        }
        const value = this._getProps()[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            return String(value).trim();
        }
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        return Object.prototype.hasOwnProperty.call(this.defaults, key) ? this.defaults[key] : null;
    },

    isDebug: function () {
        const val = this.getOptional("APP_DEBUG", false);
        if (typeof val === "boolean") return val;
        if (typeof val === "number") return val === 1;
        if (typeof val === "string") {
            return ["true", "1", "yes", "on"].indexOf(val.trim().toLowerCase()) !== -1;
        }
        return Boolean(val);
    },

    clearCache: function () {
        this._propsCache = null;
    },

    get SHEET_ID() {
        return this.get("SHEET_ID");
    },

    get BASE_URL() {
        if (this._runtime.BASE_URL) {
            return this._runtime.BASE_URL;
        }

        const saved = this._getProps()["BASE_URL"];
        if (saved && String(saved).trim() !== "") {
            this._runtime.BASE_URL = String(saved).trim();
            return this._runtime.BASE_URL;
        }

        if (typeof ScriptApp !== "undefined") {
            try {
                const serviceUrl = ScriptApp.getService().getUrl() || "";
                if (serviceUrl.indexOf("/exec") !== -1) {
                    PropertiesService.getScriptProperties().setProperty("BASE_URL", serviceUrl);
                    this._propsCache.BASE_URL = serviceUrl;
                    this._runtime.BASE_URL = serviceUrl;
                    return serviceUrl;
                }
            } catch (_) { }
        }

        throw new Error("Missing required configuration: BASE_URL. Set it in Script Properties or access the /exec Web App.");
    },

    get API_PREFIX() {
        var raw = this.getOptional("API_PREFIX", "api");
        var cleaned = String(raw === null || raw === undefined ? "api" : raw)
            .trim()
            .replace(/^\/+|\/+$/g, "");
        var lower = cleaned.toLowerCase();
        if (lower === "true" || lower === "1") return "api";
        if (lower === "none" || lower === "false" || lower === "0" || cleaned === "-") return "";
        return cleaned;
    },

    get APP_MODE() {
        var raw = String(this.getOptional("APP_MODE", "web") || "web").trim().toLowerCase();
        return raw === "api" ? "api" : "web";
    },

    get APP_KEY() {
        return this.getOptional("APP_KEY", "");
    },
};

var WorkspaceSetup = {
    DEFAULT_SPREADSHEET_NAME: "Asal-GAS Database",

    init: function (options) {
        if (typeof ScriptApp === "undefined") {
            return { status: false, message: "This setup can only run inside Google Apps Script." };
        }

        options = (options && typeof options === "object") ? options : {};
        var lock = LockService.getScriptLock();
        lock.waitLock(30000);

        try {
            if (options.env && typeof EnvSync !== "undefined") {
                EnvSync.apply(options.env, typeof CONFIG !== "undefined" ? CONFIG : null);
            }

            var props = PropertiesService.getScriptProperties();
            var sheetId = String(props.getProperty("SHEET_ID") || "").trim();
            var baseUrl = String(props.getProperty("BASE_URL") || "").trim();
            var isFirstSetup = false;

            if (!sheetId) {
                var appName = (typeof CONFIG !== "undefined" && CONFIG.has("APP_NAME"))
                    ? CONFIG.get("APP_NAME") + " - Database"
                    : this.DEFAULT_SPREADSHEET_NAME;

                var newSs = SpreadsheetApp.create(appName);
                sheetId = newSs.getId();
                props.setProperty("SHEET_ID", sheetId);
                isFirstSetup = true;
            }

            var serviceUrl = "";
            try {
                serviceUrl = ScriptApp.getService().getUrl() || "";
            } catch (_) { }

            if (options.webAppUrl && baseUrl !== options.webAppUrl) {
                baseUrl = String(options.webAppUrl).trim();
                props.setProperty("BASE_URL", baseUrl);
            } else if (!baseUrl && serviceUrl.indexOf("/exec") !== -1) {
                baseUrl = serviceUrl;
                props.setProperty("BASE_URL", baseUrl);
            }

            if (typeof CONFIG !== "undefined") {
                if (CONFIG._runtime) {
                    CONFIG._runtime.SHEET_ID = sheetId;
                    if (baseUrl) CONFIG._runtime.BASE_URL = baseUrl;
                }
                if ("_propsCache" in CONFIG) {
                    CONFIG._propsCache = null;
                }
            }

            var shouldMigrate = options.migrate === undefined ? true : Boolean(options.migrate);
            var shouldSeed = Boolean(options.seed);

            var migrationRes = (shouldMigrate && typeof migrate === "function") ? migrate() : null;
            var seederRes = (shouldSeed && typeof dbSeed === "function") ? dbSeed() : null;

            return {
                status: true,
                first_setup: isFirstSetup,
                SHEET_ID: sheetId,
                SHEET_URL: sheetId ? "https://docs.google.com/spreadsheets/d/" + sheetId + "/edit" : "",
                BASE_URL: baseUrl,
                APP_KEY: String(props.getProperty("APP_KEY") || ""),
                migration: migrationRes,
                seeder: seederRes
            };
        } finally {
            lock.releaseLock();
        }
    }
};

function setupWorkspace(options) {
    return WorkspaceSetup.init(options);
}
