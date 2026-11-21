function CreateBlueprint() {
    this.columns = [];
}

CreateBlueprint.prototype._add = function (name, opts) {
    var colDef = Object.assign({ name: name, defaultValue: undefined }, opts || {});
    this.columns.push(colDef);

    return {
        default: function (val) {
            colDef.defaultValue = val;
            return this;
        },
        nullable: function () { return this; },
        unique: function () { return this; }
    };
};

CreateBlueprint.prototype.id = function (name) { return this._add(name || "id"); };
CreateBlueprint.prototype.foreignId = function (name) { return this._add(name); };
CreateBlueprint.prototype.string = function (name) { return this._add(name); };
CreateBlueprint.prototype.text = function (name) { return this._add(name); };
CreateBlueprint.prototype.integer = function (name) { return this._add(name); };
CreateBlueprint.prototype.decimal = function (name) { return this._add(name); };
CreateBlueprint.prototype.boolean = function (name) { return this._add(name); };
CreateBlueprint.prototype.date = function (name) { return this._add(name); };
CreateBlueprint.prototype.datetime = function (name) { return this._add(name); };
CreateBlueprint.prototype.timestamp = function (name) { return this._add(name); };
CreateBlueprint.prototype.timestamps = function () {
    this._add("created_at");
    this._add("updated_at");
};
CreateBlueprint.prototype.softDeletes = function (name) {
    this._add(name || "deleted_at");
};

function AlterBlueprint() {
    this.operations = [];
}

AlterBlueprint.prototype._addColumnOp = function (name) {
    var op = {
        type: "addColumn",
        name: name,
        after: null,
        defaultValue: undefined
    };
    this.operations.push(op);

    return {
        after: function (colName) {
            op.after = colName;
            return this;
        },
        default: function (val) {
            op.defaultValue = val;
            return this;
        },
        nullable: function () { return this; }
    };
};

AlterBlueprint.prototype.string = function (name) { return this._addColumnOp(name); };
AlterBlueprint.prototype.text = function (name) { return this._addColumnOp(name); };
AlterBlueprint.prototype.integer = function (name) { return this._addColumnOp(name); };
AlterBlueprint.prototype.decimal = function (name) { return this._addColumnOp(name); };
AlterBlueprint.prototype.boolean = function (name) { return this._addColumnOp(name); };
AlterBlueprint.prototype.date = function (name) { return this._addColumnOp(name); };
AlterBlueprint.prototype.datetime = function (name) { return this._addColumnOp(name); };
AlterBlueprint.prototype.foreignId = function (name) { return this._addColumnOp(name); };

AlterBlueprint.prototype.renameColumn = function (from, to) {
    this.operations.push({ type: "renameColumn", from: from, to: to });
};

AlterBlueprint.prototype.dropColumn = function (columns) {
    var list = Array.isArray(columns) ? columns : [columns];
    this.operations.push({ type: "dropColumn", columns: list });
};

AlterBlueprint.prototype.dropTimestamps = function () {
    this.dropColumn(["created_at", "updated_at"]);
};

AlterBlueprint.prototype.dropSoftDeletes = function (name) {
    this.dropColumn(name || "deleted_at");
};

