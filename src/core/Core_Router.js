var Route = (function () {
    var _routes = {};
    var _namedRoutes = {};
    var _middlewareStack = [];
    var _prefixStack = [];
    var _booted = false;

    var _currentRouteLayer = null;

    function getAppMode() {
        if (typeof CONFIG !== "undefined") {
            if (CONFIG.APP_MODE) return String(CONFIG.APP_MODE).trim().toLowerCase();
            if (typeof CONFIG.getOptional === "function") {
                return String(CONFIG.getOptional("APP_MODE", "web") || "web").trim().toLowerCase();
            }
        }
        return "web";
    }

    function getApiPrefix() {
        if (typeof CONFIG !== "undefined") {
            if (CONFIG.API_PREFIX !== undefined) {
                return String(CONFIG.API_PREFIX || "").trim().replace(/^\/+|\/+$/g, "");
            }
            if (typeof CONFIG.getOptional === "function") {
                var raw = String(CONFIG.getOptional("API_PREFIX", "api") || "").trim().replace(/^\/+|\/+$/g, "");
                return (raw.toLowerCase() === "none" || raw === "-") ? "" : raw;
            }
        }
        return "api";
    }

    function runApiLayer(fn) {
        if (typeof fn !== "function") return;
        var apiPrefix = getApiPrefix();
        _currentRouteLayer = "api";
        try {
            if (apiPrefix) {
                Route.prefix(apiPrefix, fn);
            } else {
                fn();
            }
        } finally {
            _currentRouteLayer = null;
        }
    }

    function boot() {
        if (_booted) return;
        _booted = true;

        if (typeof registerWebRoutes === "function") {
            _currentRouteLayer = "web";
            try {
                registerWebRoutes();
            } finally {
                _currentRouteLayer = null;
            }
        }

        runApiLayer(typeof registerApiRoutes === "function" ? registerApiRoutes : null);
        runApiLayer(typeof registerRoutes === "function" ? registerRoutes : null);
    }

    function normalizeRoutePath(rawPath) {
        if (rawPath === undefined || rawPath === null) return "";
        return String(rawPath).trim().replace(/^\/+|\/+$/g, "");
    }

    function currentPrefix() {
        var parts = [];
        for (var i = 0; i < _prefixStack.length; i++) {
            var seg = normalizeRoutePath(_prefixStack[i]);
            if (seg) parts.push(seg);
        }
        return parts.join("/");
    }

    function applyPrefix(routeName) {
        var clean = normalizeRoutePath(routeName);
        var prefix = currentPrefix();
        if (!prefix) return clean;
        if (!clean) return prefix;
        if (clean === prefix || clean.indexOf(prefix + "/") === 0) {
            return clean;
        }
        return prefix + "/" + clean;
    }

    function currentMiddlewares() {
        var result = [];
        for (var i = 0; i < _middlewareStack.length; i++) {
            var group = _middlewareStack[i];
            for (var j = 0; j < group.length; j++) {
                if (result.indexOf(group[j]) === -1) {
                    result.push(group[j]);
                }
            }
        }
        return result;
    }

    function resolveHandler(handlerSpec) {
        if (!handlerSpec) return null;

        if (typeof handlerSpec === "function") {
            return handlerSpec;
        }

        if (typeof handlerSpec === "string") {
            var parts = handlerSpec.split("@");
            if (parts.length !== 2) return null;

            var ctrlName = parts[0].trim();
            var methodName = parts[1].trim();
            var ctrlObj = globalThis[ctrlName];

            if (!ctrlObj || typeof ctrlObj !== "object") return null;
            if (typeof ctrlObj[methodName] !== "function") return null;

            return function (ctx) {
                return ctrlObj[methodName](ctx);
            };
        }

        if (typeof handlerSpec === "object") {
            var targetCtrl = typeof handlerSpec.controller === "string"
                ? globalThis[handlerSpec.controller]
                : handlerSpec.controller;

            if (!targetCtrl || typeof targetCtrl !== "object") return null;
            if (typeof targetCtrl[handlerSpec.method] !== "function") return null;

            return function (ctx) {
                var callArgs = [ctx].concat(handlerSpec.args || []);
                return targetCtrl[handlerSpec.method].apply(targetCtrl, callArgs);
            };
        }

        return null;
    }

    function buildFluentBuilder(entryRefs) {
        return {
            name: function (routeAlias) {
                var alias = String(routeAlias || "").trim();
                if (alias && entryRefs.length > 0) {
                    _namedRoutes[alias] = entryRefs[0].path;
                    for (var i = 0; i < entryRefs.length; i++) {
                        entryRefs[i].entry.name = alias;
                    }
                }
                return this;
            },
            middleware: function (mwNames) {
                var list = Array.isArray(mwNames) ? mwNames : [mwNames];
                for (var i = 0; i < entryRefs.length; i++) {
                    var target = entryRefs[i].entry;
                    for (var j = 0; j < list.length; j++) {
                        if (target.middlewares.indexOf(list[j]) === -1) {
                            target.middlewares.push(list[j]);
                        }
                    }
                }
                return this;
            }
        };
    }

    function register(methods, routeName, handlerSpec, options) {
        var cleanRoute = applyPrefix(routeName);
        var appMode = getAppMode();

        if (_currentRouteLayer === "web" && appMode !== "web") {
            if (cleanRoute !== "" && cleanRoute !== "index") {
                return buildFluentBuilder([]);
            }
        }

        if (!_routes[cleanRoute]) {
            _routes[cleanRoute] = [];
        }

        var apiPrefix = (typeof CONFIG !== "undefined" && CONFIG.API_PREFIX !== undefined)
            ? CONFIG.API_PREFIX
            : "api";

        var opts = Object.assign({}, options || {});
        if (
            _currentRouteLayer === "api" ||
            (apiPrefix && (cleanRoute === apiPrefix || cleanRoute.indexOf(apiPrefix + "/") === 0))
        ) {
            opts._isApi = true;
        } else if (_currentRouteLayer === "web" || opts.web === true) {
            opts._isWeb = true;
        }

        var normalizedMethods = [];
        for (var i = 0; i < methods.length; i++) {
            normalizedMethods.push(String(methods[i]).toUpperCase());
        }

        var entryObj = {
            methods: normalizedMethods,
            action: opts.action || null,
            name: opts.name || null,
            middlewares: currentMiddlewares(),
            handlerSpec: handlerSpec,
            options: opts
        };

        if (opts.name) {
            _namedRoutes[String(opts.name).trim()] = cleanRoute;
        }

        _routes[cleanRoute].push(entryObj);
        return buildFluentBuilder([{ path: cleanRoute, entry: entryObj }]);
    }

    function matchDynamicRoute(normalizedRoute) {
        if (!normalizedRoute) return null;

        var incomingParts = normalizedRoute.split("/");
        var routeKeys = Object.keys(_routes);
        var bestMatch = null;
        var bestStaticScore = -1;

        for (var i = 0; i < routeKeys.length; i++) {
            var pattern = routeKeys[i];
            if (pattern.indexOf(":") === -1 && pattern.indexOf("{") === -1) {
                continue;
            }

            var patternParts = pattern.split("/");
            if (patternParts.length !== incomingParts.length) {
                continue;
            }

            var extractedParams = {};
            var isMatch = true;
            var staticScore = 0;

            for (var s = 0; s < patternParts.length; s++) {
                var pSeg = patternParts[s];
                var iSeg = incomingParts[s];

                if (pSeg.charAt(0) === ":" && pSeg.length > 1) {
                    extractedParams[pSeg.substring(1)] = iSeg;
                } else if (
                    pSeg.charAt(0) === "{" &&
                    pSeg.charAt(pSeg.length - 1) === "}" &&
                    pSeg.length > 2
                ) {
                    extractedParams[pSeg.substring(1, pSeg.length - 1)] = iSeg;
                } else if (pSeg === iSeg) {
                    staticScore++;
                } else {
                    isMatch = false;
                    break;
                }
            }

            if (isMatch && staticScore > bestStaticScore) {
                bestStaticScore = staticScore;
                bestMatch = {
                    entries: _routes[pattern] || [],
                    routeParams: extractedParams
                };
            }
        }

        return bestMatch;
    }

    function resolveResourceAbilities(opts) {
        var all = ["index", "store", "update", "destroy", "restore", "forceDelete"];

        function expandTokens(list) {
            var map = {};
            for (var i = 0; i < list.length; i++) {
                var token = String(list[i]).trim();
                var upper = token.toUpperCase();
                if (upper === "GET") {
                    map.index = true;
                } else if (upper === "POST") {
                    map.store = true;
                    map.update = true;
                    map.destroy = true;
                    map.restore = true;
                    map.forceDelete = true;
                } else if (token === "force-delete") {
                    map.forceDelete = true;
                } else if (all.indexOf(token) !== -1) {
                    map[token] = true;
                }
            }
            return map;
        }

        if (Array.isArray(opts.only)) {
            var onlyMap = expandTokens(opts.only);
            return all.filter(function (a) { return !!onlyMap[a]; });
        }

        if (Array.isArray(opts.except)) {
            var exceptMap = expandTokens(opts.except);
            return all.filter(function (a) { return !exceptMap[a]; });
        }

        return all;
    }

    return {
        prefix: function (prefixStr, callback) {
            _prefixStack.push(prefixStr);
            try {
                callback();
            } finally {
                _prefixStack.pop();
            }
            return Route;
        },

        middleware: function (middlewareNames, callback) {
            var list = Array.isArray(middlewareNames) ? middlewareNames : [middlewareNames];
            _middlewareStack.push(list);
            try {
                callback();
            } finally {
                _middlewareStack.pop();
            }
            return Route;
        },

        group: function (options, callback) {
            var opts = options || {};
            var hasPrefix = opts.prefix !== undefined && opts.prefix !== null && String(opts.prefix).trim() !== "";
            var hasMw = opts.middleware !== undefined && opts.middleware !== null;

            if (hasPrefix) _prefixStack.push(opts.prefix);
            if (hasMw) _middlewareStack.push(Array.isArray(opts.middleware) ? opts.middleware : [opts.middleware]);

            try {
                callback();
            } finally {
                if (hasMw) _middlewareStack.pop();
                if (hasPrefix) _prefixStack.pop();
            }
            return Route;
        },

        get: function (routeName, handlerSpec, options) {
            return register(["GET"], routeName, handlerSpec, options);
        },

        post: function (routeName, handlerSpec, options) {
            return register(["POST"], routeName, handlerSpec, options);
        },

        put: function (routeName, handlerSpec, options) {
            return register(["PUT"], routeName, handlerSpec, options);
        },

        patch: function (routeName, handlerSpec, options) {
            return register(["PATCH"], routeName, handlerSpec, options);
        },

        delete: function (routeName, handlerSpec, options) {
            return register(["DELETE"], routeName, handlerSpec, options);
        },

        match: function (methods, routeName, handlerSpec, options) {
            return register(methods, routeName, handlerSpec, options);
        },

        view: function (routeName, viewName, viewData, options) {
            var opts = Object.assign({}, options || {}, { web: true });
            return register(["GET"], routeName, function () {
                return view(viewName, viewData || {});
            }, opts);
        },

        resource: function (routeName, controller, options) {
            var ctrl = controller;
            var opts = Object.assign({}, options || {}, { _isResource: true, _isApi: true });

            if (
                ctrl &&
                typeof ctrl === "object" &&
                typeof ctrl.index !== "function" &&
                typeof ctrl.store !== "function"
            ) {
                opts = Object.assign({}, ctrl, { _isResource: true, _isApi: true });
                ctrl = null;
            }

            var abilities = resolveResourceAbilities(opts);

            if (abilities.indexOf("index") !== -1) {
                register(["GET"], routeName, {
                    controller: ctrl,
                    method: "index",
                    args: [opts]
                }, Object.assign({}, opts, { action: null }));
            }

            if (abilities.indexOf("store") !== -1) {
                register(["POST"], routeName, {
                    controller: ctrl,
                    method: "store",
                    args: [opts]
                }, Object.assign({}, opts, { action: "create" }));
            }

            if (abilities.update) {
                // fallback check
            }

            if (abilities.indexOf("update") !== -1) {
                register(["POST"], routeName, {
                    controller: ctrl,
                    method: "update",
                    args: [opts]
                }, Object.assign({}, opts, { action: "update" }));

                register(["PUT", "PATCH"], routeName, {
                    controller: ctrl,
                    method: "update",
                    args: [opts]
                }, Object.assign({}, opts, { action: null }));
            }

            if (abilities.indexOf("destroy") !== -1) {
                register(["POST"], routeName, {
                    controller: ctrl,
                    method: "destroy",
                    args: [opts]
                }, Object.assign({}, opts, { action: "delete" }));

                register(["DELETE"], routeName, {
                    controller: ctrl,
                    method: "destroy",
                    args: [opts]
                }, Object.assign({}, opts, { action: null }));
            }

            if (abilities.indexOf("restore") !== -1) {
                register(["POST", "PUT", "PATCH"], routeName, {
                    controller: ctrl,
                    method: "restore",
                    args: [opts]
                }, Object.assign({}, opts, { action: "restore" }));
            }

            if (abilities.indexOf("forceDelete") !== -1) {
                register(["POST", "DELETE"], routeName, {
                    controller: ctrl,
                    method: "forceDelete",
                    args: [opts]
                }, Object.assign({}, opts, { action: "force-delete" }));
            }

            return Route;
        },

        resolveName: function (name) {
            boot();
            return _namedRoutes[String(name || "").trim()] || null;
        },

        resolve: function (routeName, method, action) {
            boot();

            var normalizedRoute = normalizeRoutePath(routeName);
            var routeParams = {};
            var entries = _routes[normalizedRoute] || (normalizedRoute === "" ? _routes["/"] : null);

            if (!entries && getAppMode() !== "web") {
                if (normalizedRoute === "index" && _routes[""]) {
                    entries = _routes[""];
                } else if (normalizedRoute === "" && _routes["index"]) {
                    entries = _routes["index"];
                }
            }

            // Pencocokan rute berparameter seperti users/:id/edit dan users/:id
            if (!entries && normalizedRoute !== "") {
                var actualSegs = normalizedRoute.split("/");
                var patternKeys = Object.keys(_routes);

                for (var pk = 0; pk < patternKeys.length; pk++) {
                    var patternKey = patternKeys[pk];
                    if (patternKey.indexOf(":") === -1) continue;

                    var patternSegs = patternKey.split("/");
                    if (patternSegs.length !== actualSegs.length) continue;

                    var extracted = {};
                    var isSegMatch = true;

                    for (var s = 0; s < patternSegs.length; s++) {
                        var pSeg = patternSegs[s];
                        var aSeg = actualSegs[s];

                        if (pSeg.charAt(0) === ":") {
                            var paramName = pSeg.slice(1);
                            try {
                                extracted[paramName] = decodeURIComponent(aSeg);
                            } catch (_) {
                                extracted[paramName] = aSeg;
                            }
                        } else if (pSeg !== aSeg) {
                            isSegMatch = false;
                            break;
                        }
                    }

                    if (isSegMatch) {
                        entries = _routes[patternKey];
                        routeParams = extracted;
                        break;
                    }
                }
            }

            entries = Array.isArray(entries) ? entries : [];

            if (entries.length === 0) {
                return { statusCode: 404, message: "404 Not Found: /" + normalizedRoute };
            }

            var validEntries = [];
            var brokenSpecs = [];
            for (var v = 0; v < entries.length; v++) {
                var resolvedFn = resolveHandler(entries[v].handlerSpec);
                if (resolvedFn) {
                    validEntries.push({
                        methods: entries[v].methods,
                        action: entries[v].action,
                        middlewares: entries[v].middlewares,
                        options: entries[v].options,
                        routeParams: routeParams,
                        handler: resolvedFn
                    });
                } else {
                    brokenSpecs.push(
                        typeof entries[v].handlerSpec === "string"
                            ? entries[v].handlerSpec
                            : JSON.stringify(entries[v].handlerSpec)
                    );
                }
            }

            if (validEntries.length === 0) {
                var handlerErr = new Error(
                    "Route handler could not be resolved for '/" + normalizedRoute + "': " + brokenSpecs.join(", ")
                );
                handlerErr.statusCode = 500;
                throw handlerErr;
            }

            var allowedMethodsMap = {};
            var methodMatches = [];

            for (var i = 0; i < validEntries.length; i++) {
                var entry = validEntries[i];
                for (var m = 0; m < entry.methods.length; m++) {
                    allowedMethodsMap[entry.methods[m]] = true;
                }
                if (entry.methods.indexOf(method) !== -1) {
                    methodMatches.push(entry);
                }
            }

            if (methodMatches.length === 0) {
                var allowedList = Object.keys(allowedMethodsMap).join(", ");
                return {
                    statusCode: 405,
                    message: "405 Method Not Allowed. Allowed methods: " + allowedList
                };
            }

            var matchedEntry = null;
            for (var j = 0; j < methodMatches.length; j++) {
                if (methodMatches[j].action && methodMatches[j].action === action) {
                    matchedEntry = methodMatches[j];
                    break;
                }
            }

            if (!matchedEntry) {
                for (var k = 0; k < methodMatches.length; k++) {
                    if (!methodMatches[k].action) {
                        matchedEntry = methodMatches[k];
                        break;
                    }
                }
            }

            if (!matchedEntry) {
                var allowedActions = [];
                for (var a = 0; a < methodMatches.length; a++) {
                    if (methodMatches[a].action && allowedActions.indexOf(methodMatches[a].action) === -1) {
                        allowedActions.push(methodMatches[a].action);
                    }
                }
                return {
                    statusCode: 400,
                    message: "Invalid action. Allowed actions: " + allowedActions.join(", ")
                };
            }

            return {
                statusCode: 200,
                route: Object.assign({}, matchedEntry, {
                    routeParams: routeParams
                })
            };
        },

        list: function () {
            boot();

            var rows = [];
            var routeNames = Object.keys(_routes);

            for (var r = 0; r < routeNames.length; r++) {
                var rName = routeNames[r];
                var entries = _routes[rName] || [];

                for (var e = 0; e < entries.length; e++) {
                    var entry = entries[e];
                    var handlerLabel = "[Closure]";

                    if (typeof entry.handlerSpec === "string") {
                        handlerLabel = entry.handlerSpec;
                    } else if (entry.handlerSpec && typeof entry.handlerSpec === "object") {
                        var ctrlName = typeof entry.handlerSpec.controller === "string"
                            ? entry.handlerSpec.controller
                            : (entry.handlerSpec.controller && entry.handlerSpec.controller.sheet
                                ? "BaseController (" + entry.handlerSpec.controller.sheet + ")"
                                : "Controller");
                        handlerLabel = ctrlName + "@" + entry.handlerSpec.method;
                    }

                    var sheetLabel = (entry.options && entry.options.sheet)
                        ? entry.options.sheet
                        : "-";

                    if (sheetLabel === "-" && entry.handlerSpec && typeof entry.handlerSpec === "object") {
                        var resolvedCtrl = typeof entry.handlerSpec.controller === "string"
                            ? globalThis[entry.handlerSpec.controller]
                            : entry.handlerSpec.controller;

                        if (resolvedCtrl && resolvedCtrl.sheet) {
                            sheetLabel = resolvedCtrl.sheet;
                        }
                    }

                    rows.push({
                        methods: entry.methods.join("|"),
                        route: rName === "" ? "/ (default)" : rName,
                        action: entry.action || "-",
                        handler: handlerLabel,
                        middleware: entry.middlewares.length > 0 ? entry.middlewares.join(", ") : "-",
                        sheet: sheetLabel
                    });
                }
            }

            return rows;
        }
    };
})();

