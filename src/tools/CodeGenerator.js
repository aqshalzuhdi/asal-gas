/**
 * Code Generator for Google Apps Script Web Editor
 *
 * Usage:
 * 1. Set `GENERATOR_TARGET.module` (e.g., "Project"), then run one of:
 *    - `generateModule`     -> Scaffolds Model + Migration + Seeder + Controller
 *    - `generateModel`      -> Creates `Project` Model
 *    - `generateMigration`  -> Creates `CreateProjectsTable`
 *    - `generateSeeder`     -> Creates `ProjectSeeder`
 *    - `generateController` -> Creates `ProjectController`
 * 2. For custom names (e.g., alter table migrations), populate the specific
 *    override field (`model` / `migration` / `seeder` / `controller`).
 */
var GENERATOR_TARGET = {
    module: "",     // Primary target (sufficient for standard operations)
    model: "",      // Optional override, e.g., "Project"
    migration: "",  // Optional override, e.g., "AddLinkedinToCompaniesTable"
    seeder: "",     // Optional override, e.g., "AdminUserSeeder"
    controller: ""  // Optional override, e.g., "ReportController"
};

var CodeGenerator = {
    API_BASE: "https://script.googleapis.com/v1/projects/",

    module: function (rawModuleName) {
        var entityPascal = this._resolveBaseEntity(rawModuleName || GENERATOR_TARGET.module);
        if (!entityPascal) {
            throw new Error("Module name cannot be empty. Set GENERATOR_TARGET.module first.");
        }

        var tableName = this._pluralizeSnake(this._toSnakeCase(entityPascal));
        var tablePascal = this._toPascalCase(tableName);

        var filesToCreate = [
            this._prepareModelFile(entityPascal),
            this._prepareMigrationFile("Create" + tablePascal + "Table", 0),
            this._prepareSeederFile(entityPascal + "Seeder"),
            this._prepareControllerFile(entityPascal + "Controller", { sheet: tableName })
        ];

        var result = this._createProjectFiles(filesToCreate);

        Logger.log("=== MODULE SCAFFOLDING COMPLETED (" + entityPascal + ") ===");
        Logger.log('Register in routes/api -> Route.resource("' + tableName + '", "' + entityPascal + 'Controller");');
        return result;
    },

    model: function (rawName) {
        var target = String(rawName || GENERATOR_TARGET.model || GENERATOR_TARGET.module || "").trim();
        if (!target) {
            throw new Error("Set GENERATOR_TARGET.module or GENERATOR_TARGET.model first.");
        }

        var fileSpec = this._prepareModelFile(target);
        return this._createProjectFiles([fileSpec]);
    },

    migration: function (rawName) {
        var target = String(rawName || GENERATOR_TARGET.migration || "").trim();

        if (!target && GENERATOR_TARGET.module) {
            var entityPascal = this._resolveBaseEntity(GENERATOR_TARGET.module);
            var tablePascal = this._toPascalCase(this._pluralizeSnake(this._toSnakeCase(entityPascal)));
            target = "Create" + tablePascal + "Table";
        }

        if (!target) {
            throw new Error("Set GENERATOR_TARGET.module or GENERATOR_TARGET.migration first.");
        }

        var fileSpec = this._prepareMigrationFile(target, 0);
        return this._createProjectFiles([fileSpec]);
    },

    seeder: function (rawName) {
        var target = String(rawName || GENERATOR_TARGET.seeder || GENERATOR_TARGET.module || "").trim();
        if (!target) {
            throw new Error("Set GENERATOR_TARGET.module or GENERATOR_TARGET.seeder first.");
        }

        var fileSpec = this._prepareSeederFile(target);
        return this._createProjectFiles([fileSpec]);
    },

    controller: function (rawName, options) {
        var target = String(rawName || GENERATOR_TARGET.controller || GENERATOR_TARGET.module || "").trim();
        if (!target) {
            throw new Error("Set GENERATOR_TARGET.module or GENERATOR_TARGET.controller first.");
        }

        var fileSpec = this._prepareControllerFile(target, options);
        var result = this._createProjectFiles([fileSpec]);

        if (fileSpec.meta && fileSpec.meta.routeSuggestion) {
            Logger.log("Register in routes/api -> " + fileSpec.meta.routeSuggestion);
        }
        return result;
    },

    _resolveBaseEntity: function (rawInput) {
        var clean = String(rawInput || "").trim();
        if (!clean) return "";
        var pascal = this._toPascalCase(clean);
        return pascal.replace(/(Controller|Seeder)$/, "") || pascal;
    },

    _prepareModelFile: function (rawName) {
        var entityPascal = this._resolveBaseEntity(rawName);
        return {
            name: entityPascal,
            source: this._buildModelTemplate(entityPascal),
            meta: { model: entityPascal }
        };
    },

    _prepareMigrationFile: function (rawName, offsetSeconds) {
        var pascalName = this._toPascalCase(rawName);
        var snakeName = this._toSnakeCase(pascalName);
        var dateObj = new Date(Date.now() + (offsetSeconds || 0) * 1000);
        var timestamp = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy_MM_dd_HHmmss");

        var migrationId = timestamp + "_" + snakeName;
        var gasFileName = "Migration_" + timestamp + "_" + pascalName;

        return {
            name: gasFileName,
            source: this._buildMigrationTemplate(migrationId, snakeName),
            meta: { migrationId: migrationId }
        };
    },

    _prepareSeederFile: function (rawName) {
        var baseEntity = this._resolveBaseEntity(rawName);
        var pascalName = baseEntity + "Seeder";
        var tableName = this._pluralizeSnake(this._toSnakeCase(baseEntity));
        var gasFileName = "Seeder_" + baseEntity;

        return {
            name: gasFileName,
            source: this._buildSeederTemplate(pascalName, baseEntity, tableName),
            meta: { seeder: pascalName, table: tableName }
        };
    },

    _prepareControllerFile: function (rawName, options) {
        var opts = options || {};
        var baseEntity = this._resolveBaseEntity(rawName);
        var pascalName = baseEntity + "Controller";
        var tableName = opts.sheet || this._pluralizeSnake(this._toSnakeCase(baseEntity));
        var gasFileName = pascalName;
        var sourceCode = opts.plain
            ? this._buildPlainControllerTemplate(pascalName)
            : this._buildResourceControllerTemplate(pascalName, baseEntity);

        var routeSuggestion = opts.plain
            ? 'Route.get("' + this._toSnakeCase(baseEntity) + '", "' + pascalName + '@index");'
            : 'Route.resource("' + tableName + '", "' + pascalName + '");';

        return {
            name: gasFileName,
            source: sourceCode,
            meta: {
                controller: pascalName,
                routeSuggestion: routeSuggestion
            }
        };
    },

    _buildModelTemplate: function (modelName) {
        return [
            'class ' + modelName + ' extends Model {',
            '    // Define either fillable or guarded (required):',
            '    fillable = [',
            '        "name"',
            '    ];',
            '',
            '    // guarded = [',
            '    //     "id"',
            '    // ];',
            '',
            '    // Optional output redaction:',
            '    hidden = [',
            '        "deleted_at"',
            '    ];',
            '',
            '    casts = {',
            '        //',
            '    };',
            '}',
            ''
        ].join("\n");
    },

    _buildMigrationTemplate: function (migrationId, snakeName) {
        var createMatch = snakeName.match(/^create_(.+)_table$/);
        var addColMatch = snakeName.match(/^add_(.+)_to_(.+)_table$/);
        var dropColMatch = snakeName.match(/^(?:drop|remove)_(.+)_from_(.+)_table$/);

        if (createMatch) {
            var tableName = createMatch[1];
            return [
                'Migration.register({',
                '    name: "' + migrationId + '",',
                '',
                '    up: function () {',
                '        Schema.create("' + tableName + '", function (table) {',
                '            table.id();',
                '            table.string("name");',
                '            table.timestamps();',
                '            table.softDeletes();',
                '        });',
                '    },',
                '',
                '    down: function () {',
                '        Schema.dropIfExists("' + tableName + '");',
                '    }',
                '});',
                ''
            ].join("\n");
        }

        if (addColMatch) {
            var colName = addColMatch[1];
            var targetTable = addColMatch[2];
            return [
                'Migration.register({',
                '    name: "' + migrationId + '",',
                '',
                '    up: function () {',
                '        Schema.table("' + targetTable + '", function (table) {',
                '            table.string("' + colName + '"); // Optional: .after("previous_column").default("")',
                '        });',
                '    },',
                '',
                '    down: function () {',
                '        Schema.table("' + targetTable + '", function (table) {',
                '            table.dropColumn("' + colName + '");',
                '        });',
                '    }',
                '});',
                ''
            ].join("\n");
        }

        if (dropColMatch) {
            var droppedCol = dropColMatch[1];
            var fromTable = dropColMatch[2];
            return [
                'Migration.register({',
                '    name: "' + migrationId + '",',
                '',
                '    up: function () {',
                '        Schema.table("' + fromTable + '", function (table) {',
                '            table.dropColumn("' + droppedCol + '");',
                '        });',
                '    },',
                '',
                '    down: function () {',
                '        Schema.table("' + fromTable + '", function (table) {',
                '            table.string("' + droppedCol + '");',
                '        });',
                '    }',
                '});',
                ''
            ].join("\n");
        }

        return [
            'Migration.register({',
            '    name: "' + migrationId + '",',
            '',
            '    up: function () {',
            '        Schema.table("table_name", function (table) {',
            '            // table.string("new_column").after("id");',
            '            // table.renameColumn("old_column", "new_column");',
            '            // table.dropColumn("column_to_drop");',
            '        });',
            '    },',
            '',
            '    down: function () {',
            '        Schema.table("table_name", function (table) {',
            '            // Revert schema changes here',
            '        });',
            '    }',
            '});',
            ''
        ].join("\n");
    },

    _buildSeederTemplate: function (seederName, entityPascal, tableName) {
        return [
            'Seeder.register("' + seederName + '", {',
            '    run: function () {',
            '        const records = [',
            '            // { name: "Sample Record" }',
            '        ];',
            '',
            '        const res = ' + entityPascal + '.bulkCreate(records);',
            '        if (!res || !res.status) {',
            '            throw new Error("Failed to seed ' + tableName + ': " + (res ? res.message : "Unknown error"));',
            '        }',
            '',
            '        return { table: "' + tableName + '", count: res.count };',
            '    }',
            '});',
            ''
        ].join("\n");
    },

    _buildResourceControllerTemplate: function (controllerName, entityPascal) {
        return [
            'class ' + controllerName + ' extends Controller {',
            '    model = ' + entityPascal + ';',
            '    with = [];',
            '',
            '    // Optional lifecycle hooks: beforeStore, afterStore, beforeUpdate, afterUpdate, beforeDestroy, afterDestroy',
            '    // beforeStore(ctx) {',
            '    //     return { status: true };',
            '    // }',
            '}',
            ''
        ].join("\n");
    },

    _buildPlainControllerTemplate: function (controllerName) {
        return [
            'class ' + controllerName + ' extends Controller {',
            '    index(ctx) {',
            '        return { status: true, data: [] };',
            '    }',
            '}',
            ''
        ].join("\n");
    },

    _createProjectFiles: function (newFiles) {
        var scriptId = ScriptApp.getScriptId();
        var token = ScriptApp.getOAuthToken();
        var endpoint = this.API_BASE + scriptId + "/content";

        var getRes = UrlFetchApp.fetch(endpoint, {
            method: "get",
            headers: { Authorization: "Bearer " + token },
            muteHttpExceptions: true
        });

        if (getRes.getResponseCode() !== 200) {
            throw new Error(
                "Failed to read Apps Script project (" + getRes.getResponseCode() + "): " +
                getRes.getContentText()
            );
        }

        var projectData = JSON.parse(getRes.getContentText());
        var files = (projectData.files || []).map(function (f) {
            return { name: f.name, type: f.type, source: f.source };
        });

        var existingNames = {};
        files.forEach(function (f) { existingNames[f.name] = true; });

        var pendingNames = [];
        var skipped = [];

        newFiles.forEach(function (item) {
            if (existingNames[item.name]) {
                skipped.push(item.name + ".gs");
                Logger.log("[SKIPPED] File already exists: " + item.name + ".gs");
                return;
            }

            files.push({
                name: item.name,
                type: "SERVER_JS",
                source: item.source
            });
            existingNames[item.name] = true;
            pendingNames.push(item.name);
        });

        if (pendingNames.length === 0) {
            return { status: true, created: [], skipped: skipped };
        }

        var putRes = UrlFetchApp.fetch(endpoint, {
            method: "put",
            contentType: "application/json",
            headers: { Authorization: "Bearer " + token },
            payload: JSON.stringify({ files: files }),
            muteHttpExceptions: true
        });

        if (putRes.getResponseCode() !== 200) {
            throw new Error(
                "Failed to save files to project (" + putRes.getResponseCode() + "): " +
                putRes.getContentText()
            );
        }

        var savedPayload = JSON.parse(putRes.getContentText());
        var savedMap = {};
        (savedPayload.files || []).forEach(function (f) { savedMap[f.name] = true; });

        var created = [];
        pendingNames.forEach(function (name) {
            if (savedMap[name]) {
                created.push(name + ".gs");
                Logger.log("[CONFIRMED CREATED] " + name + ".gs — refresh your browser (F5) to view.");
            } else {
                Logger.log("[WARNING] " + name + ".gs was not found in the server response.");
            }
        });

        return { status: true, created: created, skipped: skipped };
    },

    _toPascalCase: function (str) {
        return String(str || "")
            .replace(/[^a-zA-Z0-9]+/g, " ")
            .trim()
            .split(/\s+/)
            .map(function (word) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join("");
    },

    _toSnakeCase: function (str) {
        return String(str || "")
            .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
            .replace(/[^a-zA-Z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .toLowerCase();
    },

    _pluralizeSnake: function (singular) {
        if (/[^aeiou]y$/.test(singular)) {
            return singular.replace(/y$/, "ies");
        }
        if (/(s|x|z|ch|sh)$/.test(singular)) {
            return singular + "es";
        }
        return singular + "s";
    }
};

function generateModule(name) {
    return CodeGenerator.module(name);
}

function generateModel(name) {
    return CodeGenerator.model(name);
}

function generateMigration(name) {
    return CodeGenerator.migration(name);
}

function generateSeeder(name) {
    return CodeGenerator.seeder(name);
}

function generateController(name, options) {
    return CodeGenerator.controller(name, options);
}

function generatePlainController(name) {
    return CodeGenerator.controller(name, { plain: true });
}