var Schema = {
    HEADER_BG: "#1E293B",
    HEADER_FG: "#FFFFFF",

    hasTable: function (tableName) {
        return sheet().getSheetByName(tableName) !== null;
    },

    hasColumn: function (tableName, columnName) {
        var targetSheet = sheet().getSheetByName(tableName);
        if (!targetSheet || targetSheet.getLastColumn() === 0) return false;
        var headers = this._getHeaders(targetSheet);
        return headers.indexOf(columnName) !== -1;
    },

    create: function (tableName, callbackOrColumns) {
        var colDefs = [];
        if (typeof callbackOrColumns === "function") {
            var bp = new CreateBlueprint();
            callbackOrColumns(bp);
            colDefs = bp.columns;
        } else if (Array.isArray(callbackOrColumns)) {
            colDefs = callbackOrColumns.map(function (c) { return { name: c }; });
        }

        var columnNames = colDefs.map(function (c) { return c.name; });
        var ss = sheet();
        var targetSheet = ss.getSheetByName(tableName);

        if (!targetSheet) {
            targetSheet = ss.insertSheet(tableName);
            this._applyHeaders(targetSheet, columnNames);
            this._trimUnusedColumns(targetSheet, columnNames.length);
            Logger.log("[CREATED] Table '" + tableName + "' (" + columnNames.length + " columns)");
            return;
        }

        if (targetSheet.getLastColumn() === 0) {
            this._applyHeaders(targetSheet, columnNames);
            this._trimUnusedColumns(targetSheet, columnNames.length);
            Logger.log("[INITIALIZED] Table '" + tableName + "'");
        }
    },

    table: function (tableName, callback) {
        var targetSheet = sheet().getSheetByName(tableName);
        if (!targetSheet) {
            throw new Error("Schema.table error: Table '" + tableName + "' does not exist.");
        }

        var bp = new AlterBlueprint();
        callback(bp);

        var self = this;
        bp.operations.forEach(function (op) {
            if (op.type === "addColumn") {
                self._execAddColumn(targetSheet, tableName, op);
            } else if (op.type === "renameColumn") {
                self._execRenameColumn(targetSheet, tableName, op.from, op.to);
            } else if (op.type === "dropColumn") {
                self._execDropColumns(targetSheet, tableName, op.columns);
            }
        });
    },

    rename: function (fromTable, toTable) {
        var targetSheet = sheet().getSheetByName(fromTable);
        if (!targetSheet) {
            throw new Error("Schema.rename error: Table '" + fromTable + "' does not exist.");
        }
        targetSheet.setName(toTable);
        Logger.log("[RENAMED] Table '" + fromTable + "' -> '" + toTable + "'");
    },

    dropIfExists: function (tableName) {
        var ss = sheet();
        var targetSheet = ss.getSheetByName(tableName);
        if (!targetSheet) return;

        if (ss.getSheets().length <= 1) {
            ss.insertSheet("_migrating_tmp");
        }

        ss.deleteSheet(targetSheet);
        Logger.log("[DROPPED] Table '" + tableName + "'");
    },

    _getHeaders: function (targetSheet) {
        var lastCol = targetSheet.getLastColumn();
        if (lastCol === 0) return [];
        return targetSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
            return String(h || "").trim();
        });
    },

    _execAddColumn: function (targetSheet, tableName, op) {
        var headers = this._getHeaders(targetSheet);
        if (headers.indexOf(op.name) !== -1) {
            Logger.log("[SKIPPED] Column '" + op.name + "' already exists on '" + tableName + "'");
            return;
        }

        var insertColIndex = headers.length + 1;
        if (op.after) {
            var afterPos = headers.indexOf(op.after);
            if (afterPos !== -1) {
                var afterCol1Based = afterPos + 1;
                targetSheet.insertColumnAfter(afterCol1Based);
                insertColIndex = afterCol1Based + 1;
            }
        }

        var headerCell = targetSheet.getRange(1, insertColIndex);
        headerCell.setValue(op.name);
        this._styleHeaderRange(headerCell);

        var lastRow = targetSheet.getLastRow();
        if (op.defaultValue !== undefined && lastRow >= 2) {
            var fillValues = [];
            for (var r = 0; r < lastRow - 1; r++) {
                fillValues.push([op.defaultValue]);
            }
            targetSheet.getRange(2, insertColIndex, lastRow - 1, 1).setValues(fillValues);
        }

        Logger.log("[ALTERED] Added column '" + op.name + "' to '" + tableName + "'");
    },

    _execRenameColumn: function (targetSheet, tableName, fromCol, toCol) {
        var headers = this._getHeaders(targetSheet);
        var colPos = headers.indexOf(fromCol);
        if (colPos === -1) {
            Logger.log("[SKIPPED] Column '" + fromCol + "' not found on '" + tableName + "'");
            return;
        }
        targetSheet.getRange(1, colPos + 1).setValue(toCol);
        Logger.log("[ALTERED] Renamed column '" + fromCol + "' -> '" + toCol + "' on '" + tableName + "'");
    },

    _execDropColumns: function (targetSheet, tableName, colNames) {
        var self = this;
        colNames.forEach(function (colName) {
            var headers = self._getHeaders(targetSheet);
            var colPos = headers.indexOf(colName);
            if (colPos === -1) {
                Logger.log("[SKIPPED] Column '" + colName + "' not found on '" + tableName + "'");
                return;
            }
            targetSheet.deleteColumn(colPos + 1);
            Logger.log("[ALTERED] Dropped column '" + colName + "' from '" + tableName + "'");
        });
    },

    _applyHeaders: function (targetSheet, columns) {
        var headerRange = targetSheet.getRange(1, 1, 1, columns.length);
        headerRange.setValues([columns]);
        this._styleHeaderRange(headerRange);
        targetSheet.setFrozenRows(1);
    },

    _styleHeaderRange: function (range) {
        range
            .setFontWeight("bold")
            .setBackground(this.HEADER_BG)
            .setFontColor(this.HEADER_FG)
            .setVerticalAlignment("middle");
    },

    _trimUnusedColumns: function (targetSheet, activeColCount) {
        var maxCols = targetSheet.getMaxColumns();
        if (maxCols > activeColCount) {
            targetSheet.deleteColumns(activeColCount + 1, maxCols - activeColCount);
        }
    }
};

var Migration = {
    _registry: [],

    register: function (definition) {
        if (!definition || !definition.name || typeof definition.up !== "function") {
            throw new Error("Invalid migration definition.");
        }
        this._registry.push(definition);
    },

    all: function () {
        return this._registry.slice().sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
    }
};