function url(rawPath, queryParams) {
    var cleanPath = String(rawPath || "").trim().replace(/^\/+|\/+$/g, "");
    var baseUrl = "";

    try {
        if (typeof CONFIG !== "undefined" && CONFIG.BASE_URL) {
            baseUrl = String(CONFIG.BASE_URL).replace(/\/+$/g, "");
        }
    } catch (_) { }

    var paramsList = [];
    if (queryParams && typeof queryParams === "object") {
        Object.keys(queryParams).forEach(function (k) {
            if (queryParams[k] !== undefined && queryParams[k] !== null) {
                paramsList.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(queryParams[k])));
            }
        });
    }

    var isGasExec = /\/(exec|dev)$/i.test(baseUrl);
    if (isGasExec) {
        if (cleanPath !== "") {
            paramsList.unshift("route=" + encodeURIComponent(cleanPath));
        }
        return baseUrl + (paramsList.length > 0 ? "?" + paramsList.join("&") : "");
    }

    var pathPart = cleanPath === "" ? "/" : "/" + cleanPath;
    return baseUrl + pathPart + (paramsList.length > 0 ? "?" + paramsList.join("&") : "");
}

function apiUrl(rawPath, queryParams) {
    var apiPrefix = (typeof CONFIG !== "undefined" && CONFIG.API_PREFIX !== undefined)
        ? String(CONFIG.API_PREFIX).trim().replace(/^\/+|\/+$/g, "")
        : "api";

    var clean = String(rawPath || "").trim().replace(/^\/+|\/+$/g, "");
    var prefixed = "";

    if (!apiPrefix) {
        prefixed = clean;
    } else if (clean === "" || clean === apiPrefix) {
        prefixed = apiPrefix;
    } else if (clean.indexOf(apiPrefix + "/") === 0) {
        prefixed = clean;
    } else {
        prefixed = apiPrefix + "/" + clean;
    }

    return url(prefixed, queryParams);
}
function route(routeName, params) {
    var pattern = Route.resolveName(routeName);
    if (!pattern) {
        return url(routeName, params);
    }

    var queryClone = params && typeof params === "object" ? Object.assign({}, params) : {};
    var resolvedPath = pattern.replace(/:([a-zA-Z0-9_]+)|\{([a-zA-Z0-9_]+)\}/g, function (_, p1, p2) {
        var key = p1 || p2;
        if (Object.prototype.hasOwnProperty.call(queryClone, key)) {
            var val = queryClone[key];
            delete queryClone[key];
            return encodeURIComponent(String(val));
        }
        return "";
    });

    return url(resolvedPath, queryClone);
}

