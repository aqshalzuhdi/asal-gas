var Sanitizer = {
    RESTRICTED_KEYS: {
        "with_password": true,
        "withpassword": true,
        "filter[with_password]": true,
        "with": true
    },

    cleanClientPayload: function (rawPayload) {
        if (!rawPayload || typeof rawPayload !== "object") {
            return {};
        }

        var self = this;

        function deepClean(node) {
            if (Array.isArray(node)) {
                return node.map(deepClean);
            }

            if (node && typeof node === "object") {
                var cleanObj = {};
                Object.keys(node).forEach(function (key) {
                    var lowerKey = String(key).toLowerCase().trim();
                    if (self.RESTRICTED_KEYS[lowerKey] || /^with\[/.test(lowerKey)) {
                        return;
                    }
                    cleanObj[key] = deepClean(node[key]);
                });
                return cleanObj;
            }

            return node;
        }

        return deepClean(rawPayload);
    }
};

var Validator = {
    make: function (data, rules) {
        var input = (data && typeof data === "object") ? data : {};
        var ruleSet = (rules && typeof rules === "object") ? rules : {};
        var errors = {};

        function addError(field, message) {
            if (!errors[field]) {
                errors[field] = [];
            }
            errors[field].push(message);
        }

        Object.keys(ruleSet).forEach(function (field) {
            var rawRules = ruleSet[field];
            var ruleList = Array.isArray(rawRules)
                ? rawRules
                : String(rawRules).split("|").map(function (r) { return r.trim(); }).filter(Boolean);

            var val = input[field];
            var isEmpty = val === undefined || val === null || String(val).trim() === "" ||
                (Array.isArray(val) && val.length === 0);

            if (ruleList.indexOf("nullable") !== -1 && isEmpty) {
                return;
            }

            for (var i = 0; i < ruleList.length; i++) {
                var ruleToken = ruleList[i];
                if (ruleToken === "nullable") continue;

                var colonIdx = ruleToken.indexOf(":");
                var ruleName = colonIdx !== -1 ? ruleToken.substring(0, colonIdx) : ruleToken;
                var ruleParam = colonIdx !== -1 ? ruleToken.substring(colonIdx + 1) : "";

                if (ruleName === "required") {
                    if (isEmpty) {
                        addError(field, "The " + field + " field is required.");
                    }
                } else if (!isEmpty) {
                    if (ruleName === "string") {
                        if (typeof val !== "string") {
                            addError(field, "The " + field + " must be a string.");
                        }
                    } else if (ruleName === "numeric") {
                        if (isNaN(Number(val)) || String(val).trim() === "") {
                            addError(field, "The " + field + " must be a number.");
                        }
                    } else if (ruleName === "integer") {
                        if (!/^-?\d+$/.test(String(val).trim())) {
                            addError(field, "The " + field + " must be an integer.");
                        }
                    } else if (ruleName === "boolean") {
                        var validBooleans = [true, false, 1, 0, "1", "0", "true", "false"];
                        if (validBooleans.indexOf(val) === -1) {
                            addError(field, "The " + field + " field must be true or false.");
                        }
                    } else if (ruleName === "email") {
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim())) {
                            addError(field, "The " + field + " must be a valid email address.");
                        }
                    } else if (ruleName === "min") {
                        var minVal = Number(ruleParam);
                        if (typeof val === "number" || (!isNaN(Number(val)) && ruleList.indexOf("numeric") !== -1)) {
                            if (Number(val) < minVal) {
                                addError(field, "The " + field + " must be at least " + minVal + ".");
                            }
                        } else if (String(val).length < minVal) {
                            addError(field, "The " + field + " must be at least " + minVal + " characters.");
                        }
                    } else if (ruleName === "max") {
                        var maxVal = Number(ruleParam);
                        if (typeof val === "number" || (!isNaN(Number(val)) && ruleList.indexOf("numeric") !== -1)) {
                            if (Number(val) > maxVal) {
                                addError(field, "The " + field + " may not be greater than " + maxVal + ".");
                            }
                        } else if (String(val).length > maxVal) {
                            addError(field, "The " + field + " may not be greater than " + maxVal + " characters.");
                        }
                    } else if (ruleName === "in") {
                        var allowedValues = ruleParam.split(",").map(function (v) { return v.trim(); });
                        if (allowedValues.indexOf(String(val)) === -1) {
                            addError(field, "The selected " + field + " is invalid.");
                        }
                    } else if (ruleName === "confirmed") {
                        if (input[field + "_confirmation"] !== val) {
                            addError(field, "The " + field + " confirmation does not match.");
                        }
                    } else if (ruleName === "unique") {
                        var uParts = ruleParam.split(",");
                        var tableName = (uParts[0] || "").trim();
                        var columnName = (uParts[1] || field).trim();
                        var exceptId = uParts[2] !== undefined ? String(uParts[2]).trim() : "";

                        if (tableName && typeof read === "function") {
                            var queryFlt = { with_trashed: true, with: "none" };
                            queryFlt[columnName] = val;
                            var existingRes = read(tableName, queryFlt);

                            if (existingRes && existingRes.status && Array.isArray(existingRes.data)) {
                                var conflict = existingRes.data.some(function (row) {
                                    return exceptId === "" || String(row.id) !== exceptId;
                                });
                                if (conflict) {
                                    addError(field, "The " + field + " has already been taken.");
                                }
                            }
                        }
                    } else if (ruleName === "exists") {
                        var eParts = ruleParam.split(",");
                        var eTableName = (eParts[0] || "").trim();
                        var eColumnName = (eParts[1] || "id").trim();
                        var includeTrashed = (eParts[2] || "").trim() === "with_trashed";

                        if (eTableName && typeof read === "function") {
                            var existsFlt = { with: "none" };
                            if (includeTrashed) {
                                existsFlt.with_trashed = true;
                            }
                            existsFlt[eColumnName] = val;
                            var foundRes = read(eTableName, existsFlt);

                            var isFound = foundRes && foundRes.status && Array.isArray(foundRes.data) &&
                                foundRes.data.some(function (row) {
                                    return String(row[eColumnName]) === String(val);
                                });

                            if (!isFound) {
                                addError(field, "The selected " + field + " is invalid.");
                            }
                        }
                    }
                }
            }
        });

        var errorKeys = Object.keys(errors);

        return {
            fails: function () {
                return errorKeys.length > 0;
            },
            passed: function () {
                return errorKeys.length === 0;
            },
            errors: function () {
                return errors;
            },
            firstError: function () {
                if (errorKeys.length === 0) return null;
                return errors[errorKeys[0]][0];
            }
        };
    }
};

