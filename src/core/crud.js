var CACHE_CONFIG = {
    PREFIX: "GAS_DB_V1_",
    SCHEMA_TTL: 21600,
    INDEX_TTL: 3600,
    CHUNK_SIZE: 85000
};

var _REQ_MEM = {
    rows: {},
    indexes: {},
    schema: null
};

var ChunkedCache = {
    get: function (key) {
        try {
            var cache = CacheService.getScriptCache();
            var fullKey = CACHE_CONFIG.PREFIX + key;
            var metaRaw = cache.get(fullKey + "_META");

            if (!metaRaw) {
                var single = cache.get(fullKey);
                return single ? JSON.parse(single) : null;
            }

            var meta = JSON.parse(metaRaw);
            var chunkKeys = [];
            for (var i = 0; i < meta.chunks; i++) {
                chunkKeys.push(fullKey + "_C" + i);
            }

            var chunksMap = cache.getAll(chunkKeys);
            var combined = "";
            for (var j = 0; j < chunkKeys.length; j++) {
                if (!chunksMap[chunkKeys[j]]) return null;
                combined += chunksMap[chunkKeys[j]];
            }

            return JSON.parse(combined);
        } catch (e) {
            return null;
        }
    },

    put: function (key, dataObj, ttl) {
        try {
            var cache = CacheService.getScriptCache();
            var fullKey = CACHE_CONFIG.PREFIX + key;
            var jsonStr = JSON.stringify(dataObj);
            var expiration = ttl || CACHE_CONFIG.INDEX_TTL;

            if (jsonStr.length <= CACHE_CONFIG.CHUNK_SIZE) {
                cache.remove(fullKey + "_META");
                cache.put(fullKey, jsonStr, expiration);
                return true;
            }

            var totalChunks = Math.ceil(jsonStr.length / CACHE_CONFIG.CHUNK_SIZE);
            var payloadMap = {};
            payloadMap[fullKey + "_META"] = JSON.stringify({ chunks: totalChunks });

            for (var i = 0; i < totalChunks; i++) {
                var start = i * CACHE_CONFIG.CHUNK_SIZE;
                payloadMap[fullKey + "_C" + i] = jsonStr.substring(start, start + CACHE_CONFIG.CHUNK_SIZE);
            }

            cache.putAll(payloadMap, expiration);
            return true;
        } catch (e) {
            return false;
        }
    },

    remove: function (key) {
        try {
            var cache = CacheService.getScriptCache();
            var fullKey = CACHE_CONFIG.PREFIX + key;
            var metaRaw = cache.get(fullKey + "_META");

            var keysToRemove = [fullKey, fullKey + "_META"];
            if (metaRaw) {
                var meta = JSON.parse(metaRaw);
                for (var i = 0; i < meta.chunks; i++) {
                    keysToRemove.push(fullKey + "_C" + i);
                }
            }
            cache.removeAll(keysToRemove);
        } catch (e) { }
    }
};

function _withScriptLock(callback) {
    var lock = typeof LockService !== "undefined" ? LockService.getScriptLock() : null;
    if (!lock) return callback();

    if (!lock.tryLock(10000)) {
        return { status: false, code: 503, message: "Server is busy. Please try again." };
    }

    try {
        return callback();
    } finally {
        lock.releaseLock();
    }
}

function sheetRowsCached(sheetName) {
    if (_REQ_MEM.rows.hasOwnProperty(sheetName)) {
        return _REQ_MEM.rows[sheetName];
    }
    var rows = sheetRows(sheetName);
    _REQ_MEM.rows[sheetName] = rows;
    return rows;
}

function resolveTargetSheetName(propName, schema) {
    var plural = /[^aeiou]y$/i.test(propName)
        ? propName.replace(/y$/i, "ies")
        : propName + "s";

    if (schema && schema.sheets) {
        if (schema.sheets[plural]) return plural;
        if (schema.sheets[propName]) return propName;
        return null;
    }

    if (sheet().getSheetByName(plural)) return plural;
    if (sheet().getSheetByName(propName)) return propName;
    return null;
}

function getSchemaMetadata(forceRebuild) {
    if (!forceRebuild && _REQ_MEM.schema) {
        return _REQ_MEM.schema;
    }

    if (!forceRebuild) {
        var cachedSchema = ChunkedCache.get("INFORMATION_SCHEMA");
        if (cachedSchema) {
            _REQ_MEM.schema = cachedSchema;
            return cachedSchema;
        }
    }

    var allSheets = sheet().getSheets();
    var schema = {
        sheets: {},
        hasManyMap: {}
    };

    for (var i = 0; i < allSheets.length; i++) {
        var s = allSheets[i];
        var sName = s.getName();
        var lastCol = s.getLastColumn();
        var headers = lastCol > 0 ? s.getRange(1, 1, 1, lastCol).getValues()[0] : [];

        var colMap = {};
        for (var c = 0; c < headers.length; c++) {
            if (headers[c] !== "") {
                colMap[String(headers[c])] = c;
            }
        }

        schema.sheets[sName] = {
            headers: headers,
            colMap: colMap,
            belongsTo: []
        };
    }

    var sheetNames = Object.keys(schema.sheets);
    for (var j = 0; j < sheetNames.length; j++) {
        var currentSheet = sheetNames[j];
        var info = schema.sheets[currentSheet];
        var headers = info.headers;

        for (var h = 0; h < headers.length; h++) {
            var col = String(headers[h]);
            if (col !== "id" && /_id$/.test(col)) {
                var propName = col.replace(/_id$/, "");
                var targetSheet = resolveTargetSheetName(propName, schema);

                if (targetSheet) {
                    info.belongsTo.push({
                        colName: col,
                        colIndex: h,
                        propName: propName,
                        targetSheet: targetSheet
                    });

                    if (!schema.hasManyMap[targetSheet]) {
                        schema.hasManyMap[targetSheet] = [];
                    }
                    schema.hasManyMap[targetSheet].push({
                        childSheet: currentSheet,
                        fkCol: col,
                        fkIndex: h
                    });
                }
            }
        }
    }

    _REQ_MEM.schema = schema;
    ChunkedCache.put("INFORMATION_SCHEMA", schema, CACHE_CONFIG.SCHEMA_TTL);
    return schema;
}

function getRowIndex(sheetName, forceRebuild) {
    if (!forceRebuild && _REQ_MEM.indexes[sheetName]) {
        return _REQ_MEM.indexes[sheetName];
    }

    if (!forceRebuild) {
        var cachedIdx = ChunkedCache.get("IDX_" + sheetName);
        if (cachedIdx) {
            _REQ_MEM.indexes[sheetName] = cachedIdx;
            return cachedIdx;
        }
    }

    var rows = sheetRowsCached(sheetName);
    var indexObj = {
        byId: {},
        trashedById: {},
        byFk: {},
        maxId: 0,
        totalActive: 0,
        totalTrashed: 0
    };

    if (!rows || rows.length < 2) {
        _REQ_MEM.indexes[sheetName] = indexObj;
        ChunkedCache.put("IDX_" + sheetName, indexObj, CACHE_CONFIG.INDEX_TTL);
        return indexObj;
    }

    var headers = rows[0];
    var idIdx = headers.indexOf("id");
    var deletedIdx = headers.indexOf("deleted_at");

    var fkCols = [];
    for (var h = 0; h < headers.length; h++) {
        var colName = String(headers[h]);
        if (colName !== "id" && /_id$/.test(colName)) {
            fkCols.push({ name: colName, idx: h });
            indexObj.byFk[colName] = {};
        }
    }

    for (var r = 1; r < rows.length; r++) {
        var row = rows[r];
        var sheetRowNum = r + 1;

        var rawId = idIdx !== -1 ? row[idIdx] : null;
        var idStr = (rawId !== null && rawId !== undefined && rawId !== "") ? String(rawId) : null;

        if (idStr !== null) {
            var numId = parseInt(idStr, 10);
            if (!isNaN(numId) && numId > indexObj.maxId) {
                indexObj.maxId = numId;
            }
        }

        var isDeleted = deletedIdx !== -1 &&
            row[deletedIdx] !== "" &&
            row[deletedIdx] !== null &&
            row[deletedIdx] !== undefined;

        if (isDeleted) {
            indexObj.totalTrashed++;
            if (idStr !== null) indexObj.trashedById[idStr] = sheetRowNum;
            continue;
        }

        indexObj.totalActive++;
        if (idStr !== null) {
            indexObj.byId[idStr] = sheetRowNum;
        }

        for (var f = 0; f < fkCols.length; f++) {
            var fk = fkCols[f];
            var fkVal = row[fk.idx];
            if (fkVal !== null && fkVal !== undefined && fkVal !== "") {
                var fkStr = String(fkVal);
                if (!indexObj.byFk[fk.name][fkStr]) {
                    indexObj.byFk[fk.name][fkStr] = [];
                }
                indexObj.byFk[fk.name][fkStr].push(sheetRowNum);
            }
        }
    }

    _REQ_MEM.indexes[sheetName] = indexObj;
    ChunkedCache.put("IDX_" + sheetName, indexObj, CACHE_CONFIG.INDEX_TTL);
    return indexObj;
}