var Middlewares = {
    auth: function (ctx) {
        var isPostLike = ctx.method !== "GET";
        var authResult = middlewareAuth(ctx.event, isPostLike);
        if (!authResult || !authResult.status) {
            return {
                passed: false,
                response: authResult || { status: false, message: "Unauthorized" }
            };
        }
        ctx.auth = authResult;
        return { passed: true };
    },

    throttle: function (ctx, paramStr) {
        if (typeof CacheService === "undefined") {
            return { passed: true };
        }

        var parts = String(paramStr || "60,1").split(",");
        var maxAttempts = parseInt(parts[0], 10);
        var decayMinutes = parseInt(parts[1], 10);
        if (isNaN(maxAttempts) || maxAttempts < 1) maxAttempts = 60;
        if (isNaN(decayMinutes) || decayMinutes < 1) decayMinutes = 1;

        var decaySeconds = decayMinutes * 60;
        var payload = ctx.payload || {};
        var data = (payload.data && typeof payload.data === "object") ? payload.data : payload;
        var params = ctx.params || {};

        var identifier = data.username || data.email || params.session || payload.session || "global";
        var cleanId = String(identifier).toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
        var prefix = typeof CACHE_CONFIG !== "undefined" ? CACHE_CONFIG.PREFIX : "GAS_DB_V1_";
        var cacheKey = prefix + "THROTTLE_" + ctx.route + "_" + cleanId;

        try {
            var cache = CacheService.getScriptCache();
            var raw = cache.get(cacheKey);
            var now = Date.now();
            var bucket = raw ? JSON.parse(raw) : null;

            if (!bucket || !bucket.resetAt || now >= bucket.resetAt) {
                bucket = {
                    count: 1,
                    resetAt: now + (decaySeconds * 1000)
                };
                cache.put(cacheKey, JSON.stringify(bucket), decaySeconds);
                return { passed: true };
            }

            if (bucket.count >= maxAttempts) {
                var retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
                return {
                    passed: false,
                    response: {
                        status: false,
                        code: 429,
                        message: "Too many attempts. Please try again in " + retryAfter + " seconds.",
                        retry_after: retryAfter
                    }
                };
            }

            bucket.count += 1;
            var remainingTtl = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
            cache.put(cacheKey, JSON.stringify(bucket), remainingTtl);
            return { passed: true };
        } catch (e) {
            return { passed: true };
        }
    }
};