var DateHelper = {
    DAYS: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    DAYS_SHORT: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    MONTHS: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    MONTHS_SHORT: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],

    toDate: function (value) {
        if (!value) return null;
        var date = value instanceof Date ? value : new Date(value);
        return isNaN(date.getTime()) ? null : date;
    },

    parseTimestamp: function (value) {
        if (!value) return null;
        if (value instanceof Date && !isNaN(value.getTime())) {
            return value.getTime();
        }

        var str = String(value).trim();

        var monthYearMatch = str.match(/^(\d{1,2})\/(\d{4})$/);
        if (monthYearMatch) {
            var month = Number(monthYearMatch[1]);
            var year = Number(monthYearMatch[2]);
            if (month < 1 || month > 12) return null;
            return new Date(year, month - 1, 1).getTime();
        }

        var timestamp = Date.parse(str);
        return isNaN(timestamp) ? null : timestamp;
    },

    format: function (date, formatStr) {
        var d = this.toDate(date);
        if (!d) return "";

        var self = this;
        var pad = function (num, size) {
            return String(num).padStart(size || 2, "0");
        };

        var tokens = {
            d: function () { return pad(d.getDate()); },
            j: function () { return String(d.getDate()); },
            l: function () { return self.DAYS[d.getDay()]; },
            D: function () { return self.DAYS_SHORT[d.getDay()]; },
            w: function () { return String(d.getDay()); },
            N: function () { return String(d.getDay() === 0 ? 7 : d.getDay()); },

            m: function () { return pad(d.getMonth() + 1); },
            n: function () { return String(d.getMonth() + 1); },
            F: function () { return self.MONTHS[d.getMonth()]; },
            M: function () { return self.MONTHS_SHORT[d.getMonth()]; },

            Y: function () { return String(d.getFullYear()); },
            y: function () { return String(d.getFullYear()).slice(-2); },

            a: function () { return d.getHours() >= 12 ? "pm" : "am"; },
            A: function () { return d.getHours() >= 12 ? "PM" : "AM"; },
            g: function () { return String(d.getHours() % 12 || 12); },
            h: function () { return pad(d.getHours() % 12 || 12); },
            G: function () { return String(d.getHours()); },
            H: function () { return pad(d.getHours()); },
            i: function () { return pad(d.getMinutes()); },
            s: function () { return pad(d.getSeconds()); },

            O: function () {
                var offset = d.getTimezoneOffset();
                var sign = offset > 0 ? "-" : "+";
                var abs = Math.abs(offset);
                return sign + pad(Math.floor(abs / 60)) + pad(abs % 60);
            },
            P: function () {
                var offset = d.getTimezoneOffset();
                var sign = offset > 0 ? "-" : "+";
                var abs = Math.abs(offset);
                return sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
            }
        };

        return formatStr.replace(/[a-zA-Z]/g, function (char) {
            return tokens[char] ? tokens[char]() : char;
        });
    },

    timeAgo: function (value) {
        var date = this.toDate(value);
        if (!date) return null;

        var seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        if (seconds < 60) return "Just now";

        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + " minutes ago";

        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + " hours ago";

        var days = Math.floor(hours / 24);
        if (days < 2) return days + " days ago";

        return this.format(date, "D, j F Y H:i:s");
    }
};

