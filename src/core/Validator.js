var Sanitizer = {
    RESTRICTED_KEYS: {
        "with_password": true,
        "withpassword": true,
        "filter[with_password]": true,
        "make_visible": true,
        "makevisible": true,
        "filter[make_visible]": true,
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