function dispatchHttpRequest(e, defaultMethod) {
    var routeName = "";
    var rawMethod = String(defaultMethod || "GET").toUpperCase();
    var action = "";
    var context = null;

    try {
        if (!e) {
            return handleResponse({ status: false, code: 400, message: "Request event is required." }, e, null);
        }

        var rawParams = (e.parameter && typeof e.parameter === "object")
            ? Object.assign({}, e.parameter)
            : {};

        var rawPayload = {};
        if (defaultMethod === "POST") {
            if (e.postData && e.postData.contents) {
                var contentType = String(e.postData.type || "").toLowerCase();
                var trimmedBody = String(e.postData.contents).trim();
                var looksLikeJson = contentType.indexOf("application/json") !== -1 ||
                    trimmedBody.charAt(0) === "{" ||
                    trimmedBody.charAt(0) === "[";

                if (looksLikeJson && trimmedBody !== "") {
                    try {
                        rawPayload = JSON.parse(trimmedBody);
                    } catch (parseErr) {
                        var jsonErr = new Error("Invalid JSON request body: " + parseErr.message);
                        jsonErr.statusCode = 400;
                        throw jsonErr;
                    }
                } else if (trimmedBody !== "") {
                    var parsedForm = {};
                    trimmedBody.split("&").forEach(function (pair) {
                        if (!pair) return;
                        var eqIdx = pair.indexOf("=");
                        var rawK = eqIdx !== -1 ? pair.slice(0, eqIdx) : pair;
                        var rawV = eqIdx !== -1 ? pair.slice(eqIdx + 1) : "";
                        var key = decodeURIComponent(rawK.replace(/\+/g, " "));
                        var val = decodeURIComponent(rawV.replace(/\+/g, " "));
                        parsedForm[key] = val;
                        if (rawParams[key] === undefined) {
                            rawParams[key] = val;
                        }
                    });
                    rawPayload = Object.assign({}, rawParams, parsedForm);
                } else {
                    rawPayload = Object.assign({}, rawParams);
                }
            } else {
                rawPayload = Object.assign({}, rawParams);
            }
        }

        rawMethod = (rawParams._method || rawPayload._method || defaultMethod).toString().toUpperCase();

        if (rawMethod === "OPTIONS") {
            return handleResponse({ status: true, code: 204, message: "OK" }, e, null);
        }

        var rawRoute = "";
        if (rawParams.route !== undefined && rawParams.route !== null && String(rawParams.route).trim() !== "") {
            rawRoute = String(rawParams.route).trim();
        } else if (e.pathInfo !== undefined && e.pathInfo !== null) {
            rawRoute = String(e.pathInfo).trim();
        }

        routeName = rawRoute.replace(/^\/+|\/+$/g, "");

        var params = sanitizeClientPayload(rawParams);
        var payload = defaultMethod === "POST"
            ? sanitizeClientPayload(rawPayload)
            : {};

        action = payload.action || params.action || "";

        context = {
            event: e,
            headers: (e.headers && typeof e.headers === "object") ? e.headers : {},
            route: routeName,
            routeParams: {},
            method: rawMethod,
            action: action,
            params: params,
            payload: payload,
            auth: null,
            wantsJson: function () {
                var formatHint = String(this.params.format || this.payload.format || "").trim().toLowerCase();
                if (formatHint === "json") return true;
                if (formatHint === "html") return false;

                if (this.isApi === true) return true;
                if (this.isWeb === true) return false;

                var accept = String(this.headers.accept || this.headers.Accept || "").toLowerCase();
                if (accept.indexOf("application/json") !== -1 && accept.indexOf("text/html") === -1) {
                    return true;
                }

                var appMode = (typeof CONFIG !== "undefined" && typeof CONFIG.getOptional === "function")
                    ? String(CONFIG.getOptional("APP_MODE", "web") || "web").trim().toLowerCase()
                    : "web";

                return appMode !== "web";
            }
        };

        var resolution = Route.resolve(routeName, rawMethod, action);
        if (resolution.statusCode !== 200) {
            var resErr = new Error(resolution.message);
            resErr.statusCode = resolution.statusCode;
            var failPayload = (typeof formatErrorResponse === "function")
                ? formatErrorResponse(resErr, resolution.statusCode, resolution.message, context)
                : { status: false, code: resolution.statusCode, message: resolution.message };
            return handleResponse(failPayload, e, context);
        }

        var matchedRoute = resolution.route;
        var routeOpts = matchedRoute.options || {};
        if (routeOpts._isWeb === true || routeOpts.web === true || routeOpts.mode === "web") {
            context.isWeb = true;
        } else if (routeOpts._isResource === true || routeOpts._isApi === true || routeOpts.api === true || routeOpts.mode === "api") {
            context.isApi = true;
        }

        var routeParams = matchedRoute.routeParams || {};
        context.routeParams = routeParams;

        var paramKeys = Object.keys(routeParams);
        for (var p = 0; p < paramKeys.length; p++) {
            var pKey = paramKeys[p];
            if (params[pKey] === undefined) {
                params[pKey] = routeParams[pKey];
            }
        }

        for (var m = 0; m < matchedRoute.middlewares.length; m++) {
            var mwSpec = String(matchedRoute.middlewares[m]);
            var colonIdx = mwSpec.indexOf(":");
            var mwName = colonIdx !== -1 ? mwSpec.substring(0, colonIdx) : mwSpec;
            var mwParam = colonIdx !== -1 ? mwSpec.substring(colonIdx + 1) : null;

            var mwFn = Middlewares[mwName];
            if (typeof mwFn === "function") {
                var mwResult = mwFn(context, mwParam);
                if (!mwResult.passed) {
                    var mwResp = mwResult.response || { status: false, code: 401, message: "Unauthorized" };
                    if (!mwResp.code) mwResp.code = 401;
                    return handleResponse(mwResp, e, context);
                }
            }
        }

        var result = matchedRoute.handler(context);
        return handleResponse(result, e, context);
    } catch (error) {
        var statusCode = (error && error.statusCode) ? error.statusCode : 500;
        var ctxInfo = context || {
            route: routeName,
            method: rawMethod,
            action: action
        };
        var errorPayload = (typeof formatErrorResponse === "function")
            ? formatErrorResponse(error, statusCode, null, ctxInfo)
            : {
                status: false,
                code: statusCode,
                message: (typeof isDebugEnabled === "function" && isDebugEnabled() && error && error.message)
                    ? String(error.message)
                    : "Internal server error."
            };
        return handleResponse(errorPayload, e, ctxInfo);
    }
}