var PaginationHelper = {
    parsePage: function (params) {
        var page = parseInt(params && params.page, 10);
        return isNaN(page) || page < 1 ? 1 : page;
    },

    parsePerPage: function (params, defaultLimit, maxLimit) {
        var fallback = defaultLimit || 10;
        var ceiling = maxLimit || 100;
        var limit = parseInt(params && params.per_page, 10);

        if (isNaN(limit) || limit < 1) return fallback;
        return Math.min(limit, ceiling);
    },

    buildMeta: function (result, defaultPerPage) {
        var meta = (result && result.meta) || {};
        var page = Number(meta.current_page || 1);
        var perPage = Number(meta.per_page || defaultPerPage || 10);
        var total = Number(meta.total || 0);
        var lastPage = Number(meta.last_page || 1);

        return {
            current_page: page,
            last_page: lastPage,
            per_page: perPage,
            total: total,
            from: total === 0 ? null : ((page - 1) * perPage) + 1,
            to: total === 0 ? null : Math.min(page * perPage, total),
            has_more_pages: page < lastPage
        };
    }
};

var SearchHelper = {
    normalize: function (value) {
        if (value === null || value === undefined) return "";
        return String(value).toLowerCase().trim();
    },

    isMatch: function (cellValue, keyword) {
        if (keyword === null || keyword === undefined || keyword === "") return true;
        if (cellValue === null || cellValue === undefined) return false;
        return String(cellValue).toLowerCase().indexOf(String(keyword).toLowerCase()) !== -1;
    }
};

function sanitizeClientPayload(rawPayload) {
    return Sanitizer.cleanClientPayload(rawPayload);
}

function generateSessionKey() {
    return Utilities.getUuid().replace(/-/g, "");
}

