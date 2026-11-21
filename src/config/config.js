const CONFIG = {
    _runtime: {},

    has: function (key) {
        if (this._runtime[key]) return true;
        const value = PropertiesService.getScriptProperties().getProperty(key);
        return value !== null && String(value).trim() !== "";
    },

    get: function (key) {
        if (this._runtime[key]) {
            return this._runtime[key];
        }

        const value = PropertiesService.getScriptProperties().getProperty(key);
        if (!value || String(value).trim() === "") {
            throw new Error("Missing required configuration: " + key + ". Run setupWorkspace() first.");
        }
        return String(value).trim();
    },

    getOptional: function (key, defaultValue) {
        if (this._runtime[key]) {
            return this._runtime[key];
        }
        const value = PropertiesService.getScriptProperties().getProperty(key);
        return value !== null && String(value).trim() !== "" ? String(value).trim() : defaultValue;
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
            } catch (_) {}
        }

        throw new Error("Missing required configuration: BASE_URL. Set it in Script Properties or access the /exec Web App.");
    }
};

var WorkspaceSetup = {
    DEFAULT_SPREADSHEET_NAME: "Asal-GAS Database",

    init: function (options) {
        if (typeof ScriptApp === "undefined") {
            return { status: false, message: "This setup can only run inside Google Apps Script." };
        }

        options = options || {};
        var lock = LockService.getScriptLock();
        lock.waitLock(30000);

        try {
            var props = PropertiesService.getScriptProperties();
            var sheetId = props.getProperty("SHEET_ID") || "";
            var baseUrl = props.getProperty("BASE_URL") || "";
            var isFirstSetup = false;

            if (!sheetId) {
                var appName = CONFIG.has("APP_NAME")
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
            } catch (_) {}

            if (options.webAppUrl && baseUrl !== options.webAppUrl) {
                baseUrl = options.webAppUrl;
                props.setProperty("BASE_URL", baseUrl);
            } else if (!baseUrl && serviceUrl.indexOf("/exec") !== -1) {
                baseUrl = serviceUrl;
                props.setProperty("BASE_URL", baseUrl);
            }

            CONFIG._runtime.SHEET_ID = sheetId;
            if (baseUrl) CONFIG._runtime.BASE_URL = baseUrl;

            var migrationRes = null;
            var seederRes = null;

            if ((isFirstSetup || options.migrate === true) && typeof migrate === "function") {
                migrationRes = migrate();
            }
            if ((isFirstSetup || options.seed === true) && typeof dbSeed === "function") {
                seederRes = dbSeed();
            }

            var sheetUrl = "https://docs.google.com/spreadsheets/d/" + sheetId + "/edit";
            var result = {
                status: true,
                first_setup: isFirstSetup,
                SHEET_ID: sheetId,
                BASE_URL: baseUrl,
                SHEET_URL: sheetUrl,
                migration: migrationRes,
                seeder: seederRes
            };

            this._printReport(result);
            return result;
        } finally {
            lock.releaseLock();
        }
    },

    _printReport: function (res) {
        Logger.log("====================================================================");
        Logger.log(" WORKSPACE ENVIRONMENT & SCRIPT PROPERTIES REPORT");
        Logger.log("====================================================================");
        Logger.log((res.first_setup ? "[CREATED]  " : "[EXISTING] ") + "SHEET_ID = " + res.SHEET_ID);
        Logger.log("           URL: " + res.SHEET_URL);
        Logger.log("[ACTIVE]   BASE_URL = " + (res.BASE_URL || "(Auto-captured on first /exec request, or set manually from 'gas deploy' output)"));
        if (res.migration) {
            Logger.log("[MIGRATE]  " + JSON.stringify(res.migration));
        }
        if (res.seeder) {
            Logger.log("[SEEDER]   " + JSON.stringify(res.seeder));
        }
        Logger.log("====================================================================");
    }
};

function setupWorkspace(options) {
    return WorkspaceSetup.init(options);
}
