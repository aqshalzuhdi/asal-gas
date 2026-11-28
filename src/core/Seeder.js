var Seeder = {
    _registry: {},

    register: function (seederName, definition) {
        if (!seederName || !definition || typeof definition.run !== "function") {
            throw new Error("Invalid seeder registration: " + seederName);
        }
        this._registry[seederName] = definition;
    },

    _normalizeResult: function (rawRes, trackedCounts) {
        var tables = Object.keys(trackedCounts || {});
        var autoItems = tables.map(function (tbl) {
            return { table: tbl, count: trackedCounts[tbl] };
        });

        if (rawRes === null || rawRes === undefined) {
            return autoItems.length === 1 ? autoItems[0] : (autoItems.length > 1 ? autoItems : null);
        }

        if (Array.isArray(rawRes)) {
            var filtered = rawRes.filter(function (v) {
                return v !== null && v !== undefined;
            });
            if (filtered.length === 0) {
                return autoItems.length === 1 ? autoItems[0] : (autoItems.length > 1 ? autoItems : null);
            }
            return filtered;
        }

        if (typeof rawRes === "object") {
            if (rawRes.count === undefined && autoItems.length === 1) {
                rawRes.count = autoItems[0].count;
                if (!rawRes.table) rawRes.table = autoItems[0].table;
            }
            return rawRes;
        }

        return rawRes;
    },

    call: function (seederNames) {
        var list = Array.isArray(seederNames) ? seederNames : [seederNames];
        var results = [];
        var self = this;

        for (var i = 0; i < list.length; i++) {
            var name = list[i];
            var instance = this._registry[name];
            if (!instance) {
                throw new Error("Seeder '" + name + "' is not registered.");
            }

            if (typeof instance.call !== "function") {
                instance.call = function (subSeeders) {
                    return self.call(subSeeders);
                };
            }

            var trackedCounts = {};
            var hasGlobalCreate = typeof create === "function";
            var originalCreate = hasGlobalCreate ? create : null;

            if (hasGlobalCreate) {
                create = function (sheetName, params) {
                    var createRes = originalCreate.apply(this, arguments);
                    if (createRes && createRes.status !== false && sheetName) {
                        trackedCounts[sheetName] = (trackedCounts[sheetName] || 0) + 1;
                    }
                    return createRes;
                };
            }

            var rawRes;
            try {
                Logger.log("Seeding: " + name);
                rawRes = instance.run();
                Logger.log("Seeded:  " + name);
            } finally {
                if (hasGlobalCreate) {
                    create = originalCreate;
                }
            }

            var normalized = this._normalizeResult(rawRes, trackedCounts);
            results.push({ seeder: name, result: normalized });
        }

        return results;
    },

    allNames: function () {
        return Object.keys(this._registry);
    }
};

var DatabaseSeeder = {
    order: [
        "UserSeeder"
    ],

    run: function () {
        var targetSeeders = this.order.filter(function (name) {
            return Boolean(Seeder._registry[name]);
        });

        Seeder.allNames().forEach(function (name) {
            if (name !== "DatabaseSeeder" && targetSeeders.indexOf(name) === -1) {
                targetSeeders.push(name);
            }
        });

        var results = Seeder.call(targetSeeders);

        if (typeof rebuildAllIndexes === "function") {
            rebuildAllIndexes();
        }

        return JSON.parse(JSON.stringify({ status: true, results: results }));
    }
};

function dbSeed(seederName) {
    if (seederName && seederName !== "DatabaseSeeder") {
        var results = Seeder.call(seederName);
        if (typeof rebuildAllIndexes === "function") {
            rebuildAllIndexes();
        }
        return JSON.parse(JSON.stringify({ status: true, results: results }));
    }

    return DatabaseSeeder.run();
}

function dbSeedUser() {
    return dbSeed("UserSeeder");
}
