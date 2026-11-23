var EnvSync = {
    apply: function (envMap, targetConfig) {
        if (!envMap || typeof envMap !== "object") return [];
        if (typeof PropertiesService === "undefined" || !PropertiesService.getScriptProperties) {
            return [];
        }

        var props = PropertiesService.getScriptProperties();
        var existing = props.getProperties();
        var updates = {};
        var syncedKeys = [];

        Object.keys(envMap).forEach(function (key) {
            var k = String(key || "").trim();
            if (!k) return;

            var raw = envMap[key];
            if (raw === null || raw === undefined) return;
            var val = String(raw).trim();

            if ((k === "SHEET_ID" || k === "BASE_URL" || k === "APP_KEY") && val === "" && existing[k]) {
                return;
            }
            if (k === "APP_KEY" && existing[k] && existing[k] !== val) {
                return;
            }

            if (val !== "") {
                if (existing[k] !== val) {
                    updates[k] = val;
                }
                syncedKeys.push(k);

                if (targetConfig && targetConfig._runtime) {
                    targetConfig._runtime[k] = val;
                }
            }
        });

        if (Object.keys(updates).length > 0) {
            props.setProperties(updates, false);
        }

        return syncedKeys;
    }
};
