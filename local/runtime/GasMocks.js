const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORAGE_DIR = path.join(__dirname, "../storage");
const SRC_DIR = path.join(__dirname, "../../src");
const DB_FILE = path.join(STORAGE_DIR, "db.json");
const PROPS_FILE = path.join(STORAGE_DIR, "properties.json");

function ensureStorage() {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ sheets: {} }, null, 2));
    }
    if (!fs.existsSync(PROPS_FILE)) {
        fs.writeFileSync(PROPS_FILE, JSON.stringify({
            SHEET_ID: "local-dev-sheet-id",
            BASE_URL: "http://localhost:3000"
        }, null, 2));
    }
}

function readDb() {
    ensureStorage();
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(data) {
    ensureStorage();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function toSignedBytes(buf) {
    return Array.from(buf, (b) => (b << 24) >> 24);
}

function fromSignedBytes(arr) {
    return Buffer.from(arr.map((b) => b & 0xff));
}

class RangeMock {
    constructor(sheetMock, row, col, numRows = 1, numCols = 1) {
        this.sheet = sheetMock;
        this.row = row;
        this.col = col;
        this.numRows = numRows;
        this.numCols = numCols;
    }

    getValues() {
        const rows = this.sheet._rows();
        const out = [];
        for (let r = 0; r < this.numRows; r++) {
            const srcRow = rows[this.row - 1 + r] || [];
            const rowOut = [];
            for (let c = 0; c < this.numCols; c++) {
                rowOut.push(srcRow[this.col - 1 + c] !== undefined ? srcRow[this.col - 1 + c] : "");
            }
            out.push(rowOut);
        }
        return out;
    }

    setValues(values) {
        const rows = this.sheet._rows();
        for (let r = 0; r < values.length; r++) {
            if (!rows[this.row - 1 + r]) rows[this.row - 1 + r] = [];
            for (let c = 0; c < values[r].length; c++) {
                rows[this.row - 1 + r][this.col - 1 + c] = values[r][c];
            }
        }
        this.sheet._save(rows);
        return this;
    }

    setValue(val) {
        const rows = this.sheet._rows();
        if (!rows[this.row - 1]) rows[this.row - 1] = [];
        rows[this.row - 1][this.col - 1] = val;
        this.sheet._save(rows);
        return this;
    }

    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
    setVerticalAlignment() { return this; }
    setNumberFormat() { return this; }
}

class SheetMock {
    constructor(name) {
        this.name = name;
    }

    _rows() {
        const db = readDb();
        return db.sheets[this.name] || [];
    }

    _save(rows) {
        const db = readDb();
        db.sheets[this.name] = rows;
        writeDb(db);
    }

    getName() { return this.name; }
    getLastRow() { return this._rows().length; }
    getLastColumn() {
        const rows = this._rows();
        return rows.length > 0 ? rows[0].length : 0;
    }
    getMaxColumns() {
        return Math.max(this.getLastColumn(), 26);
    }

    getRange(row, col, numRows = 1, numCols = 1) {
        return new RangeMock(this, row, col, numRows, numCols);
    }

    appendRow(rowArray) {
        const rows = this._rows();
        rows.push(rowArray);
        this._save(rows);
    }

    deleteRow(rowIndex) {
        const rows = this._rows();
        rows.splice(rowIndex - 1, 1);
        this._save(rows);
    }

    insertColumnAfter(afterCol1Based) {
        const rows = this._rows();
        for (let r = 0; r < rows.length; r++) {
            rows[r].splice(afterCol1Based, 0, "");
        }
        this._save(rows);
    }

    deleteColumn(col1Based) {
        const rows = this._rows();
        for (let r = 0; r < rows.length; r++) {
            rows[r].splice(col1Based - 1, 1);
        }
        this._save(rows);
    }

    deleteColumns() { }
    setFrozenRows() { }

    setName(newName) {
        const db = readDb();
        db.sheets[newName] = db.sheets[this.name] || [];
        delete db.sheets[this.name];
        writeDb(db);
        this.name = newName;
    }
}

const memoryCache = new Map();

function installGasGlobals() {
    ensureStorage();

    const spreadsheetMock = {
        getId: () => "local-dev-sheet-id",
        getUrl: () => "http://localhost:3000/local-db",
        getSheetByName: (name) => {
            const db = readDb();
            return Object.prototype.hasOwnProperty.call(db.sheets, name) ? new SheetMock(name) : null;
        },
        insertSheet: (name) => {
            const db = readDb();
            if (!Object.prototype.hasOwnProperty.call(db.sheets, name)) {
                db.sheets[name] = [];
                writeDb(db);
            }
            return new SheetMock(name);
        },
        deleteSheet: (sheetObj) => {
            const db = readDb();
            delete db.sheets[sheetObj.getName()];
            writeDb(db);
        },
        getSheets: () => Object.keys(readDb().sheets).map((n) => new SheetMock(n))
    };

    global.SpreadsheetApp = {
        openById: () => spreadsheetMock,
        getActiveSpreadsheet: () => spreadsheetMock,
        create: () => spreadsheetMock
    };

    global.PropertiesService = {
        getScriptProperties: () => ({
            getProperty: (k) => {
                const props = JSON.parse(fs.readFileSync(PROPS_FILE, "utf8"));
                return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null;
            },
            setProperty: (k, v) => {
                const props = JSON.parse(fs.readFileSync(PROPS_FILE, "utf8"));
                const nextVal = String(v);
                if (props[k] === nextVal) return;
                props[k] = nextVal;
                fs.writeFileSync(PROPS_FILE, JSON.stringify(props, null, 2));
            },
            setProperties: (newProps, deleteAllOthers = false) => {
                const current = JSON.parse(fs.readFileSync(PROPS_FILE, "utf8"));
                const next = deleteAllOthers ? {} : { ...current };
                let changed = deleteAllOthers && Object.keys(current).length > 0;

                if (newProps && typeof newProps === "object") {
                    for (const [k, v] of Object.entries(newProps)) {
                        if (v !== undefined && v !== null) {
                            const nextVal = String(v);
                            if (next[k] !== nextVal) {
                                next[k] = nextVal;
                                changed = true;
                            }
                        }
                    }
                }

                if (changed) {
                    fs.writeFileSync(PROPS_FILE, JSON.stringify(next, null, 2));
                }
            },
            deleteProperty: (k) => {
                const props = JSON.parse(fs.readFileSync(PROPS_FILE, "utf8"));
                delete props[k];
                fs.writeFileSync(PROPS_FILE, JSON.stringify(props, null, 2));
            },
            deleteAllProperties: () => {
                fs.writeFileSync(PROPS_FILE, JSON.stringify({}, null, 2));
            },
            getProperties: () => JSON.parse(fs.readFileSync(PROPS_FILE, "utf8"))
        })
    };

    global.CacheService = {
        getScriptCache: () => ({
            get: (k) => (memoryCache.has(k) ? memoryCache.get(k) : null),
            getAll: (keys) => {
                const res = {};
                keys.forEach((k) => { if (memoryCache.has(k)) res[k] = memoryCache.get(k); });
                return res;
            },
            put: (k, v) => { memoryCache.set(k, String(v)); },
            putAll: (obj) => { Object.keys(obj).forEach((k) => memoryCache.set(k, String(obj[k]))); },
            remove: (k) => { memoryCache.delete(k); },
            removeAll: (keys) => { keys.forEach((k) => memoryCache.delete(k)); }
        })
    };

    global.ContentService = {
        MimeType: { JSON: "application/json", TEXT: "text/plain" },
        createTextOutput: (content) => ({
            _content: String(content),
            _mimeType: "text/plain",
            setMimeType(type) { this._mimeType = type; return this; },
            getMimeType() { return this._mimeType; },
            getContent() { return this._content; }
        })
    };

    global.HtmlService = {
        XFrameOptionsMode: { ALLOWALL: "ALLOWALL", DEFAULT: "DEFAULT" },
        createHtmlOutput: (html = "") => ({
            _content: String(html),
            _title: "",
            _statusCode: 200,
            setTitle(t) { this._title = String(t); return this; },
            getTitle() { return this._title; },
            setXFrameOptionsMode() { return this; },
            getMimeType() { return "HTML"; },
            getContent() { return this._content; }
        })
    };

    global.__readLocalViewFile = (normalizedViewName) => {
        const relPath = String(normalizedViewName || "").replace(/\./g, "/");
        const fullPath = path.join(SRC_DIR, "resources", "views", relPath + ".gas.js");
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            return fs.readFileSync(fullPath, "utf8");
        }
        return null;
    };

    global.Session = {
        getScriptTimeZone: () => "Asia/Jakarta"
    };

    global.Logger = {
        log: (...args) => console.log("[GAS]", ...args)
    };

    global.Utilities = {
        DigestAlgorithm: { SHA_256: "sha256", SHA_512: "sha512", MD5: "md5" },
        getUuid: () => crypto.randomUUID(),
        newBlob: (str) => ({
            getBytes: () => toSignedBytes(Buffer.from(String(str), "utf8"))
        }),
        computeDigest: (algo, value) => {
            const buf = Array.isArray(value) ? fromSignedBytes(value) : Buffer.from(String(value), "utf8");
            return toSignedBytes(crypto.createHash(algo).update(buf).digest());
        },
        computeHmacSha256Signature: (inputBytes, keyBytes) => {
            const dataBuf = Array.isArray(inputBytes) ? fromSignedBytes(inputBytes) : Buffer.from(String(inputBytes), "utf8");
            const keyBuf = Array.isArray(keyBytes) ? fromSignedBytes(keyBytes) : Buffer.from(String(keyBytes), "utf8");
            return toSignedBytes(crypto.createHmac("sha256", keyBuf).update(dataBuf).digest());
        },
        base64Encode: (data) => {
            const buf = Array.isArray(data) ? fromSignedBytes(data) : Buffer.from(String(data), "utf8");
            return buf.toString("base64");
        },
        base64Decode: (b64) => toSignedBytes(Buffer.from(String(b64), "base64")),
        formatDate: (dateObj, tz, format) => {
            const d = new Date(dateObj);
            const pad = (n) => String(n).padStart(2, "0");
            return format
                .replace("yyyy", d.getFullYear())
                .replace("MM", pad(d.getMonth() + 1))
                .replace("dd", pad(d.getDate()))
                .replace("HH", pad(d.getHours()))
                .replace("mm", pad(d.getMinutes()))
                .replace("ss", pad(d.getSeconds()));
        }
    };
}

module.exports = { installGasGlobals, DB_FILE, memoryCache };
