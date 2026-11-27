function _modelToSnakeCase(str) {
    return String(str || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
}

function _modelPluralize(singular) {
    if (/[^aeiou]y$/.test(singular)) return singular.replace(/y$/, "ies");
    if (/(s|x|z|ch|sh)$/.test(singular)) return singular + "es";
    return singular + "s";
}

function _castModelValue(value, type) {
    if (value === null || value === undefined || value === "") return value;

    switch (String(type || "").toLowerCase()) {
        case "int":
        case "integer": {
            var parsedInt = parseInt(value, 10);
            return isNaN(parsedInt) ? 0 : parsedInt;
        }
        case "float":
        case "double":
        case "decimal":
        case "number": {
            var parsedFloat = parseFloat(value);
            return isNaN(parsedFloat) ? 0 : parsedFloat;
        }
        case "bool":
        case "boolean": {
            if (typeof value === "boolean") return value;
            var str = String(value).trim().toLowerCase();
            return str === "true" || str === "1" || str === "yes";
        }
        case "json":
        case "array":
        case "object": {
            if (typeof value === "object") return value;
            try {
                return JSON.parse(String(value));
            } catch (_) {
                return type === "array" ? [] : {};
            }
        }
        case "string":
            return String(value);
        default:
            return value;
    }
}

class ModelQueryBuilder {
    constructor(ModelClass) {
        this.ModelClass = ModelClass;
        this._filters = {};
        this._postFilters = [];
        this._relations = [];
        this._unhidden = [];
        this._withTrashed = false;
        this._onlyTrashed = false;
        this._sort = null;
        this._limit = null;
    }

    where(column, operatorOrValue, value) {
        if (column && typeof column === "object" && !Array.isArray(column)) {
            var keys = Object.keys(column);
            for (var i = 0; i < keys.length; i++) {
                this._filters[keys[i]] = column[keys[i]];
            }
            return this;
        }

        if (arguments.length === 2) {
            this._filters[column] = operatorOrValue;
            return this;
        }

        var op = String(operatorOrValue || "=").trim().toLowerCase();
        if (op === "=" || op === "==") {
            this._filters[column] = value;
        } else {
            this._postFilters.push({ column: column, operator: op, value: value });
        }
        return this;
    }

    whereIn(column, values) {
        this._postFilters.push({
            column: column,
            operator: "in",
            value: Array.isArray(values) ? values : [values]
        });
        return this;
    }

    whereNull(column) {
        this._postFilters.push({ column: column, operator: "null" });
        return this;
    }

    whereNotNull(column) {
        this._postFilters.push({ column: column, operator: "notnull" });
        return this;
    }

    with(relations) {
        var list = Array.isArray(relations)
            ? relations
            : Array.prototype.slice.call(arguments);

        for (var i = 0; i < list.length; i++) {
            if (typeof list[i] === "string" && list[i].trim() !== "") {
                var parts = list[i].split(",");
                for (var j = 0; j < parts.length; j++) {
                    var rel = parts[j].trim();
                    if (rel && this._relations.indexOf(rel) === -1) {
                        this._relations.push(rel);
                    }
                }
            }
        }
        return this;
    }

    withHidden(fields) {
        var list = Array.isArray(fields)
            ? fields
            : Array.prototype.slice.call(arguments);

        for (var i = 0; i < list.length; i++) {
            var field = String(list[i] || "").trim();
            if (field && this._unhidden.indexOf(field) === -1) {
                this._unhidden.push(field);
            }
        }
        return this;
    }

    withTrashed() {
        this._withTrashed = true;
        return this;
    }

    onlyTrashed() {
        this._onlyTrashed = true;
        return this;
    }

    orderBy(column, direction) {
        var dir = String(direction || "asc").trim().toLowerCase();
        this._sort = (dir === "desc" ? "-" : "") + String(column).trim();
        return this;
    }

    latest(column) {
        return this.orderBy(column || "created_at", "desc");
    }

    oldest(column) {
        return this.orderBy(column || "created_at", "asc");
    }

    limit(count) {
        var parsed = parseInt(count, 10);
        if (!isNaN(parsed) && parsed > 0) {
            this._limit = parsed;
        }
        return this;
    }

    take(count) {
        return this.limit(count);
    }

    _buildReadFilters() {
        var queryFilters = Object.assign({}, this._filters);
        queryFilters.with = "none";

        if (this._withTrashed) {
            queryFilters.with_trashed = true;
        }
        if (this._onlyTrashed) {
            queryFilters.only_trashed = true;
        }
        if (this._unhidden.indexOf("password") !== -1 || this._unhidden.indexOf("*") !== -1) {
            queryFilters.with_password = true;
        }
        if (this._unhidden.length > 0) {
            queryFilters.make_visible = this._unhidden.slice();
        }
        return queryFilters;
    }

    _matchesPostFilters(row) {
        for (var i = 0; i < this._postFilters.length; i++) {
            var cond = this._postFilters[i];
            var val = row[cond.column];
            var target = cond.value;

            switch (cond.operator) {
                case "!=":
                case "<>":
                    if (String(val) === String(target)) return false;
                    break;
                case ">":
                    if (!(val > target)) return false;
                    break;
                case ">=":
                    if (!(val >= target)) return false;
                    break;
                case "<":
                    if (!(val < target)) return false;
                    break;
                case "<=":
                    if (!(val <= target)) return false;
                    break;
                case "like": {
                    var needle = String(target || "").replace(/^%|%$/g, "").toLowerCase();
                    if (String(val || "").toLowerCase().indexOf(needle) === -1) return false;
                    break;
                }
                case "in": {
                    var found = false;
                    for (var k = 0; k < target.length; k++) {
                        if (String(target[k]) === String(val)) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) return false;
                    break;
                }
                case "null":
                    if (val !== null && val !== undefined && val !== "") return false;
                    break;
                case "notnull":
                    if (val === null || val === undefined || val === "") return false;
                    break;
            }
        }
        return true;
    }

    _hydrateRelations(rows) {
        if (!this._relations.length || !rows.length) return rows;

        var instance = new this.ModelClass();
        var grouped = {};

        for (var i = 0; i < this._relations.length; i++) {
            var path = this._relations[i];
            var dotIdx = path.indexOf(".");
            var rootRel = dotIdx === -1 ? path : path.slice(0, dotIdx);
            var nestedRel = dotIdx === -1 ? null : path.slice(dotIdx + 1);

            if (!grouped[rootRel]) grouped[rootRel] = [];
            if (nestedRel) grouped[rootRel].push(nestedRel);
        }

        var rootNames = Object.keys(grouped);
        for (var r = 0; r < rootNames.length; r++) {
            var relName = rootNames[r];
            if (typeof instance[relName] !== "function") continue;

            var def = instance[relName]();
            if (!def || !def.model) continue;

            var RelatedModel = def.model;
            var nestedPaths = grouped[relName];

            if (def.type === "belongsTo") {
                var fk = def.foreignKey || (_modelToSnakeCase(relName) + "_id");
                var ownerKey = def.ownerKey || "id";
                var fkValues = [];

                for (var idx = 0; idx < rows.length; idx++) {
                    var fkVal = rows[idx][fk];
                    if (fkVal !== null && fkVal !== undefined && fkVal !== "" && fkValues.indexOf(fkVal) === -1) {
                        fkValues.push(fkVal);
                    }
                }

                var relatedMap = {};
                if (fkValues.length > 0) {
                    var relQuery = RelatedModel.whereIn(ownerKey, fkValues);
                    if (nestedPaths.length > 0) relQuery.with(nestedPaths);
                    var relRecords = relQuery.get();
                    for (var m = 0; m < relRecords.length; m++) {
                        relatedMap[String(relRecords[m][ownerKey])] = relRecords[m];
                    }
                }

                for (var rowIdx = 0; rowIdx < rows.length; rowIdx++) {
                    var lookupKey = rows[rowIdx][fk];
                    rows[rowIdx][relName] = (lookupKey !== null && lookupKey !== undefined && lookupKey !== "")
                        ? (relatedMap[String(lookupKey)] || null)
                        : null;
                }
            } else if (def.type === "hasMany") {
                var childFk = def.foreignKey || (_modelToSnakeCase(this.ModelClass.name) + "_id");
                var localKey = def.localKey || "id";
                var parentIds = [];

                for (var pIdx = 0; pIdx < rows.length; pIdx++) {
                    var pVal = rows[pIdx][localKey];
                    if (pVal !== null && pVal !== undefined && pVal !== "" && parentIds.indexOf(pVal) === -1) {
                        parentIds.push(pVal);
                    }
                }

                var childrenByParent = {};
                if (parentIds.length > 0) {
                    var childQuery = RelatedModel.whereIn(childFk, parentIds);
                    if (nestedPaths.length > 0) childQuery.with(nestedPaths);
                    var childRecords = childQuery.get();
                    for (var c = 0; c < childRecords.length; c++) {
                        var groupKey = String(childRecords[c][childFk]);
                        if (!childrenByParent[groupKey]) childrenByParent[groupKey] = [];
                        childrenByParent[groupKey].push(childRecords[c]);
                    }
                }

                for (var rIdx = 0; rIdx < rows.length; rIdx++) {
                    var parentKey = String(rows[rIdx][localKey]);
                    rows[rIdx][relName] = childrenByParent[parentKey] || [];
                }
            }
        }

        return rows;
    }

    get() {
        Model.resolve(this.ModelClass);
        var table = this.ModelClass.getTable();
        var filters = this._buildReadFilters();
        var canUseNativeLimit = this._postFilters.length === 0 && this._limit !== null;
        var res = canUseNativeLimit
            ? read(table, filters, 1, this._limit, this._sort)
            : read(table, filters, null, null, this._sort);

        var rawRows = (res && res.status && Array.isArray(res.data)) ? res.data : [];

        if (this._postFilters.length > 0) {
            var filtered = [];
            for (var i = 0; i < rawRows.length; i++) {
                if (this._matchesPostFilters(rawRows[i])) {
                    filtered.push(rawRows[i]);
                }
            }
            rawRows = filtered;
        }

        if (this._limit !== null && rawRows.length > this._limit) {
            rawRows = rawRows.slice(0, this._limit);
        }

        var sanitized = this.ModelClass.sanitizeMany(rawRows, { unhide: this._unhidden });
        return this._hydrateRelations(sanitized);
    }

    first() {
        var items = this.limit(1).get();
        return items.length > 0 ? items[0] : null;
    }

    find(id) {
        if (id === null || id === undefined || id === "") return null;
        return this.where(this.ModelClass.getPrimaryKey(), id).first();
    }

    paginate(perPage, page) {
        Model.resolve(this.ModelClass);
        var table = this.ModelClass.getTable();
        var filters = this._buildReadFilters();
        var per = parseInt(perPage, 10) || 15;
        var pg = parseInt(page, 10) || 1;

        var res = read(table, filters, pg, per, this._sort);
        var rawRows = (res && res.status && Array.isArray(res.data)) ? res.data : [];

        if (this._postFilters.length > 0) {
            var filtered = [];
            for (var i = 0; i < rawRows.length; i++) {
                if (this._matchesPostFilters(rawRows[i])) {
                    filtered.push(rawRows[i]);
                }
            }
            rawRows = filtered;
        }

        var sanitized = this.ModelClass.sanitizeMany(rawRows, { unhide: this._unhidden });
        var hydrated = this._hydrateRelations(sanitized);

        return {
            status: true,
            data: hydrated,
            meta: (res && res.meta) || {
                current_page: pg,
                per_page: per,
                total: hydrated.length,
                last_page: 1
            }
        };
    }

    count() {
        return this.get().length;
    }

    exists() {
        return this.first() !== null;
    }
}

class Model {
    constructor() {
        this.table = null;
        this.primaryKey = "id";
        this.timestamps = true;
        this.softDeletes = true;
        this.fillable = undefined;
        this.guarded = undefined;
        this.hidden = [];
        this.casts = {};
    }

    belongsTo(RelatedModel, foreignKey, ownerKey) {
        return {
            type: "belongsTo",
            model: RelatedModel,
            foreignKey: foreignKey || null,
            ownerKey: ownerKey || "id"
        };
    }

    hasMany(RelatedModel, foreignKey, localKey) {
        return {
            type: "hasMany",
            model: RelatedModel,
            foreignKey: foreignKey || null,
            localKey: localKey || "id"
        };
    }

    static getTable() {
        var inst = new this();
        if (inst.table) return String(inst.table);
        return _modelPluralize(_modelToSnakeCase(this.name));
    }

    static getPrimaryKey() {
        var inst = new this();
        return inst.primaryKey || "id";
    }

    static query() {
        Model.resolve(this);
        return new ModelQueryBuilder(this);
    }

    static where(column, operatorOrValue, value) {
        var qb = this.query();
        return qb.where.apply(qb, arguments);
    }

    static whereIn(column, values) {
        return this.query().whereIn(column, values);
    }

    static whereNull(column) {
        return this.query().whereNull(column);
    }

    static whereNotNull(column) {
        return this.query().whereNotNull(column);
    }

    static with(relations) {
        var qb = this.query();
        return qb.with.apply(qb, arguments);
    }

    static withHidden(fields) {
        var qb = this.query();
        return qb.withHidden.apply(qb, arguments);
    }

    static withTrashed() {
        return this.query().withTrashed();
    }

    static onlyTrashed() {
        return this.query().onlyTrashed();
    }

    static orderBy(column, direction) {
        return this.query().orderBy(column, direction);
    }

    static latest(column) {
        return this.query().latest(column);
    }

    static oldest(column) {
        return this.query().oldest(column);
    }

    static limit(count) {
        return this.query().limit(count);
    }

    static all() {
        return this.query().get();
    }

    static get() {
        return this.query().get();
    }

    static first() {
        return this.query().first();
    }

    static paginate(perPage, page) {
        return this.query().paginate(perPage, page);
    }

    static find(id) {
        return this.query().find(id);
    }

    static filterMassAssignable(input) {
        var prepared = Model.prepareInputAttributes(this, input);
        delete prepared[this.getPrimaryKey()];
        return prepared;
    }

    static filterFillable(input) {
        return this.filterMassAssignable(input);
    }

    static sanitize(record, options) {
        if (!record || typeof record !== "object") return record;
        var meta = Model.resolve(this);

        var casts = (meta && meta.casts) ? meta.casts : {};
        var hidden = (meta && Array.isArray(meta.hidden)) ? meta.hidden : [];
        var unhide = (options && Array.isArray(options.unhide)) ? options.unhide : [];
        var out = Object.assign({}, record);

        var castKeys = Object.keys(casts);
        for (var i = 0; i < castKeys.length; i++) {
            var col = castKeys[i];
            if (Object.prototype.hasOwnProperty.call(out, col)) {
                out[col] = _castModelValue(out[col], casts[col]);
            }
        }

        if (unhide.indexOf("*") === -1) {
            for (var h = 0; h < hidden.length; h++) {
                var hiddenCol = hidden[h];
                if (unhide.indexOf(hiddenCol) === -1) {
                    delete out[hiddenCol];
                }
            }
        }

        return out;
    }

    static sanitizeMany(records, options) {
        if (!Array.isArray(records)) return [];
        var self = this;
        return records.map(function (row) {
            return self.sanitize(row, options);
        });
    }

    static create(data) {
        Model.resolve(this);
        var payload = this.filterMassAssignable(data);
        var res = create(this.getTable(), { data: payload });
        if (res && res.status && res.data) {
            res.data = this.sanitize(res.data);
        }
        return res;
    }

    static bulkCreate(rows) {
        if (!Array.isArray(rows)) {
            return { status: false, message: "bulkCreate expects an array of records." };
        }
        Model.resolve(this);
        var created = [];
        for (var i = 0; i < rows.length; i++) {
            var res = this.create(rows[i]);
            if (!res || !res.status) {
                return res;
            }
            created.push(res.data);
        }
        return { status: true, data: created, count: created.length };
    }

    static update(id, data) {
        Model.resolve(this);
        var pk = this.getPrimaryKey();
        var payload = this.filterMassAssignable(data);
        payload[pk] = id;

        var res = update(this.getTable(), { data: payload });
        if (res && res.status && res.data) {
            res.data = this.sanitize(res.data);
        }
        return res;
    }

    static forceUpdate(id, data) {
        Model.resolve(this);
        var pk = this.getPrimaryKey();
        var payload = Object.assign({}, data);
        payload[pk] = id;

        var prevBypass = Model._bypassMassAssignment;
        Model._bypassMassAssignment = true;
        var res;
        try {
            res = update(this.getTable(), { data: payload, force: true });
        } finally {
            Model._bypassMassAssignment = prevBypass;
        }
        if (res && res.status && res.data) {
            res.data = this.sanitize(res.data);
        }
        return res;
    }

    static destroy(id) {
        Model.resolve(this);
        return destroy(this.getTable(), id);
    }

    static restore(id) {
        Model.resolve(this);
        if (typeof restore === "function") {
            return restore(this.getTable(), id);
        }
        return this.forceUpdate(id, { deleted_at: "" });
    }

    static forceDelete(id) {
        Model.resolve(this);
        if (typeof forceDelete === "function") {
            return forceDelete(this.getTable(), id);
        }
        return destroy(this.getTable(), id);
    }
}

Model._bypassMassAssignment = false;

(function () {
    var _modelsByName = {};
    var _modelsByTable = {};

    var BASE_METHODS = {
        constructor: true,
        hasOne: true,
        hasMany: true,
        belongsTo: true,
        belongsToMany: true
    };

    function toSnakeCase(str) {
        return String(str || "")
            .trim()
            .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
            .replace(/[\s\-]+/g, "_")
            .toLowerCase();
    }

    function toPluralSnake(str) {
        var snake = toSnakeCase(str);
        if (!snake) return "";
        if (/[^aeiou]y$/i.test(snake)) {
            return snake.replace(/y$/i, "ies");
        }
        if (/(s|x|z|ch|sh)$/i.test(snake)) {
            return snake + "es";
        }
        return snake + "s";
    }

    function toPascalCandidates(tableName) {
        var words = String(tableName || "")
            .trim()
            .replace(/[\s\-]+/g, "_")
            .split("_")
            .filter(Boolean);

        if (words.length === 0) return [];

        var last = words[words.length - 1].toLowerCase();
        var prefix = words.slice(0, -1).map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join("");

        var singularLastOptions = [];
        if (/ies$/i.test(last) && last.length > 3) {
            singularLastOptions.push(last.replace(/ies$/i, "y"));
        } else if (/(sses|xes|zes|ches|shes)$/i.test(last)) {
            singularLastOptions.push(last.replace(/es$/i, ""));
        } else if (/es$/i.test(last) && last.length > 3) {
            singularLastOptions.push(last.replace(/s$/i, ""));
            singularLastOptions.push(last.replace(/es$/i, ""));
        } else if (/s$/i.test(last) && last.length > 1) {
            singularLastOptions.push(last.replace(/s$/i, ""));
        }
        singularLastOptions.push(last);

        var results = [];
        singularLastOptions.forEach(function (opt) {
            var pascal = prefix + opt.charAt(0).toUpperCase() + opt.slice(1).toLowerCase();
            if (results.indexOf(pascal) === -1) {
                results.push(pascal);
            }
        });
        return results;
    }

    function lookupGlobalClass(className) {
        if (!className || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(className)) return null;
        try {
            if (typeof globalThis !== "undefined" && typeof globalThis[className] === "function") {
                return globalThis[className];
            }
            var candidate = (new Function("return typeof " + className + " !== 'undefined' ? " + className + " : null;"))();
            return (typeof candidate === "function") ? candidate : null;
        } catch (e) {
            return null;
        }
    }

    function isModelClass(target) {
        return typeof target === "function" && (target === Model || target.prototype instanceof Model);
    }

    function createModelConfigError(message) {
        var err = new Error(message);
        err.name = "ModelConfigurationError";
        err.statusCode = 500;
        err.expose = true;
        return err;
    }

    function normalizeKeyList(rawList) {
        if (!Array.isArray(rawList)) return null;
        var seen = {};
        var cleaned = [];
        for (var i = 0; i < rawList.length; i++) {
            var val = (rawList[i] !== null && rawList[i] !== undefined) ? String(rawList[i]).trim() : "";
            if (val !== "" && !seen[val]) {
                seen[val] = true;
                cleaned.push(val);
            }
        }
        return cleaned;
    }

    function validateModelSheetColumns(meta) {
        if (!meta || meta._schemaValidated) return;

        var headers = null;
        var colMap = null;

        if (typeof getSchemaMetadata === "function") {
            var schema = getSchemaMetadata();
            var sheetInfo = (schema && schema.sheets) ? schema.sheets[meta.table] : null;
            if (!sheetInfo) {
                schema = getSchemaMetadata(true);
                sheetInfo = (schema && schema.sheets) ? schema.sheets[meta.table] : null;
            }
            if (!sheetInfo) {
                throw createModelConfigError(
                    "Model [" + meta.modelName + "] references target sheet '" + meta.table + "', which does not exist."
                );
            }
            headers = sheetInfo.headers || [];
            colMap = sheetInfo.colMap || {};
        } else if (typeof sheet === "function") {
            var targetSheet = sheet().getSheetByName(meta.table);
            if (!targetSheet) {
                throw createModelConfigError(
                    "Model [" + meta.modelName + "] references target sheet '" + meta.table + "', which does not exist."
                );
            }
            var lastCol = targetSheet.getLastColumn();
            headers = lastCol > 0 ? targetSheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
            colMap = {};
            for (var i = 0; i < headers.length; i++) {
                if (headers[i] !== "") {
                    colMap[String(headers[i])] = i;
                }
            }
        } else {
            return;
        }

        var missingFillable = [];
        for (var f = 0; f < meta.fillable.length; f++) {
            var fKey = meta.fillable[f];
            if (!Object.prototype.hasOwnProperty.call(colMap, fKey)) {
                missingFillable.push(fKey);
            }
        }

        var missingGuarded = [];
        for (var g = 0; g < meta.guarded.length; g++) {
            var gKey = meta.guarded[g];
            if (gKey !== "*" && !Object.prototype.hasOwnProperty.call(colMap, gKey)) {
                missingGuarded.push(gKey);
            }
        }

        var missingHidden = [];
        for (var h = 0; h < meta.hidden.length; h++) {
            var hKey = meta.hidden[h];
            if (!Object.prototype.hasOwnProperty.call(colMap, hKey)) {
                missingHidden.push(hKey);
            }
        }

        if (missingFillable.length > 0 || missingGuarded.length > 0 || missingHidden.length > 0) {
            var availableCols = headers.filter(function (hdr) {
                return String(hdr).trim() !== "";
            });

            var parts = [];
            if (missingFillable.length > 0) {
                parts.push("fillable key(s) [" + missingFillable.join(", ") + "]");
            }
            if (missingGuarded.length > 0) {
                parts.push("guarded key(s) [" + missingGuarded.join(", ") + "]");
            }
            if (missingHidden.length > 0) {
                parts.push("hidden key(s) [" + missingHidden.join(", ") + "]");
            }

            throw createModelConfigError(
                "Model [" + meta.modelName + "] has " + parts.join(" and ") +
                " not found in sheet '" + meta.table + "'. Available columns: [" + availableCols.join(", ") + "]."
            );
        }

        meta._schemaValidated = true;
    }

    function registerModelClass(ModelClass) {
        if (!isModelClass(ModelClass) || ModelClass === Model) return null;

        var cleanName = String(ModelClass.name || "").trim();
        if (!cleanName) return null;

        if (_modelsByName[cleanName]) {
            validateModelSheetColumns(_modelsByName[cleanName]);
            return _modelsByName[cleanName];
        }

        var instance = {};
        try {
            instance = new ModelClass();
        } catch (e) {
            instance = {};
        }

        var rawFillable = ModelClass.fillable !== undefined ? ModelClass.fillable : instance.fillable;
        var rawGuarded = ModelClass.guarded !== undefined ? ModelClass.guarded : instance.guarded;
        var rawHidden = ModelClass.hidden !== undefined ? ModelClass.hidden : instance.hidden;

        if (rawFillable !== undefined && !Array.isArray(rawFillable)) {
            throw createModelConfigError(
                "Model [" + cleanName + "] configuration error: 'fillable' must be an array."
            );
        }
        if (rawGuarded !== undefined && !Array.isArray(rawGuarded)) {
            throw createModelConfigError(
                "Model [" + cleanName + "] configuration error: 'guarded' must be an array."
            );
        }
        if (rawHidden !== undefined && !Array.isArray(rawHidden)) {
            throw createModelConfigError(
                "Model [" + cleanName + "] configuration error: 'hidden' must be an array."
            );
        }

        var hasDefinedFillable = Array.isArray(rawFillable);
        var hasDefinedGuarded = Array.isArray(rawGuarded);

        var fillableVal = normalizeKeyList(rawFillable) || [];
        var guardedVal = normalizeKeyList(rawGuarded) || [];
        var hiddenVal = normalizeKeyList(rawHidden) || [];

        if (!hasDefinedFillable && !hasDefinedGuarded) {
            throw createModelConfigError(
                "Model [" + cleanName + "] configuration error: either 'fillable' or 'guarded' must be defined."
            );
        }

        if (hasDefinedFillable && fillableVal.length === 0 && !hasDefinedGuarded) {
            throw createModelConfigError(
                "Model [" + cleanName + "] configuration error: 'fillable' cannot be empty unless 'guarded' is defined."
            );
        }

        var relationFns = {};
        Object.getOwnPropertyNames(ModelClass.prototype).forEach(function (key) {
            if (!BASE_METHODS[key] && typeof ModelClass.prototype[key] === "function") {
                relationFns[key] = ModelClass.prototype[key];
            }
        });

        var tableVal = ModelClass.table || instance.table || toPluralSnake(cleanName);
        var primaryKeyVal = ModelClass.primaryKey || instance.primaryKey || "id";

        var rawCasts = ModelClass.casts !== undefined ? ModelClass.casts : instance.casts;
        if (typeof rawCasts === "function") {
            rawCasts = rawCasts.call(instance);
        }
        var castsVal = {};
        if (rawCasts && typeof rawCasts === "object" && !Array.isArray(rawCasts)) {
            Object.keys(rawCasts).forEach(function (cKey) {
                var cleanCKey = String(cKey).trim();
                if (cleanCKey) {
                    castsVal[cleanCKey] = rawCasts[cKey];
                }
            });
        }

        var withVal = Array.isArray(ModelClass.with) ? ModelClass.with : (Array.isArray(instance.with) ? instance.with : []);

        var meta = {
            __isModelMeta: true,
            modelClass: ModelClass,
            modelName: cleanName,
            table: tableVal,
            primaryKey: primaryKeyVal,
            hasFillable: hasDefinedFillable,
            hasGuarded: hasDefinedGuarded,
            fillable: fillableVal,
            guarded: guardedVal,
            hidden: hiddenVal,
            casts: castsVal,
            defaultWith: withVal,
            _schemaValidated: false,
            _relationFns: relationFns,
            _compiledRelations: {}
        };

        validateModelSheetColumns(meta);

        _modelsByName[cleanName] = meta;
        _modelsByTable[meta.table] = meta;
        return meta;
    }

    function resolveModel(target) {
        if (!target) return null;
        if (typeof target === "object" && target.__isModelMeta) {
            validateModelSheetColumns(target);
            return target;
        }
        if (isModelClass(target)) {
            return registerModelClass(target);
        }

        var key = String(target).trim();
        if (!key) return null;

        if (_modelsByName[key]) {
            validateModelSheetColumns(_modelsByName[key]);
            return _modelsByName[key];
        }
        if (_modelsByTable[key]) {
            validateModelSheetColumns(_modelsByTable[key]);
            return _modelsByTable[key];
        }

        var directClass = lookupGlobalClass(key);
        if (isModelClass(directClass)) {
            return registerModelClass(directClass);
        }

        var candidates = toPascalCandidates(key);
        for (var i = 0; i < candidates.length; i++) {
            var cls = lookupGlobalClass(candidates[i]);
            if (isModelClass(cls)) {
                var meta = registerModelClass(cls);
                if (meta && !_modelsByTable[key]) {
                    _modelsByTable[key] = meta;
                }
                return meta;
            }
        }

        if (typeof globalThis !== "undefined" && globalThis) {
            var globalKeys = Object.keys(globalThis);
            for (var g = 0; g < globalKeys.length; g++) {
                var gVal = null;
                try {
                    gVal = globalThis[globalKeys[g]];
                } catch (_) {
                    continue;
                }
                if (isModelClass(gVal) && gVal !== Model) {
                    var gName = String(gVal.name || "").trim();
                    var gTable = gVal.table || toPluralSnake(gName);
                    if (!gVal.table) {
                        try {
                            var tmpInst = new gVal();
                            if (tmpInst && tmpInst.table) gTable = tmpInst.table;
                        } catch (_) { }
                    }
                    if (gTable === key || gName === key) {
                        return registerModelClass(gVal);
                    }
                }
            }
        }

        return null;
    }

    function forTable(tableName) {
        return resolveModel(tableName);
    }

    function normalizeRelatedRef(related) {
        if (!related) return { name: "", table: "", meta: null };
        if (isModelClass(related)) {
            var meta = registerModelClass(related);
            return { name: meta.modelName, table: meta.table, meta: meta };
        }
        if (typeof related === "string") {
            var resolved = resolveModel(related);
            if (resolved) {
                return { name: resolved.modelName, table: resolved.table, meta: resolved };
            }
            return { name: related, table: toPluralSnake(related), meta: null };
        }
        return { name: "", table: "", meta: null };
    }

    function buildRelationDescriptor(type, ownerClass, related, opts) {
        var relInfo = normalizeRelatedRef(related);
        var descriptor = Object.assign({
            __isRelation: true,
            type: type,
            ownerModel: ownerClass ? ownerClass.name : "",
            relatedModel: relInfo.name,
            targetTable: relInfo.table,
            foreignKey: "",
            localKey: "id",
            ownerKey: "id",
            pivotTable: "",
            foreignPivotKey: "",
            relatedPivotKey: "",
            parentKey: "id",
            relatedKey: "id",
            pivotColumns: [],
            constraints: [],
            orderByCol: null,
            orderByDir: "DESC",
            ofManyMode: null
        }, opts || {});

        return {
            __descriptor: descriptor,
            where: function (col, opOrVal, val) {
                if (arguments.length === 2) {
                    descriptor.constraints.push({ column: col, operator: "=", value: opOrVal });
                } else if (arguments.length >= 3) {
                    descriptor.constraints.push({ column: col, operator: opOrVal, value: val });
                }
                return this;
            },
            orderBy: function (col, dir) {
                descriptor.orderByCol = col;
                descriptor.orderByDir = String(dir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
                return this;
            },
            latest: function (col) {
                descriptor.orderByCol = col || "id";
                descriptor.orderByDir = "DESC";
                return this;
            },
            oldest: function (col) {
                descriptor.orderByCol = col || "id";
                descriptor.orderByDir = "ASC";
                return this;
            },
            latestOfMany: function (col) {
                descriptor.ofManyMode = "latest";
                descriptor.orderByCol = col || "id";
                descriptor.orderByDir = "DESC";
                return this;
            },
            oldestOfMany: function (col) {
                descriptor.ofManyMode = "oldest";
                descriptor.orderByCol = col || "id";
                descriptor.orderByDir = "ASC";
                return this;
            },
            withPivot: function () {
                var cols = Array.prototype.slice.call(arguments);
                if (cols.length === 1 && Array.isArray(cols[0])) {
                    cols = cols[0];
                }
                descriptor.pivotColumns = descriptor.pivotColumns.concat(cols);
                return this;
            },
            toDescriptor: function () {
                return descriptor;
            }
        };
    }

    function getRelation(modelOrName, relationName) {
        var meta = resolveModel(modelOrName);
        if (!meta || !relationName) return null;

        if (meta._compiledRelations[relationName]) {
            return meta._compiledRelations[relationName];
        }

        var fn = meta._relationFns[relationName];
        if (typeof fn !== "function") return null;

        var ctxInstance = Object.create(meta.modelClass.prototype);
        var rawRel = fn.call(ctxInstance);
        if (!rawRel) return null;

        var desc = typeof rawRel.toDescriptor === "function" ? rawRel.toDescriptor() : rawRel;
        desc.name = relationName;

        if (!desc.targetTable && desc.relatedModel) {
            var targetMeta = resolveModel(desc.relatedModel);
            desc.targetTable = targetMeta ? targetMeta.table : toPluralSnake(desc.relatedModel);
        }

        meta._compiledRelations[relationName] = desc;
        return desc;
    }

    function getAllRelations(modelOrName) {
        var meta = resolveModel(modelOrName);
        if (!meta) return {};

        var map = {};
        Object.keys(meta._relationFns).forEach(function (relName) {
            var desc = getRelation(meta, relName);
            if (desc) map[relName] = desc;
        });
        return map;
    }

    function castSingleValue(val, castType) {
        if (val === null || val === undefined) return val;
        var rawType = String(castType || "").toLowerCase().trim();
        var baseType = rawType.split(":")[0].trim();

        if (baseType === "json" || baseType === "array" || baseType === "object" || baseType === "collection") {
            if (typeof val === "object" && !(val instanceof Date)) return val;
            var current = String(val).trim();
            if (current === "") return null;

            var maxUnwrap = 3;
            while (typeof current === "string" && maxUnwrap > 0) {
                var trimmed = current.trim();
                if (trimmed === "") return null;
                var firstChar = trimmed.charAt(0);
                if (firstChar !== "{" && firstChar !== "[" && firstChar !== '"') {
                    break;
                }
                try {
                    current = JSON.parse(trimmed);
                } catch (e) {
                    break;
                }
                maxUnwrap--;
            }
            return current;
        }

        if (baseType === "boolean" || baseType === "bool") {
            if (typeof val === "boolean") return val;
            var lower = String(val).toLowerCase().trim();
            if (lower === "" || lower === "false" || lower === "0") return false;
            if (lower === "true" || lower === "1") return true;
            return Boolean(val);
        }

        if (baseType === "integer" || baseType === "int") {
            if (val === "") return null;
            var parsedInt = parseInt(val, 10);
            return isNaN(parsedInt) ? val : parsedInt;
        }

        if (baseType === "float" || baseType === "double" || baseType === "decimal" || baseType === "number" || baseType === "real") {
            if (val === "") return null;
            var parsedFloat = parseFloat(val);
            if (isNaN(parsedFloat)) return val;
            if (baseType === "decimal" && rawType.indexOf(":") !== -1) {
                var decimals = parseInt(rawType.split(":")[1], 10);
                if (!isNaN(decimals) && decimals >= 0) {
                    return Number(parsedFloat.toFixed(decimals));
                }
            }
            return parsedFloat;
        }

        if (baseType === "string") {
            if (typeof val === "object" && !(val instanceof Date)) {
                return JSON.stringify(val);
            }
            return String(val);
        }

        if (baseType === "date" || baseType === "datetime" || baseType === "timestamp") {
            if (val === "") return null;
            var d = val instanceof Date ? val : new Date(val);
            if (isNaN(d.getTime())) return val;
            if (baseType === "timestamp") return d.getTime();
            if (baseType === "date") return d.toISOString().slice(0, 10);
            return d.toISOString();
        }

        return val;
    }

    function applyOutputTransforms(modelOrName, record, options) {
        if (!record || typeof record !== "object") return record;
        var meta = resolveModel(modelOrName);
        if (!meta) return record;

        var opts = options || {};
        var withPassword = opts.withPassword === true;
        var visibleList = Array.isArray(opts.makeVisible)
            ? opts.makeVisible
            : (opts.makeVisible ? [opts.makeVisible] : []);
        var extraHiddenList = Array.isArray(opts.makeHidden)
            ? opts.makeHidden
            : (opts.makeHidden ? [opts.makeHidden] : []);

        var casts = meta.casts || {};
        var hidden = meta.hidden || [];

        var effectiveHidden = {};
        for (var h = 0; h < hidden.length; h++) {
            effectiveHidden[hidden[h]] = true;
        }
        for (var eh = 0; eh < extraHiddenList.length; eh++) {
            if (extraHiddenList[eh]) {
                effectiveHidden[String(extraHiddenList[eh])] = true;
            }
        }

        if (withPassword || visibleList.indexOf("*") !== -1) {
            delete effectiveHidden["password"];
        }
        if (visibleList.indexOf("*") !== -1) {
            effectiveHidden = {};
        } else {
            for (var v = 0; v < visibleList.length; v++) {
                if (visibleList[v]) {
                    delete effectiveHidden[String(visibleList[v])];
                }
            }
        }

        Object.keys(effectiveHidden).forEach(function (hiddenKey) {
            delete record[hiddenKey];
        });

        var schema = (typeof getSchemaMetadata === "function") ? getSchemaMetadata() : null;
        var sheetCols = (schema && schema.sheets && schema.sheets[meta.table])
            ? schema.sheets[meta.table].colMap
            : null;

        if (sheetCols) {
            Object.keys(sheetCols).forEach(function (col) {
                if (!Object.prototype.hasOwnProperty.call(casts, col) &&
                    Object.prototype.hasOwnProperty.call(record, col)) {
                    var rawVal = record[col];
                    if (rawVal !== null && typeof rawVal === "object" && !(rawVal instanceof Date)) {
                        record[col] = JSON.stringify(rawVal);
                    }
                }
            });
        }

        Object.keys(casts).forEach(function (col) {
            if (Object.prototype.hasOwnProperty.call(record, col)) {
                record[col] = castSingleValue(record[col], casts[col]);
            }
        });

        return record;
    }

    function prepareInputAttributes(modelOrName, rawData, options) {
        var meta = resolveModel(modelOrName);
        var input = Object.assign({}, rawData || {});
        var bypass = Boolean((options && options.force) || Model._bypassMassAssignment);

        if (!meta || bypass) {
            Object.keys(input).forEach(function (k) {
                if (input[k] !== null && typeof input[k] === "object" && !(input[k] instanceof Date)) {
                    input[k] = JSON.stringify(input[k]);
                }
            });
            return input;
        }

        var pk = meta.primaryKey || "id";
        var hasFillable = meta.hasFillable === true;
        var fillable = hasFillable ? meta.fillable : [];
        var guarded = Array.isArray(meta.guarded) ? meta.guarded : [];
        var isAllGuarded = guarded.indexOf("*") !== -1;

        var filtered = {};
        Object.keys(input).forEach(function (key) {
            if (input[key] === undefined) return;

            if (key === pk) {
                filtered[key] = input[key];
                return;
            }

            if (isAllGuarded) return;
            if (guarded.indexOf(key) !== -1) return;
            if (hasFillable && fillable.indexOf(key) === -1) return;

            var val = input[key];
            if (val !== null && typeof val === "object" && !(val instanceof Date)) {
                val = JSON.stringify(val);
            }
            filtered[key] = val;
        });

        return filtered;
    }

    function createQueryBuilder(meta) {
        var state = {
            withList: [],
            filters: {},
            sort: null,
            groupBy: null,
            withTrashed: false,
            onlyTrashed: false,
            withPassword: false,
            makeVisible: [],
            makeHidden: []
        };

        return {
            with: function (relations) {
                var list = Array.isArray(relations)
                    ? relations
                    : Array.prototype.slice.call(arguments);
                for (var i = 0; i < list.length; i++) {
                    if (Array.isArray(list[i])) {
                        state.withList = state.withList.concat(list[i]);
                    } else if (list[i]) {
                        state.withList.push(list[i]);
                    }
                }
                return this;
            },

            where: function (column, opOrVal, val) {
                if (column && typeof column === "object") {
                    Object.assign(state.filters, column);
                    return this;
                }
                if (arguments.length === 2) {
                    state.filters[column] = opOrVal;
                } else if (arguments.length >= 3) {
                    state.filters[column] = { operator: opOrVal, value: val };
                }
                return this;
            },

            orderBy: function (column, direction) {
                var dir = String(direction || "ASC").toUpperCase();
                state.sort = dir === "DESC" ? ("-" + column) : column;
                return this;
            },

            latest: function (column) {
                state.sort = "-" + (column || "id");
                return this;
            },

            oldest: function (column) {
                state.sort = column || "id";
                return this;
            },

            groupBy: function (column) {
                state.groupBy = column;
                return this;
            },

            withTrashed: function () {
                state.withTrashed = true;
                return this;
            },

            onlyTrashed: function () {
                state.onlyTrashed = true;
                return this;
            },

            withPassword: function () {
                state.withPassword = true;
                return this;
            },

            makeVisible: function (attributes) {
                var attrs = Array.isArray(attributes)
                    ? attributes
                    : Array.prototype.slice.call(arguments);
                state.makeVisible = state.makeVisible.concat(attrs);
                return this;
            },

            makeHidden: function (attributes) {
                var attrs = Array.isArray(attributes)
                    ? attributes
                    : Array.prototype.slice.call(arguments);
                state.makeHidden = state.makeHidden.concat(attrs);
                return this;
            },

            _buildReadFilters: function (extra) {
                var flt = Object.assign({}, state.filters, extra || {});
                var mergedWith = state.withList.length > 0 ? state.withList : (meta.defaultWith || []);
                if (mergedWith.length > 0) {
                    flt.with = mergedWith;
                }
                if (state.sort) flt.sort = state.sort;
                if (state.groupBy) flt.group_by = state.groupBy;
                if (state.withTrashed) flt.with_trashed = true;
                if (state.onlyTrashed) flt.only_trashed = true;
                if (state.withPassword) flt.with_password = true;
                if (state.makeVisible.length > 0) flt.make_visible = state.makeVisible;
                if (state.makeHidden.length > 0) flt.make_hidden = state.makeHidden;
                return flt;
            },

            get: function () {
                var res = read(meta.table, this._buildReadFilters(), null, null, state.sort);
                return (res && res.status && Array.isArray(res.data)) ? res.data : [];
            },

            paginate: function (perPage, page) {
                var p = page || 1;
                var pp = perPage || 10;
                return read(meta.table, this._buildReadFilters({ page: p, per_page: pp }), p, pp, state.sort);
            },

            first: function () {
                var sortToUse = state.sort || (meta.primaryKey || "id");
                var res = read(meta.table, this._buildReadFilters({ page: 1, per_page: 1, sort: sortToUse }), 1, 1, sortToUse);
                return (res && res.status && Array.isArray(res.data) && res.data.length > 0) ? res.data[0] : null;
            },

            find: function (id) {
                var mergedWith = state.withList.length > 0
                    ? state.withList
                    : (meta.defaultWith && meta.defaultWith.length > 0 ? meta.defaultWith : "none");
                if (meta.primaryKey !== "id") {
                    state.filters[meta.primaryKey] = id;
                    return this.first();
                }
                return find(meta.table, id, {
                    with: mergedWith,
                    with_trashed: state.withTrashed,
                    only_trashed: state.onlyTrashed,
                    with_password: state.withPassword,
                    make_visible: state.makeVisible,
                    make_hidden: state.makeHidden
                });
            }
        };
    }

    Model._toSnakeCase = toSnakeCase;
    Model._getMeta = resolveModel;
    Model._normalizeRelatedRef = normalizeRelatedRef;
    Model._buildRelationDescriptor = buildRelationDescriptor;
    Model._createQueryBuilder = createQueryBuilder;

    Model.resolve = resolveModel;
    Model.forTable = forTable;
    Model.getRelation = getRelation;
    Model.getAllRelations = getAllRelations;
    Model.applyOutputTransforms = applyOutputTransforms;
    Model.prepareInputAttributes = prepareInputAttributes;
})();

var ModelBase = Model;