var Migrator = {
    REPO_SHEET: "migrations",

    _ensureRepository: function () {
        Schema.create(this.REPO_SHEET, ["id", "migration", "batch", "migrated_at"]);
        return sheet().getSheetByName(this.REPO_SHEET);
    },

    _getRanRecords: function () {
        var repoSheet = this._ensureRepository();
        var lastRow = repoSheet.getLastRow();
        if (lastRow < 2) return [];

        var rows = repoSheet.getRange(2, 1, lastRow - 1, 4).getValues();
        return rows.map(function (r, idx) {
            return {
                rowNumber: idx + 2,
                id: Number(r[0]) || 0,
                migration: String(r[1] || "").trim(),
                batch: Number(r[2]) || 0,
                migrated_at: r[3]
            };
        });
    },

    _cleanupDefaultSheets: function () {
        var ss = sheet();
        ["Sheet1", "_migrating_tmp"].forEach(function (tempName) {
            var s = ss.getSheetByName(tempName);
            if (s && ss.getSheets().length > 1) {
                if (tempName === "_migrating_tmp" || (s.getLastRow() === 0 && s.getLastColumn() === 0)) {
                    ss.deleteSheet(s);
                }
            }
        });
    },

    run: function () {
        if (!CONFIG.has("SHEET_ID")) {
            WorkspaceSetup.init();
        }

        var allMigrations = Migration.all();
        var ranRecords = this._getRanRecords();
        var ranMap = {};
        var maxBatch = 0;
        var maxId = 0;

        ranRecords.forEach(function (rec) {
            ranMap[rec.migration] = true;
            if (rec.batch > maxBatch) maxBatch = rec.batch;
            if (rec.id > maxId) maxId = rec.id;
        });

        var pending = allMigrations.filter(function (m) {
            return !ranMap[m.name];
        });

        if (pending.length === 0) {
            Logger.log("Nothing to migrate.");
            return { status: true, message: "Nothing to migrate.", ran: [] };
        }

        var nextBatch = maxBatch + 1;
        var repoSheet = this._ensureRepository();
        var executed = [];

        for (var i = 0; i < pending.length; i++) {
            var migration = pending[i];
            Logger.log("Migrating: " + migration.name);
            migration.up();

            maxId++;
            repoSheet.appendRow([maxId, migration.name, nextBatch, new Date()]);
            executed.push(migration.name);
            Logger.log("Migrated:  " + migration.name + " (batch " + nextBatch + ")");
        }

        this._cleanupDefaultSheets();

        if (typeof rebuildAllIndexes === "function") {
            rebuildAllIndexes();
        }

        return { status: true, message: "Migrated " + executed.length + " migrations.", ran: executed };
    },

    rollback: function () {
        var ranRecords = this._getRanRecords();
        if (ranRecords.length === 0) {
            Logger.log("Nothing to rollback.");
            return { status: true, message: "Nothing to rollback.", rolledBack: [] };
        }

        var lastBatch = ranRecords.reduce(function (max, rec) {
            return rec.batch > max ? rec.batch : max;
        }, 0);

        var targetRecords = ranRecords.filter(function (rec) {
            return rec.batch === lastBatch;
        }).reverse();

        var migrationMap = {};
        Migration.all().forEach(function (m) { migrationMap[m.name] = m; });

        var repoSheet = this._ensureRepository();
        var rolledBack = [];

        for (var i = 0; i < targetRecords.length; i++) {
            var rec = targetRecords[i];
            var migrationDef = migrationMap[rec.migration];
            Logger.log("Rolling back: " + rec.migration);

            if (migrationDef && typeof migrationDef.down === "function") {
                migrationDef.down();
            }

            repoSheet.deleteRow(rec.rowNumber);
            rolledBack.push(rec.migration);
            Logger.log("Rolled back:  " + rec.migration);
        }

        this._cleanupDefaultSheets();

        if (typeof rebuildAllIndexes === "function") {
            rebuildAllIndexes();
        }

        return { status: true, message: "Rolled back batch " + lastBatch, rolledBack: rolledBack };
    },

    fresh: function () {
        if (!CONFIG.has("SHEET_ID")) {
            WorkspaceSetup.init();
        }

        var ss = sheet();
        if (!ss.getSheetByName("_migrating_tmp")) {
            ss.insertSheet("_migrating_tmp");
        }

        var allMigrations = Migration.all().reverse();
        for (var i = 0; i < allMigrations.length; i++) {
            if (typeof allMigrations[i].down === "function") {
                allMigrations[i].down();
            }
        }

        Schema.dropIfExists(this.REPO_SHEET);
        return this.run();
    },

    status: function () {
        var ranRecords = this._getRanRecords();
        var ranMap = {};
        ranRecords.forEach(function (rec) { ranMap[rec.migration] = rec.batch; });

        Logger.log("=== MIGRATION STATUS ===");
        Migration.all().forEach(function (m) {
            var state = ranMap[m.name] ? "Ran (Batch " + ranMap[m.name] + ")" : "Pending";
            Logger.log("[" + state + "] " + m.name);
        });
    }
};

function migrate() {
    return Migrator.run();
}

function migrateRollback() {
    return Migrator.rollback();
}

function migrateFresh() {
    return Migrator.fresh();
}

function migrateStatus() {
    return Migrator.status();
}

function migrateFreshSeed() {
    var migRes = Migrator.fresh();
    var seedRes = dbSeed();
    return { migration: migRes, seeder: seedRes };
}
