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

function handleResponse(responseObject) {
    return ContentService.createTextOutput(JSON.stringify(responseObject))
        .setMimeType(ContentService.MimeType.JSON);
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