function invalidateSheetCache(sheetName, invalidateSchema) {
    delete _REQ_MEM.rows[sheetName];
    delete _REQ_MEM.indexes[sheetName];
    ChunkedCache.remove("IDX_" + sheetName);

    if (invalidateSchema) {
        _REQ_MEM.schema = null;
        ChunkedCache.remove("INFORMATION_SCHEMA");
    }
}

function rebuildAllIndexes() {
    var schema = getSchemaMetadata(true);
    var names = Object.keys(schema.sheets);
    for (var i = 0; i < names.length; i++) {
        getRowIndex(names[i], true);
    }
    return { status: true, message: "All sheet schemas and indexes rebuilt.", sheets: names };
}

var isSearchMatch = isSearchMatch || function (cellValue, query) {
    if (cellValue === null || cellValue === undefined) return false;
    return String(cellValue).toLowerCase().indexOf(String(query).toLowerCase()) !== -1;
};

var parseDateValue = parseDateValue || function (val) {
    if (val instanceof Date && !isNaN(val.getTime())) return val.getTime();
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) {
        var d = new Date(val.trim());
        if (!isNaN(d.getTime())) return d.getTime();
    }
    return null;
};

function compareSortValues(a, b, direction) {
    var multiplier = direction === "DESC" ? -1 : 1;
    if (a === null || a === undefined || a === "") {
        return (b === null || b === undefined || b === "") ? 0 : 1;
    }
    if (b === null || b === undefined || b === "") return -1;

    var strA = String(a).trim();
    var strB = String(b).trim();
    var numericPattern = /^-?\d+(?:\.\d+)?$/;

    if (numericPattern.test(strA) && numericPattern.test(strB)) {
        var numA = Number(strA);
        var numB = Number(strB);
        return numA < numB ? -1 * multiplier : (numA > numB ? 1 * multiplier : 0);
    }

    var dateA = parseDateValue(a);
    var dateB = parseDateValue(b);
    if (dateA !== null && dateB !== null) {
        return dateA < dateB ? -1 * multiplier : (dateA > dateB ? 1 * multiplier : 0);
    }

    strA = strA.toLowerCase();
    strB = strB.toLowerCase();
    return strA < strB ? -1 * multiplier : (strA > strB ? 1 * multiplier : 0);
}

function resolveDotPath(obj, path) {
    var parts = path.split(".");
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
        if (current === null || current === undefined) return null;
        current = current[parts[i]];
    }
    return current;
}

function getRelationValueFromConfig(singleConfigs, row, path) {
    var parts = path.split(".");
    var rootProp = parts[0];
    var config = null;

    for (var i = 0; i < singleConfigs.length; i++) {
        if (singleConfigs[i].propName === rootProp) {
            config = singleConfigs[i];
            break;
        }
    }
    if (!config || config.colIndex === -1) return null;

    var fkVal = row[config.colIndex];
    var fkStr = (fkVal !== null && fkVal !== undefined) ? String(fkVal) : "";
    var relObj = config.lookupMap[fkStr] || null;

    if (!relObj || parts.length === 1) return relObj;
    return resolveDotPath(relObj, parts.slice(1).join("."));
}

function parseWithRelations(withParam) {
    if (withParam === "*" || withParam === "auto") {
        return { mode: "auto", allowed: {} };
    }

    if (
        withParam === undefined ||
        withParam === null ||
        withParam === false ||
        withParam === "false" ||
        withParam === "none" ||
        withParam === ""
    ) {
        return { mode: "none", allowed: {} };
    }

    var list = Array.isArray(withParam)
        ? withParam
        : String(withParam).split(",");

    var allowed = {};
    var hasAny = false;

    for (var i = 0; i < list.length; i++) {
        var item = String(list[i]).trim();
        if (!item || item === "none") continue;

        var parts = item.split(".");
        var currentPath = "";
        for (var p = 0; p < parts.length; p++) {
            var seg = parts[p].trim();
            if (!seg) continue;
            currentPath = currentPath ? (currentPath + "." + seg) : seg;
            allowed[currentPath] = true;
            hasAny = true;
        }
    }

    if (!hasAny) {
        return { mode: "none", allowed: {} };
    }

    return { mode: "selective", allowed: allowed };
}

function getAllSingleRelationsForSheet(sheetName) {
    var result = [];
    var seen = {};

    if (typeof Model !== "undefined" && typeof Model.getAllRelations === "function") {
        var modelRels = Model.getAllRelations(sheetName);
        Object.keys(modelRels).forEach(function (relName) {
            var desc = modelRels[relName];
            if (desc && (desc.type === "belongsTo" || desc.type === "hasOne")) {
                result.push(desc);
                seen[relName] = true;
            }
        });
    }

    var schema = getSchemaMetadata();
    var sheetMeta = schema.sheets[sheetName];
    if (sheetMeta && Array.isArray(sheetMeta.belongsTo)) {
        for (var i = 0; i < sheetMeta.belongsTo.length; i++) {
            var b = sheetMeta.belongsTo[i];
            if (!seen[b.propName]) {
                result.push({
                    type: "belongsTo",
                    name: b.propName,
                    targetTable: b.targetSheet,
                    foreignKey: b.colName,
                    ownerKey: "id",
                    constraints: []
                });
            }
        }
    }

    return result;
}

function getAllCollectionRelationsForSheet(sheetName) {
    var result = [];
    var seen = {};

    if (typeof Model !== "undefined" && typeof Model.getAllRelations === "function") {
        var modelRels = Model.getAllRelations(sheetName);
        Object.keys(modelRels).forEach(function (relName) {
            var desc = modelRels[relName];
            if (desc && (desc.type === "hasMany" || desc.type === "belongsToMany")) {
                result.push(desc);
                seen[relName] = true;
            }
        });
    }

    var schema = getSchemaMetadata();
    var childRels = (schema.hasManyMap && schema.hasManyMap[sheetName]) || [];
    for (var i = 0; i < childRels.length; i++) {
        var h = childRels[i];
        if (!seen[h.childSheet]) {
            result.push({
                type: "hasMany",
                name: h.childSheet,
                targetTable: h.childSheet,
                foreignKey: h.fkCol,
                localKey: "id",
                constraints: []
            });
        }
    }

    return result;
}

function matchesRelationConstraints(rowObj, constraints) {
    if (!Array.isArray(constraints) || constraints.length === 0) return true;
    for (var i = 0; i < constraints.length; i++) {
        var c = constraints[i];
        var actual = rowObj[c.column];
        var op = String(c.operator || "=").toUpperCase();
        var expected = c.value;

        if (op === "=" && String(actual) !== String(expected)) return false;
        if (op === "!=" && String(actual) === String(expected)) return false;
        if (op === ">" && !(Number(actual) > Number(expected))) return false;
        if (op === ">=" && !(Number(actual) >= Number(expected))) return false;
        if (op === "<" && !(Number(actual) < Number(expected))) return false;
        if (op === "<=" && !(Number(actual) <= Number(expected))) return false;
        if (op === "LIKE" && String(actual || "").toLowerCase().indexOf(String(expected).toLowerCase()) === -1) return false;
    }
    return true;
}

function applyModelRowFormat(sheetName, obj, formatOpts) {
    if (typeof Model !== "undefined" && typeof Model.applyOutputTransforms === "function") {
        var opts = (typeof formatOpts === "boolean")
            ? { withPassword: formatOpts }
            : (formatOpts || {});
        return Model.applyOutputTransforms(sheetName, obj, opts);
    }
    return obj;
}

function prepareModelInputData(sheetName, rawData) {
    if (typeof Model !== "undefined" && typeof Model.prepareInputAttributes === "function") {
        return Model.prepareInputAttributes(sheetName, rawData);
    }
    return Object.assign({}, rawData || {});
}

function ensureModelResolved(sheetName) {
    if (typeof Model !== "undefined" && typeof Model.resolve === "function") {
        Model.resolve(sheetName);
    }
}

