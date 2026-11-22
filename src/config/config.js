const CONFIG = {
    _runtime: {},

    defaults: {
        APP_NAME: "Asal-GAS",
        APP_MODE: "web",
        APP_ENV: "production",
        APP_DEBUG: "false"
    },

    has: function (key) {
        if (this._runtime[key] !== undefined && String(this._runtime[key]).trim() !== "") return true;
        const value = PropertiesService.getScriptProperties().getProperty(key);
        return value !== null && String(value).trim() !== "";
    },

    get: function (key) {
        if (this._runtime[key] !== undefined && String(this._runtime[key]).trim() !== "") {
            return String(this._runtime[key]).trim();
        }

        const value = PropertiesService.getScriptProperties().getProperty(key);
        if (!value || String(value).trim() === "") {
            throw new Error("Missing required configuration: " + key + ". Run setupWorkspace() first.");
        }
        return String(value).trim();
    },

    getOptional: function (key, defaultValue) {
        if (this._runtime[key] !== undefined && String(this._runtime[key]).trim() !== "") {
            return String(this._runtime[key]).trim();
        }
        const value = PropertiesService.getScriptProperties().getProperty(key);
        if (value !== null && String(value).trim() !== "") {
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

    get SHEET_ID() {
        return this.get("SHEET_ID");
    },

    get BASE_URL() {
        if (this._runtime.BASE_URL) {
            return this._runtime.BASE_URL;
        }

        const props = PropertiesService.getScriptProperties();
        const saved = props.getProperty("BASE_URL");
        if (saved && String(saved).trim() !== "") {
            this._runtime.BASE_URL = String(saved).trim();
            return this._runtime.BASE_URL;
        }

        if (typeof ScriptApp !== "undefined") {
            try {
                const serviceUrl = ScriptApp.getService().getUrl() || "";
                if (serviceUrl.indexOf("/exec") !== -1) {
                    props.setProperty("BASE_URL", serviceUrl);
                    this._runtime.BASE_URL = serviceUrl;
                    return serviceUrl;
                }
            } catch (_) { }
        }

        throw new Error("Missing required configuration: BASE_URL. Set it in Script Properties or access the /exec Web App.");
    }
};
