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
    }
};

function generateAppKey() {
    if (
        typeof Utilities !== "undefined" &&
        typeof Utilities.computeDigest === "function" &&
        typeof Utilities.getUuid === "function" &&
        typeof Utilities.base64Encode === "function"
    ) {
        var seedA = Utilities.getUuid() + ":" + Date.now() + ":" + Math.random();
        var seedB = Utilities.getUuid() + ":" + Math.random() + ":" + new Date().toISOString();
        var digestA = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seedA);
        var digestB = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seedB);
        var bytes = [];
        for (var i = 0; i < 16; i++) bytes.push(digestA[i]);
        for (var j = 0; j < 16; j++) bytes.push(digestB[j]);
        return "base64:" + Utilities.base64Encode(bytes);
    }

    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var token = "";
    for (var k = 0; k < 43; k++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return "base64:" + token + "=";
}