function find(sheet_name, id, options) {
    ensureModelResolved(sheet_name);

    if (id === undefined || id === null || id === "") {
        return null;
    }

    var opts = options || {};
    var withOpt = opts.with !== undefined ? opts.with : "none";
    var withPassword = opts.with_password === true;
    var makeVisible = opts.make_visible || [];
    var makeHidden = opts.make_hidden || [];
    var withTrashed = opts.with_trashed === true;
    var onlyTrashed = opts.only_trashed === true;

    if (withOpt === "none" && !withTrashed && !onlyTrashed) {
        var getSheet = sheet().getSheetByName(sheet_name);
        if (!getSheet) return null;

        var rows = sheetRowsCached(sheet_name);
        if (!rows || rows.length < 2) return null;

        var rowIndex = getRowIndex(sheet_name);
        var targetSheetRow = rowIndex.byId[String(id)];
        if (!targetSheetRow || !rows[targetSheetRow - 1]) return null;

        var headers = rows[0];
        var row = rows[targetSheetRow - 1];
        var obj = {};
        for (var i = 0; i < headers.length; i++) {
            obj[headers[i]] = row[i];
        }
        return applyModelRowFormat(sheet_name, obj, {
            withPassword: withPassword,
            makeVisible: makeVisible,
            makeHidden: makeHidden
        });
    }

    var res = read(sheet_name, {
        id: id,
        with: withOpt,
        with_password: withPassword,
        make_visible: makeVisible,
        make_hidden: makeHidden,
        with_trashed: withTrashed,
        only_trashed: onlyTrashed
    }, 1, 1, null);

    if (res && res.status && Array.isArray(res.data) && res.data.length > 0) {
        return res.data[0];
    }
    return null;
}

function create(sheet_name, payload) {
    ensureModelResolved(sheet_name);

    if (!payload || payload.data === undefined) {
        return { status: false, message: "Invalid payload format." };
    }

    return _withScriptLock(function () {
        var getSheet = sheet().getSheetByName(sheet_name);
        if (!getSheet) return { status: false, message: "Sheet does not exist." };

        var schema = getSchemaMetadata();
        var sheetMeta = schema.sheets[sheet_name] || getSchemaMetadata(true).sheets[sheet_name];
        var headers = sheetMeta.headers;
        var data = prepareModelInputData(sheet_name, payload.data);

        for (var b = 0; b < sheetMeta.belongsTo.length; b++) {
            var rel = sheetMeta.belongsTo[b];
            if (data.hasOwnProperty(rel.colName)) {
                var fkValue = data[rel.colName];

                if (fkValue === undefined || fkValue === null || fkValue === "") {
                    return { status: false, message: "Column '" + rel.colName + "' cannot be empty." };
                }

                var targetIndex = getRowIndex(rel.targetSheet);
                if (!targetIndex.byId.hasOwnProperty(String(fkValue))) {
                    return {
                        status: false,
                        message: "Record with " + rel.colName + " = " + fkValue + " not found in " + rel.targetSheet + "."
                    };
                }
            }
        }

        var currentIndex = getRowIndex(sheet_name, true);
        var defId = currentIndex.maxId + 1;

        var values = [];
        for (var i = 0; i < headers.length; i++) {
            var colName = headers[i];

            if (colName === "id") {
                values.push(defId);
            } else if (colName === "created_at" || colName === "updated_at") {
                values.push(new Date());
            } else if (colName === "deleted_at") {
                values.push("");
            } else {
                values.push(data.hasOwnProperty(colName) ? data[colName] : "");
            }
        }

        var newRow = getSheet.getLastRow() + 1;
        for (var j = 0; j < values.length; j++) {
            if (/^(0\d+|\+\d+)/.test(String(values[j]))) {
                getSheet.getRange(newRow, j + 1).setNumberFormat("@");
                values[j] = String(values[j]);
            }
        }

        getSheet.getRange(newRow, 1, 1, values.length).setValues([values]);
        invalidateSheetCache(sheet_name, false);

        var responseData = Object.assign({}, data, { id: defId });
        if (headers.indexOf("deleted_at") !== -1 && responseData.deleted_at === undefined) {
            responseData.deleted_at = "";
        }
        applyModelRowFormat(sheet_name, responseData, false);

        return { status: true, message: "Data successfully created.", data: responseData };
    });
}

function bulkCreate(sheet_name, payloadOrRecords) {
    ensureModelResolved(sheet_name);

    var records = Array.isArray(payloadOrRecords)
        ? payloadOrRecords
        : (payloadOrRecords && Array.isArray(payloadOrRecords.data) ? payloadOrRecords.data : null);

    if (!records || records.length === 0) {
        return { status: false, message: "Payload data must be a non-empty array." };
    }

    return _withScriptLock(function () {
        var getSheet = sheet().getSheetByName(sheet_name);
        if (!getSheet) return { status: false, message: "Sheet does not exist." };

        var schema = getSchemaMetadata();
        var sheetMeta = schema.sheets[sheet_name] || getSchemaMetadata(true).sheets[sheet_name];
        var headers = sheetMeta.headers;

        var fkIndexes = {};
        for (var b = 0; b < sheetMeta.belongsTo.length; b++) {
            var rel = sheetMeta.belongsTo[b];
            fkIndexes[rel.colName] = {
                targetSheet: rel.targetSheet,
                index: getRowIndex(rel.targetSheet)
            };
        }

        var normalizedRecords = [];
        for (var rIdx = 0; rIdx < records.length; rIdx++) {
            var rawRec = records[rIdx];
            if (!rawRec || typeof rawRec !== "object") {
                return { status: false, message: "Invalid record at index " + rIdx + "." };
            }

            var rec = prepareModelInputData(sheet_name, rawRec);
            normalizedRecords.push(rec);

            for (var fkCol in fkIndexes) {
                if (rec.hasOwnProperty(fkCol)) {
                    var fkValue = rec[fkCol];
                    if (fkValue === undefined || fkValue === null || fkValue === "") {
                        return {
                            status: false,
                            message: "Record at index " + rIdx + ": column '" + fkCol + "' cannot be empty."
                        };
                    }
                    if (!fkIndexes[fkCol].index.byId.hasOwnProperty(String(fkValue))) {
                        return {
                            status: false,
                            message: "Record at index " + rIdx + ": " + fkCol + " = " + fkValue + " not found in " + fkIndexes[fkCol].targetSheet + "."
                        };
                    }
                }
            }
        }

        var currentIndex = getRowIndex(sheet_name, true);
        var nextId = currentIndex.maxId + 1;
        var now = new Date();
        var startRow = getSheet.getLastRow() + 1;

        var rowsMatrix = [];
        var createdRecords = [];

        for (var i = 0; i < normalizedRecords.length; i++) {
            var item = normalizedRecords[i];
            var assignedId = nextId++;
            var rowValues = [];

            for (var c = 0; c < headers.length; c++) {
                var colName = headers[c];
                if (colName === "id") {
                    rowValues.push(assignedId);
                } else if (colName === "created_at" || colName === "updated_at") {
                    rowValues.push(now);
                } else if (colName === "deleted_at") {
                    rowValues.push("");
                } else {
                    var cellVal = item.hasOwnProperty(colName) ? item[colName] : "";
                    if (/^(0\d+|\+\d+)/.test(String(cellVal))) {
                        getSheet.getRange(startRow + i, c + 1).setNumberFormat("@");
                        cellVal = String(cellVal);
                    }
                    rowValues.push(cellVal);
                }
            }

            rowsMatrix.push(rowValues);

            var cleanItem = Object.assign({}, item, { id: assignedId });
            if (headers.indexOf("deleted_at") !== -1 && cleanItem.deleted_at === undefined) {
                cleanItem.deleted_at = "";
            }
            applyModelRowFormat(sheet_name, cleanItem, false);
            createdRecords.push(cleanItem);
        }

        getSheet.getRange(startRow, 1, rowsMatrix.length, headers.length).setValues(rowsMatrix);
        invalidateSheetCache(sheet_name, false);

        return {
            status: true,
            message: createdRecords.length + " records successfully created.",
            count: createdRecords.length,
            data: createdRecords
        };
    });
}

