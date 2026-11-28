var EnvSync = {
    PROTECTED_KEYS: {
        SHEET_ID: true,
        APP_KEY: true,
        BASE_URL: true
    },

    CLI_ONLY_PREFIXES: [
        "GAS_DEPLOY_"
    ],

    isCliOnlyKey: function (key) {
        var k = String(key || "").trim();
        for (var i = 0; i < this.CLI_ONLY_PREFIXES.length; i++) {
            if (k.indexOf(this.CLI_ONLY_PREFIXES[i]) === 0) {
                return true;
            }
        }
        return false;
    },

    inspect: function () {
        if (typeof PropertiesService === "undefined" || !PropertiesService.getScriptProperties) {
            return {
                status: false,
                exists: false,
                properties: {},
                SHEET_ID: "",
                BASE_URL: "",
                APP_KEY: ""
            };
        }

        var props = PropertiesService.getScriptProperties().getProperties() || {};
        var keys = Object.keys(props);

        return {
            status: true,
            exists: keys.length > 0,
            count: keys.length,
            properties: props,
            SHEET_ID: String(props.SHEET_ID || "").trim(),
            BASE_URL: String(props.BASE_URL || "").trim(),
            APP_KEY: String(props.APP_KEY || "").trim()
        };
    },

    apply: function (envMap, targetConfig, options) {
        if (!envMap || typeof envMap !== "object") {
            return { synced: [], updated: [], added: [], skipped: [] };
        }
        if (typeof PropertiesService === "undefined" || !PropertiesService.getScriptProperties) {
            return { synced: [], updated: [], added: [], skipped: [] };
        }

        var opts = (options && typeof options === "object") ? options : {};
        var envMode = String(opts.envMode || "merge").trim().toLowerCase();
        if (["keep", "merge", "overwrite"].indexOf(envMode) === -1) {
            envMode = "merge";
        }
        var fresh = Boolean(opts.fresh);

        var props = PropertiesService.getScriptProperties();
        var existing = props.getProperties() || {};
        var updates = {};
        var syncedKeys = [];
        var updatedKeys = [];
        var addedKeys = [];
        var skippedKeys = [];
        var self = this;

        Object.keys(envMap).forEach(function (key) {
            var k = String(key || "").trim();
            if (!k || self.isCliOnlyKey(k)) return;

            var raw = envMap[key];
            if (raw === null || raw === undefined) return;
            var val = String(raw).trim();
            var hasExisting = Object.prototype.hasOwnProperty.call(existing, k) && String(existing[k] || "").trim() !== "";
            var currentVal = hasExisting ? String(existing[k]).trim() : "";

            if (self.PROTECTED_KEYS[k] && val === "" && hasExisting) {
                skippedKeys.push(k);
                return;
            }

            if (self.PROTECTED_KEYS[k] && hasExisting && envMode !== "overwrite" && !fresh) {
                skippedKeys.push(k);
                if (targetConfig && targetConfig._runtime) {
                    targetConfig._runtime[k] = currentVal;
                }
                return;
            }

            if (val === "") {
                skippedKeys.push(k);
                return;
            }

            if (envMode === "keep" && hasExisting) {
                skippedKeys.push(k);
                if (targetConfig && targetConfig._runtime) {
                    targetConfig._runtime[k] = currentVal;
                }
                return;
            }

            if (currentVal !== val) {
                updates[k] = val;
                if (hasExisting) {
                    updatedKeys.push(k);
                } else {
                    addedKeys.push(k);
                }
            }

            syncedKeys.push(k);
            if (targetConfig && targetConfig._runtime) {
                targetConfig._runtime[k] = val;
            }
        });

        if (Object.keys(updates).length > 0) {
            props.setProperties(updates, false);
        }

        return {
            mode: envMode,
            synced: syncedKeys,
            updated: updatedKeys,
            added: addedKeys,
            skipped: skippedKeys
        };
    }
};

