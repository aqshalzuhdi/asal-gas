class Request {
    constructor(rawContext) {
        var ctx = rawContext || {};
        this.event = ctx.event || null;
        this.headers = (ctx.headers && typeof ctx.headers === "object") ? ctx.headers : {};
        this._routePath = ctx.route || "";
        this.routeParams = (ctx.routeParams && typeof ctx.routeParams === "object") ? ctx.routeParams : {};
        this.method = String(ctx.method || "GET").toUpperCase();
        this.action = ctx.action || "";
        this.params = (ctx.params && typeof ctx.params === "object") ? ctx.params : {};
        this.payload = (ctx.payload && typeof ctx.payload === "object") ? ctx.payload : {};
        this.auth = ctx.auth || null;
        this.isApi = ctx.isApi === true;
        this.isWeb = ctx.isWeb === true;
    }

    _bodyData() {
        if (this.payload && typeof this.payload === "object") {
            if (this.payload.data && typeof this.payload.data === "object" && !Array.isArray(this.payload.data)) {
                return this.payload.data;
            }
            return this.payload;
        }
        return {};
    }

    all() {
        var ignored = {
            route: true,
            session: true,
            _token: true,
            _method: true,
            action: true
        };
        var merged = {};
        var paramKeys = Object.keys(this.params);
        for (var i = 0; i < paramKeys.length; i++) {
            var pKey = paramKeys[i];
            if (!ignored[pKey]) {
                merged[pKey] = this.params[pKey];
            }
        }

        var body = this._bodyData();
        var bodyKeys = Object.keys(body);
        for (var j = 0; j < bodyKeys.length; j++) {
            var bKey = bodyKeys[j];
            if (!ignored[bKey]) {
                merged[bKey] = body[bKey];
            }
        }

        return merged;
    }

    input(key, defaultValue) {
        var fallback = arguments.length >= 2 ? defaultValue : null;
        if (!key) return this.all();

        var body = this._bodyData();
        if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
            return body[key];
        }
        if (Object.prototype.hasOwnProperty.call(this.params, key) && this.params[key] !== undefined) {
            return this.params[key];
        }
        if (Object.prototype.hasOwnProperty.call(this.routeParams, key) && this.routeParams[key] !== undefined) {
            return this.routeParams[key];
        }
        return fallback;
    }

    query(key, defaultValue) {
        if (arguments.length === 0 || key === undefined || key === null) {
            return Object.assign({}, this.params);
        }
        var fallback = arguments.length >= 2 ? defaultValue : null;
        return Object.prototype.hasOwnProperty.call(this.params, key) && this.params[key] !== undefined
            ? this.params[key]
            : fallback;
    }

    route(key, defaultValue) {
        if (arguments.length === 0 || key === undefined || key === null) {
            return this._routePath;
        }
        var fallback = arguments.length >= 2 ? defaultValue : null;
        return Object.prototype.hasOwnProperty.call(this.routeParams, key) && this.routeParams[key] !== undefined
            ? this.routeParams[key]
            : fallback;
    }

    only(keys) {
        var list = Array.isArray(keys) ? keys : Array.prototype.slice.call(arguments);
        var source = this.all();
        var picked = {};
        for (var i = 0; i < list.length; i++) {
            var k = String(list[i]);
            if (Object.prototype.hasOwnProperty.call(source, k)) {
                picked[k] = source[k];
            }
        }
        return picked;
    }

    except(keys) {
        var list = Array.isArray(keys) ? keys : Array.prototype.slice.call(arguments);
        var excluded = {};
        for (var i = 0; i < list.length; i++) {
            excluded[String(list[i])] = true;
        }
        var source = this.all();
        var result = {};
        var sourceKeys = Object.keys(source);
        for (var j = 0; j < sourceKeys.length; j++) {
            var k = sourceKeys[j];
            if (!excluded[k]) {
                result[k] = source[k];
            }
        }
        return result;
    }

    has(key) {
        var source = this.all();
        if (Array.isArray(key)) {
            for (var i = 0; i < key.length; i++) {
                if (!Object.prototype.hasOwnProperty.call(source, key[i])) {
                    return false;
                }
            }
            return true;
        }
        return Object.prototype.hasOwnProperty.call(source, key);
    }

    filled(key) {
        var val = this.input(key, undefined);
        return val !== undefined && val !== null && String(val).trim() !== "";
    }

    header(name, defaultValue) {
        var fallback = arguments.length >= 2 ? defaultValue : null;
        if (!name) return fallback;
        var target = String(name).toLowerCase();
        var keys = Object.keys(this.headers);
        for (var i = 0; i < keys.length; i++) {
            if (String(keys[i]).toLowerCase() === target) {
                return this.headers[keys[i]];
            }
        }
        return fallback;
    }

    bearerToken() {
        var authHeader = this.header("authorization", "");
        if (!authHeader) return null;
        var match = String(authHeader).match(/^Bearer\s+(.+)$/i);
        return match ? match[1].trim() : null;
    }

    isMethod(verb) {
        return this.method === String(verb || "").trim().toUpperCase();
    }

    user() {
        return this.auth;
    }

    wantsJson() {
        var appMode = (typeof CONFIG !== "undefined" && typeof CONFIG.getOptional === "function")
            ? String(CONFIG.getOptional("APP_MODE", "web") || "web").trim().toLowerCase()
            : "web";

        if (appMode !== "web") {
            return true;
        }

        var formatHint = String(this.params.format || this.payload.format || "").trim().toLowerCase();
        if (formatHint === "json") return true;
        if (formatHint === "html") return false;

        if (this.isApi === true) return true;
        if (this.isWeb === true) return false;

        var accept = String(this.header("accept", "")).toLowerCase();
        if (accept.indexOf("application/json") !== -1 && accept.indexOf("text/html") === -1) {
            return true;
        }

        return false;
    }
}