function parseDateValue(value) {
    return DateHelper.parseTimestamp(value);
}

function dateFormat(date, formatStr) {
    return DateHelper.format(date, formatStr);
}

function timeAgo(value) {
    return DateHelper.timeAgo(value);
}

function normalizeSearchValue(value) {
    return SearchHelper.normalize(value);
}

function isSearchMatch(cellValue, keyword) {
    return SearchHelper.isMatch(cellValue, keyword);
}

function isDebugEnabled() {
    if (typeof CONFIG !== "undefined" && typeof CONFIG.isDebug === "function") {
        return CONFIG.isDebug();
    }
    var val = (typeof CONFIG !== "undefined" && typeof CONFIG.getOptional === "function")
        ? CONFIG.getOptional("APP_DEBUG", false)
        : false;
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val === 1;
    if (typeof val === "string") {
        return ["true", "1", "yes", "on"].indexOf(val.trim().toLowerCase()) !== -1;
    }
    return Boolean(val);
}

function escapeHtml(str) {
    return String(str === undefined || str === null ? "" : str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function isWebRequest(e, context) {
    var ctx = (context && typeof context === "object") ? context : {};
    var params = (ctx.params && typeof ctx.params === "object")
        ? ctx.params
        : ((e && e.parameter && typeof e.parameter === "object") ? e.parameter : {});
    var payload = (ctx.payload && typeof ctx.payload === "object") ? ctx.payload : {};

    // 1. Override eksplisit per request (?format=json atau ?format=html)
    var formatHint = String(params.format || payload.format || "").trim().toLowerCase();
    if (formatHint === "json") return false;
    if (formatHint === "html") return true;

    // 2. Override eksplisit dari definisi route (Route.resource vs Route.view)
    if (ctx.isApi === true) return false;
    if (ctx.isWeb === true) return true;

    // 3. Cek APP_MODE: jika bukan "web" (misal "api"), paksa JSON untuk semua endpoint default
    var appMode = (typeof CONFIG !== "undefined" && typeof CONFIG.getOptional === "function")
        ? String(CONFIG.getOptional("APP_MODE", "web") || "web").trim().toLowerCase()
        : "web";

    if (appMode !== "web") {
        return false;
    }

    // 4. Aturan khusus saat APP_MODE=web
    var method = String(ctx.method || (params._method || payload._method || "GET")).toUpperCase();
    if (method !== "GET") {
        return false;
    }

    var route = String(ctx.route || params.route || (e && e.pathInfo) || "").replace(/^\/+|\/+$/g, "").toLowerCase();
    if (route === "api" || route.indexOf("api/") === 0) {
        return false;
    }

    var headers = (e && e.headers && typeof e.headers === "object") ? e.headers : {};
    var acceptHeader = String(headers.accept || headers.Accept || "").toLowerCase();
    if (acceptHeader.indexOf("application/json") !== -1 && acceptHeader.indexOf("text/html") === -1) {
        return false;
    }

    return true;
}

function createHtmlOutputSafe(html, statusCode) {
    var content = String(html || "");
    if (typeof HtmlService !== "undefined" && typeof HtmlService.createHtmlOutput === "function") {
        var out = HtmlService.createHtmlOutput(content);
        if (typeof out.setXFrameOptionsMode === "function" && HtmlService.XFrameOptionsMode) {
            out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
        }
        out._statusCode = statusCode || 200;
        return out;
    }

    return {
        _statusCode: statusCode || 200,
        getContent: function () { return content; },
        getMimeType: function () { return "HTML"; }
    };
}

function formatErrorResponse(err, statusCode, fallbackMessage, context) {
    var code = statusCode || (err && err.statusCode) || 500;
    var rawMessage = (err && err.message)
        ? String(err.message)
        : (typeof err === "string" && err ? err : (fallbackMessage || "Unexpected error"));

    if (typeof Logger !== "undefined" && typeof Logger.log === "function") {
        Logger.log("[ERROR " + code + "] " + rawMessage + (err && err.stack ? "\n" + err.stack : ""));
    }

    if (isDebugEnabled()) {
        var debugPayload = {
            status: false,
            code: code,
            error_type: (err && err.name) ? String(err.name) : "Error",
            message: rawMessage
        };

        if (err && (err.fileName || err.lineNumber)) {
            debugPayload.location = {
                file: err.fileName ? String(err.fileName) : "",
                line: err.lineNumber || null
            };
        }

        if (err && (err.errors || err.details)) {
            debugPayload.details = err.errors || err.details;
        }

        if (context && typeof context === "object") {
            debugPayload.context = {
                route: context.route || "",
                method: context.method || "",
                action: context.action || ""
            };
            if (context.debug) {
                debugPayload.debug = context.debug;
            }
        }

        if (err && err.stack) {
            var stackStr = String(err.stack);
            debugPayload.stack = stackStr;
            debugPayload.stack_trace = stackStr.split(/\r?\n/).map(function (line) {
                return line.trim();
            }).filter(Boolean);
        }

        return debugPayload;
    }

    return {
        status: false,
        code: code,
        message: fallbackMessage || (code === 404 ? "404 Not Found" : "Internal server error.")
    };
}

function renderErrorHtml(errorPayload) {
    var code = Number(errorPayload && errorPayload.code) || 500;
    var debug = isDebugEnabled();
    var appName = (typeof CONFIG !== "undefined" && typeof CONFIG.getOptional === "function")
        ? String(CONFIG.getOptional("APP_NAME", "Asal-GAS"))
        : "Asal-GAS";

    var title = debug
        ? (errorPayload.error_type || "Error") + " (" + code + ") - " + appName
        : code + " | " + (errorPayload.message || "Internal Server Error");

    var bodyHtml = "";
    if (!debug) {
        bodyHtml =
            '<div class="card">' +
                '<div class="badge">HTTP ' + escapeHtml(code) + '</div>' +
                '<h1>' + escapeHtml(errorPayload.message || "Internal server error.") + '</h1>' +
                '<p class="muted">Enable <code>APP_DEBUG=true</code> to inspect full error diagnostics.</p>' +
            '</div>';
    } else {
        var ctx = errorPayload.context || {};
        var loc = errorPayload.location || {};
        var stackText = errorPayload.stack || (Array.isArray(errorPayload.stack_trace) ? errorPayload.stack_trace.join("\n") : "");
        var detailsJson = errorPayload.details ? JSON.stringify(errorPayload.details, null, 2) : "";
        var extraDebugJson = errorPayload.debug ? JSON.stringify(errorPayload.debug, null, 2) : "";

        bodyHtml =
            '<div class="card">' +
                '<div class="header">' +
                    '<span class="badge">HTTP ' + escapeHtml(code) + '</span>' +
                    '<span class="type">' + escapeHtml(errorPayload.error_type || "Error") + '</span>' +
                '</div>' +
                '<h1 class="msg">' + escapeHtml(errorPayload.message || "Unexpected error") + '</h1>' +
                '<div class="meta">' +
                    '<div><strong>Method:</strong> ' + escapeHtml(ctx.method || "-") + '</div>' +
                    '<div><strong>Route:</strong> /' + escapeHtml(ctx.route || "") + '</div>' +
                    '<div><strong>Action:</strong> ' + escapeHtml(ctx.action || "-") + '</div>' +
                    (loc.file ? '<div><strong>Location:</strong> ' + escapeHtml(loc.file + (loc.line ? ":" + loc.line : "")) + '</div>' : '') +
                '</div>' +
                (detailsJson ? '<h3>Details</h3><pre>' + escapeHtml(detailsJson) + '</pre>' : '') +
                (extraDebugJson ? '<h3>Debug Info</h3><pre>' + escapeHtml(extraDebugJson) + '</pre>' : '') +
                (stackText ? '<h3>Stack Trace</h3><pre>' + escapeHtml(stackText) + '</pre>' : '') +
            '</div>';
    }

    var html =
        '<!DOCTYPE html><html lang="en"><head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<meta name="http-status" content="' + escapeHtml(code) + '">' +
        '<title>' + escapeHtml(title) + '</title>' +
        '<style>' +
            'body{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;}' +
            '.card{max-width:960px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.35);}' +
            '.header{display:flex;align-items:center;gap:10px;margin-bottom:12px;}' +
            '.badge{background:#dc2626;color:#fff;font-weight:700;padding:4px 10px;border-radius:6px;font-size:13px;}' +
            '.type{color:#fca5a5;font-weight:700;font-size:15px;}' +
            '.msg{margin:8px 0 18px;font-size:20px;line-height:1.4;color:#f8fafc;word-break:break-word;}' +
            '.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;background:#0f172a;padding:12px 14px;border-radius:8px;border:1px solid #334155;font-size:13px;margin-bottom:18px;}' +
            'h3{margin:16px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;}' +
            'pre{background:#020617;color:#f8fafc;padding:14px;border-radius:8px;border:1px solid #334155;overflow-x:auto;font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;}' +
            '.muted{color:#94a3b8;font-size:14px;}' +
        '</style></head><body>' + bodyHtml + '</body></html>';

    return createHtmlOutputSafe(html, code);
}

function failResponse(message, code, extra) {
    var statusCode = code || 400;
    var msg = message || "Request failed.";
    var res = Object.assign({
        status: false,
        code: statusCode,
        message: msg
    }, extra || {});

    if (isDebugEnabled() && !(res.error instanceof Error)) {
        var err = new Error(msg);
        err.statusCode = statusCode;
        if (typeof Error.captureStackTrace === "function") {
            Error.captureStackTrace(err, failResponse);
        }
        res.error = err;
    }

    return res;
}

function handleResponse(responseObject, e, context) {
    if (responseObject && typeof responseObject.getContent === "function") {
        return responseObject;
    }

    var webMode = isWebRequest(e, context);

    if (responseObject && typeof responseObject === "object" && responseObject.status === false) {
        var enriched = responseObject;

        if (isDebugEnabled()) {
            var errObj = (responseObject.error instanceof Error)
                ? responseObject.error
                : null;

            if (!errObj) {
                errObj = new Error(responseObject.message || "Request failed with status=false");
                errObj.statusCode = responseObject.code || 500;
                if (typeof Error.captureStackTrace === "function") {
                    Error.captureStackTrace(errObj, handleResponse);
                }
            }

            if (responseObject.errors) {
                errObj.errors = responseObject.errors;
            }

            var formatted = formatErrorResponse(
                errObj,
                responseObject.code || errObj.statusCode || 500,
                responseObject.message,
                context
            );

            enriched = Object.assign({}, responseObject, formatted);
            delete enriched.error;
        } else {
            enriched = Object.assign({}, responseObject);
            delete enriched.error;
        }

        if (webMode) {
            return renderErrorHtml(enriched);
        }

        return ContentService.createTextOutput(JSON.stringify(enriched))
            .setMimeType(ContentService.MimeType.JSON);
    }

    if (typeof responseObject === "string" && webMode) {
        return createHtmlOutputSafe(responseObject, 200);
    }

    return ContentService.createTextOutput(JSON.stringify(responseObject))
        .setMimeType(ContentService.MimeType.JSON);
}

function handleHttpError(err, e, context) {
    var statusCode = (err && err.statusCode) ? err.statusCode : 500;
    var payload = typeof formatErrorResponse === "function"
        ? formatErrorResponse(err, statusCode, null, context)
        : { status: false, code: statusCode, message: "Internal server error." };

    return handleResponse(payload, e, context);
}