var WorkspaceSetup = {
    DEFAULT_SPREADSHEET_NAME: "Asal-GAS Database",

    inspect: function () {
        return EnvSync.inspect();
    },

    init: function (options) {
        if (typeof ScriptApp === "undefined") {
            return { status: false, message: "This setup can only run inside Google Apps Script." };
        }

        options = (options && typeof options === "object") ? options : {};
        if (options.dryRun === true) {
            return this.inspect();
        }

        var lock = LockService.getScriptLock();
        lock.waitLock(30000);

        try {
            var envMode = String(options.envMode || "merge").trim().toLowerCase();
            var sheetMode = String(options.sheetMode || "keep").trim().toLowerCase();
            var fresh = Boolean(options.fresh);
            var autoGenerateKey = options.autoGenerateKey === undefined ? true : Boolean(options.autoGenerateKey);

            var syncResult = null;
            if (options.env) {
                syncResult = EnvSync.apply(options.env, typeof CONFIG !== "undefined" ? CONFIG : null, {
                    envMode: envMode,
                    sheetMode: sheetMode,
                    fresh: fresh
                });
            }

            var props = PropertiesService.getScriptProperties();
            var existingProps = props.getProperties() || {};
            var isFirstSetup = Object.keys(existingProps).length === 0;

            var appKey = String(props.getProperty("APP_KEY") || "").trim();
            var generatedAppKey = false;

            if (options.appKey && String(options.appKey).trim() !== "") {
                var incomingKey = String(options.appKey).trim();
                if (!appKey || envMode === "overwrite" || fresh || options.forceAppKey === true) {
                    appKey = incomingKey;
                    props.setProperty("APP_KEY", appKey);
                }
            } else if (!appKey && autoGenerateKey) {
                appKey = generateAppKey();
                props.setProperty("APP_KEY", appKey);
                generatedAppKey = true;
            }

            var sheetId = String(props.getProperty("SHEET_ID") || "").trim();
            var generatedSheet = false;
            var envSheetId = (options.env && options.env.SHEET_ID) ? String(options.env.SHEET_ID).trim() : "";
            var customSheetId = options.customSheetId ? String(options.customSheetId).trim() : "";

            if (sheetMode === "custom" && customSheetId) {
                sheetId = customSheetId;
                props.setProperty("SHEET_ID", sheetId);
            } else if (sheetMode === "env" && envSheetId) {
                sheetId = envSheetId;
                props.setProperty("SHEET_ID", sheetId);
            } else if (sheetMode === "generate" || !sheetId) {
                var appName = (typeof CONFIG !== "undefined" && CONFIG.has("APP_NAME"))
                    ? CONFIG.get("APP_NAME") + " - Database"
                    : this.DEFAULT_SPREADSHEET_NAME;

                var newSs = SpreadsheetApp.create(appName);
                sheetId = newSs.getId();
                props.setProperty("SHEET_ID", sheetId);
                generatedSheet = true;
                if (!existingProps.SHEET_ID) {
                    isFirstSetup = true;
                }
            }

            var baseUrl = String(props.getProperty("BASE_URL") || "").trim();
            var serviceUrl = "";
            try {
                serviceUrl = ScriptApp.getService().getUrl() || "";
            } catch (_) { }

            if (options.webAppUrl && String(options.webAppUrl).trim() !== "") {
                var incomingUrl = String(options.webAppUrl).trim();
                if (!baseUrl || envMode !== "keep" || fresh) {
                    baseUrl = incomingUrl;
                    props.setProperty("BASE_URL", baseUrl);
                }
            } else if (!baseUrl && serviceUrl.indexOf("/exec") !== -1) {
                baseUrl = serviceUrl;
                props.setProperty("BASE_URL", baseUrl);
            }

            if (typeof CONFIG !== "undefined") {
                if (CONFIG._runtime) {
                    if (sheetId) CONFIG._runtime.SHEET_ID = sheetId;
                    if (baseUrl) CONFIG._runtime.BASE_URL = baseUrl;
                    if (appKey) CONFIG._runtime.APP_KEY = appKey;
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
                generated_sheet: generatedSheet,
                generated_app_key: generatedAppKey,
                env_mode: envMode,
                sheet_mode: sheetMode,
                SHEET_ID: sheetId,
                SHEET_URL: sheetId ? "https://docs.google.com/spreadsheets/d/" + sheetId + "/edit" : "",
                BASE_URL: baseUrl,
                APP_KEY: appKey,
                sync_result: syncResult,
                migration: migrationRes,
                seeder: seederRes
            };
        } finally {
            lock.releaseLock();
        }
    }
};

function inspectWorkspace() {
    return WorkspaceSetup.inspect();
}

function setupWorkspace(options) {
    return WorkspaceSetup.init(options);
}