function read(sheet_name, flt = null, page = 1, per_page = null, sort = null) {
    ensureModelResolved(sheet_name);

    var getSheet = sheet().getSheetByName(sheet_name);
    if (!getSheet) {
        return { status: false, message: "Sheet does not exist." };
    }

    var schema = getSchemaMetadata();
    var sheetMeta = schema.sheets[sheet_name] || getSchemaMetadata(true).sheets[sheet_name];
    var headers = sheetMeta.headers;
    var colMap = sheetMeta.colMap;

    var filters = flt ? Object.assign({}, flt) : {};
    var groupBy = filters.group_by || null;
    var withConfig = parseWithRelations(filters.with);

    var withPassword = filters.with_password === true || String(filters.with_password) === "true";
    var makeVisible = Array.isArray(filters.make_visible)
        ? filters.make_visible
        : (filters.make_visible ? [filters.make_visible] : []);
    var makeHidden = Array.isArray(filters.make_hidden)
        ? filters.make_hidden
        : (filters.make_hidden ? [filters.make_hidden] : []);
    var rowFormatOpts = {
        withPassword: withPassword,
        makeVisible: makeVisible,
        makeHidden: makeHidden
    };

    var effectiveHiddenMap = {};
    var resolvedMeta = (typeof Model !== "undefined" && typeof Model.resolve === "function")
        ? Model.resolve(sheet_name)
        : null;
    if (resolvedMeta && Array.isArray(resolvedMeta.hidden)) {
        for (var hm = 0; hm < resolvedMeta.hidden.length; hm++) {
            effectiveHiddenMap[resolvedMeta.hidden[hm]] = true;
        }
    }
    for (var mhi = 0; mhi < makeHidden.length; mhi++) {
        if (makeHidden[mhi]) effectiveHiddenMap[String(makeHidden[mhi])] = true;
    }
    if (withPassword) {
        delete effectiveHiddenMap["password"];
    }
    for (var mvi = 0; mvi < makeVisible.length; mvi++) {
        if (makeVisible[mvi]) delete effectiveHiddenMap[String(makeVisible[mvi])];
    }

    var withTrashed = filters.with_trashed === true || String(filters.with_trashed) === "true";
    var onlyTrashed = filters.only_trashed === true || String(filters.only_trashed) === "true";
    var includeDeleted = withTrashed || onlyTrashed;

    function isFalseFlag(val) {
        return val === false || String(val).toLowerCase() === "false" || val === 0 || val === "0";
    }

    var normalizedColumns = [];
    var normalizedOrder = [];

    if (Array.isArray(filters.columns)) {
        normalizedColumns = filters.columns;
    } else {
        var columnIndexes = {};
        Object.keys(filters).forEach(function (key) {
            var match = key.match(/^columns\[(\d+)\]\[(.+)\]$/);
            if (!match) return;
            var index = parseInt(match[1], 10);
            var property = match[2];
            if (!columnIndexes[index]) columnIndexes[index] = { search: {} };

            if (property === "search][value") {
                columnIndexes[index].search.value = filters[key];
            } else if (property === "search][regex") {
                columnIndexes[index].search.regex = filters[key];
            } else {
                columnIndexes[index][property] = filters[key];
            }
            delete filters[key];
        });

        normalizedColumns = Object.keys(columnIndexes)
            .sort(function (a, b) { return Number(a) - Number(b); })
            .map(function (index) { return columnIndexes[index]; });
    }
    filters.columns = normalizedColumns;

    if (Array.isArray(filters.order)) {
        normalizedOrder = filters.order;
    } else {
        var orderIndexes = {};
        Object.keys(filters).forEach(function (key) {
            var match = key.match(/^order\[(\d+)\]\[(column|dir|name)\]$/);
            if (!match) return;
            var index = parseInt(match[1], 10);
            var property = match[2];
            if (!orderIndexes[index]) orderIndexes[index] = {};
            orderIndexes[index][property] = filters[key];
            delete filters[key];
        });

        normalizedOrder = Object.keys(orderIndexes)
            .sort(function (a, b) { return Number(a) - Number(b); })
            .map(function (index) { return orderIndexes[index]; });
    }

    var explicitSort =
        filters.sort !== undefined && String(filters.sort).trim() !== ""
            ? String(filters.sort).trim()
            : (sort !== null && sort !== undefined && String(sort).trim() !== ""
                ? String(sort).trim()
                : null);

    var sortBy = null;
    var sortDir = "DESC";

    if (explicitSort) {
        if (explicitSort.charAt(0) === "-") {
            sortDir = "DESC";
            sortBy = explicitSort.substring(1);
        } else {
            sortDir = "ASC";
            sortBy = explicitSort;
        }
    } else if (normalizedOrder.length > 0) {
        var orderConfig = normalizedOrder[0];
        var columnIndex = parseInt(orderConfig.column, 10);
        if (!isNaN(columnIndex) && normalizedColumns[columnIndex]) {
            var orderColumn = normalizedColumns[columnIndex];
            sortBy = orderColumn.data || orderColumn.name || null;
            sortDir = String(orderConfig.dir || "asc").toUpperCase() === "DESC" ? "DESC" : "ASC";
        }
    }

    if (!sortBy) {
        sortBy = "id";
        sortDir = "DESC";
    }

    var draw = parseInt(filters.draw, 10) || 0;
    var globalSearch = "";
    if (filters.search !== undefined && filters.search !== null) {
        if (typeof filters.search === "object") {
            if (filters.search.value !== undefined && filters.search.value !== null) {
                globalSearch = String(filters.search.value);
            }
        } else {
            globalSearch = String(filters.search);
        }
    }
    if (globalSearch === "" && filters["search[value]"] !== undefined && filters["search[value]"] !== null) {
        globalSearch = String(filters["search[value]"]);
    }

    var columnSearches = [];
    for (var c = 0; c < normalizedColumns.length; c++) {
        var column = normalizedColumns[c];
        if (
            isFalseFlag(column.searchable) ||
            !column.search ||
            column.search.value === undefined ||
            column.search.value === ""
        ) continue;

        var searchColumn = column.data || column.name;
        if (searchColumn) {
            columnSearches.push({ column: searchColumn, value: column.search.value });
        }
    }

    var paginationEnabled = false;
    if (filters.start !== undefined && filters.length !== undefined) {
        var start = Math.max(0, parseInt(filters.start, 10) || 0);
        var length = parseInt(filters.length, 10);
        if (length === -1) {
            paginationEnabled = false;
            page = null;
            per_page = null;
        } else if (length > 0) {
            paginationEnabled = true;
            page = Math.floor(start / length) + 1;
            per_page = length;
        }
    } else if (flt && flt.page !== undefined && flt.per_page !== undefined) {
        paginationEnabled = true;
    }

    Object.keys(filters).forEach(function (key) {
        if (/^columns\[/.test(key) || /^order\[/.test(key) || /^search\[/.test(key)) {
            delete filters[key];
        }
    });

    var systemKeys = [
        "action", "sheet", "route", "page", "per_page", "sort",
        "session", "draw", "start", "length", "search",
        "search[value]", "search[regex]", "columns", "order",
        "group_by", "with", "with_password", "make_visible", "make_hidden",
        "with_trashed", "only_trashed"
    ];
    for (var s = 0; s < systemKeys.length; s++) {
        delete filters[systemKeys[s]];
    }

    var customFilters = {};
    Object.keys(filters).forEach(function (key) {
        var match = key.match(/^filter\[([^\]]+)\]\[(operator|value)\]$/);
        if (match) {
            if (!customFilters[match[1]]) customFilters[match[1]] = { operator: "=", value: "" };
            customFilters[match[1]][match[2]] = filters[key];
            delete filters[key];
            return;
        }
        var simpleMatch = key.match(/^filter\[([^\]]+)\]$/);
        if (simpleMatch) {
            customFilters[simpleMatch[1]] = { operator: "=", value: filters[key] };
            delete filters[key];
            return;
        }
        customFilters[key] = filters[key];
    });

    var validRelationProps = {};
    var allSingleRels = getAllSingleRelationsForSheet(sheet_name);
    for (var vr = 0; vr < allSingleRels.length; vr++) {
        validRelationProps[allSingleRels[vr].name] = true;
    }

    for (var key in customFilters) {
        var rootCol = key.split(".")[0];
        if (!colMap.hasOwnProperty(rootCol) && !validRelationProps[rootCol]) {
            return { status: false, message: "Column '" + key + "' does not exist in sheet " + sheet_name + "." };
        }
    }

    for (var cs = 0; cs < columnSearches.length; cs++) {
        var csRoot = columnSearches[cs].column.split(".")[0];
        if (!colMap.hasOwnProperty(csRoot) && !validRelationProps[csRoot]) {
            return { status: false, message: "Search column '" + columnSearches[cs].column + "' does not exist." };
        }
    }

    var sortRoot = sortBy.split(".")[0];
    if (!colMap.hasOwnProperty(sortRoot) && !validRelationProps[sortRoot]) {
        return { status: false, message: "Sort column '" + sortBy + "' does not exist." };
    }

    var searchableColumns = [];
    var relationSearchColumns = [];
    var hasExplicitColumnConfig = Array.isArray(normalizedColumns) && normalizedColumns.length > 0;

    if (hasExplicitColumnConfig) {
        for (var sc = 0; sc < normalizedColumns.length; sc++) {
            var sCol = normalizedColumns[sc];
            if (isFalseFlag(sCol.searchable)) continue;
            var sColName = sCol.data || sCol.name;
            if (!sColName) continue;

            if (sColName.indexOf(".") !== -1) {
                relationSearchColumns.push(sColName);
            } else if (colMap.hasOwnProperty(sColName) && !effectiveHiddenMap[sColName]) {
                searchableColumns.push(colMap[sColName]);
            }
        }
    }

    if (!hasExplicitColumnConfig) {
        for (var h = 0; h < headers.length; h++) {
            if (!effectiveHiddenMap[headers[h]]) {
                searchableColumns.push(h);
            }
        }
    }

    var rows = sheetRowsCached(sheet_name);
    if (!rows || rows.length < 2) {
        return {
            status: true,
            draw: draw,
            data: [],
            recordsTotal: 0,
            recordsFiltered: 0,
            meta: { current_page: 1, last_page: 1, per_page: per_page || 0, total: 0 }
        };
    }

    var earlyNeededPaths = {};
    function registerEarlyPath(dotPath) {
        if (!dotPath || dotPath.indexOf(".") === -1) return;
        var parts = dotPath.split(".");
        var acc = "";
        for (var i = 0; i < parts.length - 1; i++) {
            acc = acc ? (acc + "." + parts[i]) : parts[i];
            earlyNeededPaths[acc] = true;
        }
    }

    registerEarlyPath(sortBy);
    if (groupBy) registerEarlyPath(groupBy);

    var useNestedWithGlobalSearch = (
        globalSearch !== "" &&
        relationSearchColumns.length === 0 &&
        withConfig.mode !== "none"
    );

    if (useNestedWithGlobalSearch && withConfig.mode === "selective") {
        for (var wp in withConfig.allowed) {
            if (withConfig.allowed.hasOwnProperty(wp)) {
                earlyNeededPaths[wp] = true;
            }
        }
    }

    if (globalSearch !== "") {
        for (var rsc = 0; rsc < relationSearchColumns.length; rsc++) {
            registerEarlyPath(relationSearchColumns[rsc]);
        }
    }
    for (var csc = 0; csc < columnSearches.length; csc++) {
        registerEarlyPath(columnSearches[csc].column);
    }
    for (var cfk in customFilters) {
        registerEarlyPath(cfk);
    }

    var MAX_DEPTH = 3;

    function buildSingleRelationMap(relDesc, currentDepth, currentPath, allowedPathsMap) {
        if (currentDepth > MAX_DEPTH || !relDesc || !relDesc.targetTable) return null;

        var relRows = sheetRowsCached(relDesc.targetTable);
        if (!relRows || relRows.length < 2) return null;

        var relHeaders = relRows[0];
        var relDeletedIdx = relHeaders.indexOf("deleted_at");

        var matchColName = relDesc.type === "hasOne"
            ? (relDesc.foreignKey || "id")
            : (relDesc.ownerKey || "id");
        var matchColIdx = relHeaders.indexOf(matchColName);
        if (matchColIdx === -1) return null;

        var nestedSingleRels = getAllSingleRelationsForSheet(relDesc.targetTable);
        var nestedConfigs = [];
        for (var nb = 0; nb < nestedSingleRels.length; nb++) {
            var nRel = nestedSingleRels[nb];
            var nextPath = currentPath + "." + nRel.name;
            if (allowedPathsMap && !allowedPathsMap[nextPath]) continue;

            var nestedMap = buildSingleRelationMap(nRel, currentDepth + 1, nextPath, allowedPathsMap);
            if (nestedMap) {
                nestedConfigs.push({
                    propName: nRel.name,
                    sourceKey: nRel.type === "hasOne" ? (nRel.localKey || "id") : nRel.foreignKey,
                    lookupMap: nestedMap
                });
            }
        }

        var candidatesByKey = {};
        for (var r = 1; r < relRows.length; r++) {
            var rRow = relRows[r];
            if (!includeDeleted && relDeletedIdx !== -1 && rRow[relDeletedIdx] !== "") continue;

            var keyVal = rRow[matchColIdx];
            if (keyVal === null || keyVal === undefined || keyVal === "") continue;

            var rObj = {};
            for (var rh = 0; rh < relHeaders.length; rh++) {
                rObj[relHeaders[rh]] = rRow[rh];
            }

            if (!matchesRelationConstraints(rObj, relDesc.constraints)) continue;

            for (var nbc = 0; nbc < nestedConfigs.length; nbc++) {
                var nbCfg = nestedConfigs[nbc];
                var nFkVal = rObj[nbCfg.sourceKey];
                var nFkStr = (nFkVal !== null && nFkVal !== undefined) ? String(nFkVal) : "";
                rObj[nbCfg.propName] = nbCfg.lookupMap[nFkStr] || null;
            }

            applyModelRowFormat(relDesc.targetTable, rObj, false);

            var mapKey = String(keyVal);
            if (!candidatesByKey[mapKey]) candidatesByKey[mapKey] = [];
            candidatesByKey[mapKey].push(rObj);
        }

        var sortCol = relDesc.orderByCol || "id";
        var sortDir = relDesc.orderByDir || "DESC";
        var lookupMap = {};

        Object.keys(candidatesByKey).forEach(function (k) {
            var list = candidatesByKey[k];
            if (list.length > 1) {
                list.sort(function (a, b) {
                    return compareSortValues(a[sortCol], b[sortCol], sortDir);
                });
            }
            lookupMap[k] = list[0] || null;
        });

        return lookupMap;
    }

    function buildCollectionLookupMap(relDesc, currentPath, depth, allowedPathsMap) {
        if (depth > MAX_DEPTH || !relDesc || !relDesc.targetTable) return null;

        var childSheetName = relDesc.targetTable;
        var childRows = sheetRowsCached(childSheetName);
        if (!childRows || childRows.length < 2) return null;

        var childHeaders = childRows[0];
        var deletedIndex = childHeaders.indexOf("deleted_at");
        var childGroupMap = {};

        if (relDesc.type === "belongsToMany") {
            var pivotRows = sheetRowsCached(relDesc.pivotTable);
            if (!pivotRows || pivotRows.length < 2) return null;

            var pivotHeaders = pivotRows[0];
            var fPivotIdx = pivotHeaders.indexOf(relDesc.foreignPivotKey);
            var rPivotIdx = pivotHeaders.indexOf(relDesc.relatedPivotKey);
            var relKeyIdx = childHeaders.indexOf(relDesc.relatedKey || "id");
            if (fPivotIdx === -1 || rPivotIdx === -1 || relKeyIdx === -1) return null;

            var targetById = {};
            for (var cr = 1; cr < childRows.length; cr++) {
                var cRow = childRows[cr];
                if (!includeDeleted && deletedIndex !== -1 && cRow[deletedIndex] !== "") continue;
                var cObj = {};
                for (var ch = 0; ch < childHeaders.length; ch++) {
                    cObj[childHeaders[ch]] = cRow[ch];
                }
                if (!matchesRelationConstraints(cObj, relDesc.constraints)) continue;
                applyModelRowFormat(childSheetName, cObj, false);
                targetById[String(cRow[relKeyIdx])] = cObj;
            }

            for (var pr = 1; pr < pivotRows.length; pr++) {
                var pRow = pivotRows[pr];
                var pParentId = String(pRow[fPivotIdx] || "");
                var pChildId = String(pRow[rPivotIdx] || "");
                if (!pParentId || !targetById[pChildId]) continue;

                var clonedChild = Object.assign({}, targetById[pChildId]);
                if (Array.isArray(relDesc.pivotColumns) && relDesc.pivotColumns.length > 0) {
                    var pivotData = {};
                    for (var pc = 0; pc < relDesc.pivotColumns.length; pc++) {
                        var pColName = relDesc.pivotColumns[pc];
                        var pColIdx = pivotHeaders.indexOf(pColName);
                        if (pColIdx !== -1) pivotData[pColName] = pRow[pColIdx];
                    }
                    clonedChild.pivot = pivotData;
                }
                if (!childGroupMap[pParentId]) childGroupMap[pParentId] = [];
                childGroupMap[pParentId].push(clonedChild);
            }
        } else {
            var fkIndex = childHeaders.indexOf(relDesc.foreignKey);
            if (fkIndex === -1) return null;

            for (var hr = 1; hr < childRows.length; hr++) {
                var hRow = childRows[hr];
                if (!includeDeleted && deletedIndex !== -1 && hRow[deletedIndex] !== "") continue;

                var fkValue = hRow[fkIndex];
                if (fkValue === null || fkValue === undefined || fkValue === "") continue;

                var hObj = {};
                for (var hh = 0; hh < childHeaders.length; hh++) {
                    hObj[childHeaders[hh]] = hRow[hh];
                }
                if (!matchesRelationConstraints(hObj, relDesc.constraints)) continue;
                applyModelRowFormat(childSheetName, hObj, false);

                var fkStr = String(fkValue);
                if (!childGroupMap[fkStr]) childGroupMap[fkStr] = [];
                childGroupMap[fkStr].push(hObj);
            }
        }

        var hasDisplayOrder = childHeaders.indexOf("display_order") !== -1;
        var sortCol = relDesc.orderByCol || (hasDisplayOrder ? "display_order" : "id");
        var sortDirStr = relDesc.orderByCol
            ? (relDesc.orderByDir || "DESC")
            : (hasDisplayOrder ? "ASC" : "DESC");

        Object.keys(childGroupMap).forEach(function (gKey) {
            childGroupMap[gKey].sort(function (a, b) {
                return compareSortValues(a[sortCol], b[sortCol], sortDirStr);
            });
        });

        var childSingleRels = getAllSingleRelationsForSheet(childSheetName);
        for (var csr = 0; csr < childSingleRels.length; csr++) {
            var csRel = childSingleRels[csr];
            var csPath = currentPath + "." + csRel.name;
            if (allowedPathsMap && !allowedPathsMap[csPath]) continue;

            var csMap = buildSingleRelationMap(csRel, depth + 1, csPath, allowedPathsMap);
            if (!csMap) continue;

            var csParentKey = csRel.type === "hasOne" ? (csRel.localKey || "id") : csRel.foreignKey;
            Object.keys(childGroupMap).forEach(function (gKey) {
                childGroupMap[gKey].forEach(function (childItem) {
                    var cFk = childItem[csParentKey];
                    var cFkStr = (cFk !== null && cFk !== undefined) ? String(cFk) : "";
                    childItem[csRel.name] = csMap[cFkStr] || null;
                });
            });
        }

        var nestedCollections = getAllCollectionRelationsForSheet(childSheetName);
        for (var nc = 0; nc < nestedCollections.length; nc++) {
            var nColRel = nestedCollections[nc];
            var nColPath = currentPath + "." + nColRel.name;
            if (allowedPathsMap && !allowedPathsMap[nColPath]) continue;

            var nColMap = buildCollectionLookupMap(nColRel, nColPath, depth + 1, allowedPathsMap);
            if (!nColMap) continue;

            var nParentKey = nColRel.localKey || nColRel.parentKey || "id";
            Object.keys(childGroupMap).forEach(function (gKey) {
                childGroupMap[gKey].forEach(function (childItem) {
                    var cKeyVal = (childItem[nParentKey] !== null && childItem[nParentKey] !== undefined)
                        ? String(childItem[nParentKey])
                        : "";
                    childItem[nColRel.name] = nColMap[cKeyVal] || [];
                });
            });
        }

        return childGroupMap;
    }

    function isNestedValueMatch(val, query, depth) {
        if (val === null || val === undefined || depth > MAX_DEPTH + 1) return false;
        if (typeof val !== "object" || val instanceof Date) {
            return isSearchMatch(val, query);
        }
        if (Array.isArray(val)) {
            for (var i = 0; i < val.length; i++) {
                if (isNestedValueMatch(val[i], query, depth + 1)) return true;
            }
            return false;
        }
        var keys = Object.keys(val);
        for (var k = 0; k < keys.length; k++) {
            if (isNestedValueMatch(val[keys[k]], query, depth + 1)) return true;
        }
        return false;
    }

    var useAutoEarlyRelations = useNestedWithGlobalSearch && withConfig.mode === "auto";
    var earlyAllowedMap = useAutoEarlyRelations ? null : earlyNeededPaths;

    var earlySingleConfigs = [];
    for (var es = 0; es < allSingleRels.length; es++) {
        var sRel = allSingleRels[es];
        if (useAutoEarlyRelations || earlyNeededPaths[sRel.name]) {
            var sMap = buildSingleRelationMap(sRel, 1, sRel.name, earlyAllowedMap);
            if (sMap) {
                var sourceCol = sRel.type === "hasOne" ? (sRel.localKey || "id") : sRel.foreignKey;
                earlySingleConfigs.push({
                    colIndex: colMap.hasOwnProperty(sourceCol) ? colMap[sourceCol] : -1,
                    propName: sRel.name,
                    lookupMap: sMap
                });
            }
        }
    }

    var earlyCollectionConfigs = [];
    if (useNestedWithGlobalSearch) {
        var allColRels = getAllCollectionRelationsForSheet(sheet_name);
        for (var ec = 0; ec < allColRels.length; ec++) {
            var cRelDesc = allColRels[ec];
            if (useAutoEarlyRelations || earlyNeededPaths[cRelDesc.name]) {
                var cGroupMap = buildCollectionLookupMap(cRelDesc, cRelDesc.name, 1, earlyAllowedMap);
                if (cGroupMap) {
                    var parentKeyCol = cRelDesc.localKey || cRelDesc.parentKey || "id";
                    earlyCollectionConfigs.push({
                        propName: cRelDesc.name,
                        colIndex: colMap.hasOwnProperty(parentKeyCol) ? colMap[parentKeyCol] : -1,
                        groupedByParentId: cGroupMap
                    });
                }
            }
        }
    }

    var rowIndex = getRowIndex(sheet_name);
    var recordsTotal = onlyTrashed
        ? rowIndex.totalTrashed
        : (withTrashed ? (rowIndex.totalActive + rowIndex.totalTrashed) : rowIndex.totalActive);

    var candidateArrayIndices = null;

    if (!includeDeleted) {
        if (customFilters.id) {
            var idOp = typeof customFilters.id === "object" ? String(customFilters.id.operator || "=") : "=";
            var idVal = typeof customFilters.id === "object" ? customFilters.id.value : customFilters.id;
            if (idOp === "=" && idVal !== null && idVal !== undefined) {
                var targetRowNum = rowIndex.byId[String(idVal)];
                candidateArrayIndices = targetRowNum ? [targetRowNum - 1] : [];
            }
        }

        if (candidateArrayIndices === null) {
            for (var fkKey in customFilters) {
                if (rowIndex.byFk.hasOwnProperty(fkKey)) {
                    var fkCond = customFilters[fkKey];
                    var fkOp = typeof fkCond === "object" ? String(fkCond.operator || "=") : "=";
                    var fkTargetVal = typeof fkCond === "object" ? fkCond.value : fkCond;

                    if (fkOp === "=" && fkTargetVal !== null && fkTargetVal !== undefined) {
                        var matchedSheetRows = rowIndex.byFk[fkKey][String(fkTargetVal)] || [];
                        candidateArrayIndices = [];
                        for (var mr = 0; mr < matchedSheetRows.length; mr++) {
                            candidateArrayIndices.push(matchedSheetRows[mr] - 1);
                        }
                        break;
                    }
                }
            }
        }
    }

    var data = [];
    var deletedAtIndex = colMap.hasOwnProperty("deleted_at") ? colMap["deleted_at"] : -1;
    var scanLength = candidateArrayIndices !== null ? candidateArrayIndices.length : (rows.length - 1);

    for (var idx = 0; idx < scanLength; idx++) {
        var rowIdx = candidateArrayIndices !== null ? candidateArrayIndices[idx] : (idx + 1);
        var row = rows[rowIdx];
        if (!row) continue;

        var isDeleted = deletedAtIndex !== -1 &&
            row[deletedAtIndex] !== "" &&
            row[deletedAtIndex] !== null &&
            row[deletedAtIndex] !== undefined;

        if (onlyTrashed) {
            if (!isDeleted) continue;
        } else if (!withTrashed && isDeleted) {
            continue;
        }

        var isMatch = true;

        if (globalSearch !== "") {
            var globalMatch = false;
            for (var gs = 0; gs < searchableColumns.length; gs++) {
                if (isSearchMatch(row[searchableColumns[gs]], globalSearch)) {
                    globalMatch = true;
                    break;
                }
            }
            if (!globalMatch) {
                if (relationSearchColumns.length > 0) {
                    for (var rs = 0; rs < relationSearchColumns.length; rs++) {
                        var relVal = getRelationValueFromConfig(earlySingleConfigs, row, relationSearchColumns[rs]);
                        if (isNestedValueMatch(relVal, globalSearch, 0)) {
                            globalMatch = true;
                            break;
                        }
                    }
                } else {
                    for (var ebs = 0; ebs < earlySingleConfigs.length; ebs++) {
                        var ebCfgSearch = earlySingleConfigs[ebs];
                        if (ebCfgSearch.colIndex === -1) continue;
                        var ebFkSearch = row[ebCfgSearch.colIndex];
                        var ebStrSearch = (ebFkSearch !== null && ebFkSearch !== undefined) ? String(ebFkSearch) : "";
                        var relObjSearch = ebCfgSearch.lookupMap[ebStrSearch];
                        if (relObjSearch && isNestedValueMatch(relObjSearch, globalSearch, 0)) {
                            globalMatch = true;
                            break;
                        }
                    }

                    if (!globalMatch && earlyCollectionConfigs.length > 0) {
                        for (var ehs = 0; ehs < earlyCollectionConfigs.length; ehs++) {
                            var ecCfg = earlyCollectionConfigs[ehs];
                            if (ecCfg.colIndex === -1) continue;
                            var parentKeyVal = row[ecCfg.colIndex];
                            if (parentKeyVal !== null && parentKeyVal !== undefined && parentKeyVal !== "") {
                                var childList = ecCfg.groupedByParentId[String(parentKeyVal)];
                                if (childList && isNestedValueMatch(childList, globalSearch, 0)) {
                                    globalMatch = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            if (!globalMatch) isMatch = false;
        }

        if (isMatch && columnSearches.length > 0) {
            for (var csIdx = 0; csIdx < columnSearches.length; csIdx++) {
                var sCfg = columnSearches[csIdx];
                var sVal = sCfg.column.indexOf(".") !== -1
                    ? getRelationValueFromConfig(earlySingleConfigs, row, sCfg.column)
                    : (colMap.hasOwnProperty(sCfg.column) ? row[colMap[sCfg.column]] : null);

                if (!isSearchMatch(sVal, sCfg.value)) {
                    isMatch = false;
                    break;
                }
            }
        }

        if (isMatch && Object.keys(customFilters).length > 0) {
            for (var fltKey in customFilters) {
                var cellValue = fltKey.indexOf(".") !== -1
                    ? getRelationValueFromConfig(earlySingleConfigs, row, fltKey)
                    : (colMap.hasOwnProperty(fltKey) ? row[colMap[fltKey]] : undefined);

                if (cellValue === undefined) {
                    isMatch = false;
                    break;
                }

                var fltCondition = customFilters[fltKey];
                var operator = "=";
                var fltValue = fltCondition;

                if (typeof fltCondition === "object" && fltCondition !== null) {
                    operator = String(fltCondition.operator || "=").toUpperCase();
                    fltValue = fltCondition.value;
                }

                if (cellValue === null || fltValue === null || fltValue === undefined) {
                    isMatch = false;
                    break;
                }

                var cellNum = parseFloat(cellValue);
                var fltNum = parseFloat(fltValue);
                var isNum = !isNaN(cellNum) && !isNaN(fltNum) &&
                    String(cellValue).trim() !== "" && String(fltValue).trim() !== "";

                switch (operator) {
                    case "=":
                        if (String(cellValue) !== String(fltValue)) isMatch = false;
                        break;
                    case "!=":
                        if (String(cellValue) === String(fltValue)) isMatch = false;
                        break;
                    case ">":
                        if (isNum ? cellNum <= fltNum : cellValue <= fltValue) isMatch = false;
                        break;
                    case ">=":
                        if (isNum ? cellNum < fltNum : cellValue < fltValue) isMatch = false;
                        break;
                    case "<":
                        if (isNum ? cellNum >= fltNum : cellValue >= fltValue) isMatch = false;
                        break;
                    case "<=":
                        if (isNum ? cellNum > fltNum : cellValue > fltValue) isMatch = false;
                        break;
                    case "LIKE":
                        if (String(cellValue).toLowerCase().indexOf(String(fltValue).toLowerCase()) === -1) isMatch = false;
                        break;
                    default:
                        isMatch = false;
                }
                if (!isMatch) break;
            }
        }

        if (!isMatch) continue;

        var obj = {};
        for (var j = 0; j < headers.length; j++) {
            obj[headers[j]] = row[j];
        }

        for (var ebc = 0; ebc < earlySingleConfigs.length; ebc++) {
            var ebCfg = earlySingleConfigs[ebc];
            if (ebCfg.colIndex === -1) continue;
            var ebFkVal = row[ebCfg.colIndex];
            var ebFkStr = (ebFkVal !== null && ebFkVal !== undefined) ? String(ebFkVal) : "";
            obj[ebCfg.propName] = ebCfg.lookupMap[ebFkStr] || null;
        }

        data.push(obj);
    }

    if (data.length > 1) {
        data.sort(function (a, b) {
            return compareSortValues(resolveDotPath(a, sortBy), resolveDotPath(b, sortBy), sortDir);
        });
    }

    if (groupBy && data.length > 0) {
        var groupedMap = {};
        var groupedData = [];
        var keys = groupBy.split(".");

        for (var g = 0; g < data.length; g++) {
            var item = data[g];
            var groupVal = resolveDotPath(item, groupBy);
            var groupKeyStr = (groupVal !== null && groupVal !== undefined) ? String(groupVal).trim() : "Unknown";

            if (!groupedMap[groupKeyStr]) {
                var newGroup = { group_key: groupKeyStr, items: [] };
                if (keys.length > 1) {
                    var relationName = keys[0];
                    newGroup[relationName] = item[relationName] || {};
                }
                groupedMap[groupKeyStr] = newGroup;
                groupedData.push(newGroup);
            }

            if (keys.length > 1) {
                var cleanItem = Object.assign({}, item);
                delete cleanItem[keys[0]];
                groupedMap[groupKeyStr].items.push(cleanItem);
            } else {
                groupedMap[groupKeyStr].items.push(item);
            }
        }

        for (var gd = 0; gd < groupedData.length; gd++) {
            groupedData[gd].items.sort(function (a, b) {
                return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
            });
        }
        data = groupedData;
    }

    var total = data.length;
    var currentPage = paginationEnabled ? parseInt(page, 10) : 1;
    var itemsPerPage = paginationEnabled ? parseInt(per_page, 10) : total;
    var lastPage = 1;

    if (paginationEnabled) {
        if (isNaN(currentPage) || currentPage < 1 || isNaN(itemsPerPage) || itemsPerPage < 1) {
            return { status: false, message: "Invalid pagination parameters." };
        }

        lastPage = Math.ceil(total / itemsPerPage);
        if (currentPage > lastPage && total > 0) {
            return {
                status: false,
                message: "Page not found or out of bounds.",
                meta: { current_page: currentPage, last_page: lastPage, per_page: itemsPerPage, total: total }
            };
        }

        var startIndex = (currentPage - 1) * itemsPerPage;
        data = data.slice(startIndex, startIndex + itemsPerPage);
    }

    if (data.length > 0) {
        var targetRecords = [];
        if (groupBy) {
            for (var gr = 0; gr < data.length; gr++) {
                if (data[gr].items) {
                    for (var gi = 0; gi < data[gr].items.length; gi++) {
                        targetRecords.push(data[gr].items[gi]);
                    }
                }
            }
        } else {
            targetRecords = data;
        }

        var allowedPaths = withConfig.mode === "selective" ? withConfig.allowed : null;

        if (earlySingleConfigs.length > 0) {
            for (var trClean = 0; trClean < targetRecords.length; trClean++) {
                var recClean = targetRecords[trClean];
                for (var eClean = 0; eClean < earlySingleConfigs.length; eClean++) {
                    var pName = earlySingleConfigs[eClean].propName;
                    if (withConfig.mode === "none" || (allowedPaths && !allowedPaths[pName])) {
                        delete recClean[pName];
                    }
                }
            }
        }

        if (withConfig.mode !== "none") {
            for (var lb = 0; lb < allSingleRels.length; lb++) {
                var lateRel = allSingleRels[lb];
                if (allowedPaths && !allowedPaths[lateRel.name]) continue;

                var lateMap = buildSingleRelationMap(lateRel, 1, lateRel.name, allowedPaths);
                if (!lateMap) continue;

                var parentKeyCol = lateRel.type === "hasOne"
                    ? (lateRel.localKey || "id")
                    : lateRel.foreignKey;

                for (var tr = 0; tr < targetRecords.length; tr++) {
                    var rec = targetRecords[tr];
                    var fkRaw = rec[parentKeyCol];
                    var fkStr = (fkRaw !== null && fkRaw !== undefined) ? String(fkRaw) : "";
                    rec[lateRel.name] = lateMap[fkStr] || null;
                }
            }

            var collectionRels = getAllCollectionRelationsForSheet(sheet_name);
            for (var crIdx = 0; crIdx < collectionRels.length; crIdx++) {
                var childRel = collectionRels[crIdx];
                if (allowedPaths && !allowedPaths[childRel.name]) continue;

                var colLookup = buildCollectionLookupMap(childRel, childRel.name, 1, allowedPaths);
                if (!colLookup) continue;

                var parentLocalKey = childRel.localKey || childRel.parentKey || "id";
                for (var p = 0; p < targetRecords.length; p++) {
                    var parent = targetRecords[p];
                    var pKey = (parent[parentLocalKey] !== null && parent[parentLocalKey] !== undefined)
                        ? String(parent[parentLocalKey])
                        : "";
                    parent[childRel.name] = colLookup[pKey] || [];
                }
            }
        }

        for (var fmt = 0; fmt < targetRecords.length; fmt++) {
            applyModelRowFormat(sheet_name, targetRecords[fmt], rowFormatOpts);
        }
    }

    return {
        status: true,
        draw: draw,
        data: data,
        recordsTotal: recordsTotal,
        recordsFiltered: total,
        meta: {
            current_page: currentPage,
            last_page: lastPage,
            per_page: itemsPerPage,
            total: total
        }
    };
}

function update(sheet_name, payload) {
    ensureModelResolved(sheet_name);

    if (!payload || payload.data === undefined) {
        return { status: false, message: "Invalid payload format." };
    }

    return _withScriptLock(function () {
        var getSheet = sheet().getSheetByName(sheet_name);
        if (!getSheet) return { status: false, message: "Sheet does not exist." };

        var rows = sheetRowsCached(sheet_name);
        if (!rows || rows.length < 2) return { status: false, message: "Data does not exist." };

        var schema = getSchemaMetadata();
        var sheetMeta = schema.sheets[sheet_name] || getSchemaMetadata(true).sheets[sheet_name];
        var headers = sheetMeta.headers;
        var colMap = sheetMeta.colMap;
        var data = prepareModelInputData(sheet_name, payload.data);

        if (!colMap.hasOwnProperty("id")) {
            return { status: false, message: "Column 'id' not found." };
        }

        for (var b = 0; b < sheetMeta.belongsTo.length; b++) {
            var rel = sheetMeta.belongsTo[b];
            if (data.hasOwnProperty(rel.colName)) {
                var fkValue = data[rel.colName];
                if (fkValue === undefined || fkValue === null || fkValue === "") {
                    return { status: false, message: "Column '" + rel.colName + "' cannot be empty." };
                }

                var targetIndex = getRowIndex(rel.targetSheet);
                if (!targetIndex.byId.hasOwnProperty(String(fkValue))) {
                    return {
                        status: false,
                        message: "Record with " + rel.colName + " = " + fkValue + " not found in " + rel.targetSheet + "."
                    };
                }
            }
        }

        var idStr = String(data.id);
        var rowIndex = getRowIndex(sheet_name);
        var targetSheetRow = rowIndex.byId[idStr];

        if (!targetSheetRow) {
            if (rowIndex.trashedById[idStr]) {
                return { status: false, message: "Data not available or deleted." };
            }
            return { status: false, message: "Data not available." };
        }

        var idColIdx = colMap["id"];
        if (!rows[targetSheetRow - 1] || String(rows[targetSheetRow - 1][idColIdx]) !== idStr) {
            rowIndex = getRowIndex(sheet_name, true);
            targetSheetRow = rowIndex.byId[idStr];
            if (!targetSheetRow) {
                return { status: false, message: "Data not available or deleted." };
            }
        }

        var updatedRow = rows[targetSheetRow - 1].slice();

        for (var key in data) {
            if (key === "id" || key === "deleted_at") continue;
            if (colMap.hasOwnProperty(key)) {
                var cIdx = colMap[key];
                var val = data[key];
                if (/^(0\d+|\+\d+)/.test(String(val))) {
                    getSheet.getRange(targetSheetRow, cIdx + 1).setNumberFormat("@");
                    updatedRow[cIdx] = String(val);
                } else {
                    updatedRow[cIdx] = val;
                }
            }
        }

        if (colMap.hasOwnProperty("updated_at")) {
            updatedRow[colMap["updated_at"]] = new Date();
        }

        getSheet.getRange(targetSheetRow, 1, 1, headers.length).setValues([updatedRow]);

        invalidateSheetCache(sheet_name, false);
        return { status: true, message: "Data successfully updated." };
    });
}

function destroy(sheet_name, id) {
    ensureModelResolved(sheet_name);

    return _withScriptLock(function () {
        var getSheet = sheet().getSheetByName(sheet_name);
        if (!getSheet) return { status: false, message: "Sheet does not exist." };

        var rows = sheetRowsCached(sheet_name);
        if (!rows || rows.length < 2) return { status: false, message: "Data does not exist." };

        var schema = getSchemaMetadata();
        var sheetMeta = schema.sheets[sheet_name] || getSchemaMetadata(true).sheets[sheet_name];
        var colMap = sheetMeta.colMap;

        if (!colMap.hasOwnProperty("id")) {
            return { status: false, message: "Column 'id' not found." };
        }

        var idStr = String(id);
        var rowIndex = getRowIndex(sheet_name);
        var targetSheetRow = rowIndex.byId[idStr];

        if (!targetSheetRow) {
            if (rowIndex.trashedById[idStr]) {
                return { status: false, message: "Data not available or deleted." };
            }
            return { status: false, message: "Data not available." };
        }

        var idColIdx = colMap["id"];
        if (!rows[targetSheetRow - 1] || String(rows[targetSheetRow - 1][idColIdx]) !== idStr) {
            rowIndex = getRowIndex(sheet_name, true);
            targetSheetRow = rowIndex.byId[idStr];
            if (!targetSheetRow) {
                return { status: false, message: "Data not available or deleted." };
            }
        }

        if (colMap.hasOwnProperty("deleted_at")) {
            getSheet.getRange(targetSheetRow, colMap["deleted_at"] + 1).setValue(new Date());
            invalidateSheetCache(sheet_name, false);
            return { status: true, message: "Data successfully deleted." };
        } else {
            getSheet.deleteRow(targetSheetRow);
            invalidateSheetCache(sheet_name, false);
            return { status: true, message: "Data permanently deleted." };
        }
    });
}

function restore(sheet_name, id) {
    ensureModelResolved(sheet_name);

    return _withScriptLock(function () {
        var getSheet = sheet().getSheetByName(sheet_name);
        if (!getSheet) return { status: false, message: "Sheet does not exist." };

        var rows = sheetRowsCached(sheet_name);
        if (!rows || rows.length < 2) return { status: false, message: "Data does not exist." };

        var schema = getSchemaMetadata();
        var sheetMeta = schema.sheets[sheet_name] || getSchemaMetadata(true).sheets[sheet_name];
        var colMap = sheetMeta.colMap;

        if (!colMap.hasOwnProperty("id")) {
            return { status: false, message: "Column 'id' not found." };
        }
        if (!colMap.hasOwnProperty("deleted_at")) {
            return { status: false, message: "Soft deletes are not enabled on this sheet." };
        }

        var idStr = String(id);
        var rowIndex = getRowIndex(sheet_name);
        var targetSheetRow = rowIndex.trashedById[idStr];

        if (!targetSheetRow) {
            if (rowIndex.byId[idStr]) {
                return { status: false, message: "Data is not deleted." };
            }
            return { status: false, message: "Data does not exist." };
        }

        var idColIdx = colMap["id"];
        if (!rows[targetSheetRow - 1] || String(rows[targetSheetRow - 1][idColIdx]) !== idStr) {
            rowIndex = getRowIndex(sheet_name, true);
            targetSheetRow = rowIndex.trashedById[idStr];
            if (!targetSheetRow) {
                return { status: false, message: "Data does not exist." };
            }
        }

        getSheet.getRange(targetSheetRow, colMap["deleted_at"] + 1).setValue("");
        if (colMap.hasOwnProperty("updated_at")) {
            getSheet.getRange(targetSheetRow, colMap["updated_at"] + 1).setValue(new Date());
        }

        invalidateSheetCache(sheet_name, false);
        return { status: true, message: "Data successfully restored." };
    });
}

function forceDelete(sheet_name, id) {
    ensureModelResolved(sheet_name);

    return _withScriptLock(function () {
        var getSheet = sheet().getSheetByName(sheet_name);
        if (!getSheet) return { status: false, message: "Sheet does not exist." };

        var rows = sheetRowsCached(sheet_name);
        if (!rows || rows.length < 2) return { status: false, message: "Data does not exist." };

        var schema = getSchemaMetadata();
        var sheetMeta = schema.sheets[sheet_name] || getSchemaMetadata(true).sheets[sheet_name];
        var colMap = sheetMeta.colMap;

        if (!colMap.hasOwnProperty("id")) {
            return { status: false, message: "Column 'id' not found." };
        }

        var idStr = String(id);
        var rowIndex = getRowIndex(sheet_name);
        var targetSheetRow = rowIndex.byId[idStr] || rowIndex.trashedById[idStr];

        if (!targetSheetRow) {
            return { status: false, message: "Data does not exist." };
        }

        var idColIdx = colMap["id"];
        if (!rows[targetSheetRow - 1] || String(rows[targetSheetRow - 1][idColIdx]) !== idStr) {
            rowIndex = getRowIndex(sheet_name, true);
            targetSheetRow = rowIndex.byId[idStr] || rowIndex.trashedById[idStr];
            if (!targetSheetRow) {
                return { status: false, message: "Data does not exist." };
            }
        }

        getSheet.deleteRow(targetSheetRow);
        invalidateSheetCache(sheet_name, false);
        return { status: true, message: "Data permanently deleted." };
    });
}
