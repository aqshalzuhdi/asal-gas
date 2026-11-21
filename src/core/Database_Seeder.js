var Seeder = {
    _registry: {},

    register: function (seederName, definition) {
        if (!seederName || !definition || typeof definition.run !== "function") {
            throw new Error("Invalid seeder registration: " + seederName);
        }
        this._registry[seederName] = definition;
    },

    call: function (seederNames) {
        var list = Array.isArray(seederNames) ? seederNames : [seederNames];
        var results = [];

        for (var i = 0; i < list.length; i++) {
            var name = list[i];
            var instance = this._registry[name];
            if (!instance) {
                throw new Error("Seeder '" + name + "' is not registered.");
            }

            Logger.log("Seeding: " + name);
            var res = instance.run();
            results.push({ seeder: name, result: res });
            Logger.log("Seeded:  " + name);
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
        var targetSeeders = this.order.slice();

        Seeder.allNames().forEach(function (name) {
            if (targetSeeders.indexOf(name) === -1) {
                targetSeeders.push(name);
            }
        });

        var results = Seeder.call(targetSeeders);

        if (typeof rebuildAllIndexes === "function") {
            rebuildAllIndexes();
        }

        return { status: true, results: results };
    }
};

function dbSeed() {
    return DatabaseSeeder.run();
}

function dbSeedUser() {
    return Seeder.call("UserSeeder");
}
