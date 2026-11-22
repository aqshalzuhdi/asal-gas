var Route = (function () {
    var _routes = {};
    var _middlewareStack = [];
    var _booted = false;

    function boot() {
        if (_booted) return;
        _booted = true;
        if (typeof registerRoutes === "function") {
            registerRoutes();
        }
    }

    function normalizeRoutePath(rawPath) {
        if (rawPath === undefined || rawPath === null) return "";
        return String(rawPath).trim().replace(/^\/+|\/+$/g, "");
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

    function register(methods, routeName, handlerSpec, options) {
        var cleanRoute = normalizeRoutePath(routeName);
        if (!_routes[cleanRoute]) {
            _routes[cleanRoute] = [];
        }

        var opts = options || {};
        var normalizedMethods = [];
        for (var i = 0; i < methods.length; i++) {
            normalizedMethods.push(String(methods[i]).toUpperCase());
        }

        _routes[cleanRoute].push({
            methods: normalizedMethods,
            action: opts.action || null,
            middlewares: currentMiddlewares(),
            handlerSpec: handlerSpec,
            options: opts
        });

        return Route;
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

        view: function (routeName, handlerSpec, options) {
            return register(["GET"], routeName, handlerSpec, Object.assign({}, options, { web: true }));
        },

        resource: function (routeName, controller, options) {
            var ctrl = controller;
            var opts = Object.assign({}, options || {}, { _isResource: true });

            if (
                ctrl &&
                typeof ctrl === "object" &&
                typeof ctrl.index !== "function" &&
                typeof ctrl.store !== "function"
            ) {
                opts = Object.assign({}, ctrl, { _isResource: true });
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

        resolve: function (routeName, method, action) {
            boot();

            var normalizedRoute = normalizeRoutePath(routeName);
            var routeParams = {};
            var entries = _routes[normalizedRoute] || (normalizedRoute === "" ? _routes["/"] : null);

            if (!entries) {
                var dynamicMatch = matchDynamicRoute(normalizedRoute);
                if (dynamicMatch) {
                    entries = dynamicMatch.entries;
                    routeParams = dynamicMatch.routeParams;
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

            return { statusCode: 200, route: matchedEntry };
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

        var rawParams = (e.parameter && typeof e.parameter === "object") ? e.parameter : {};

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
                } else {
                    rawPayload = rawParams;
                }
            } else {
                rawPayload = rawParams;
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
            route: routeName,
            routeParams: {},
            method: rawMethod,
            action: action,
            params: params,
            payload: payload,
            auth: null
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
        if (routeOpts.web === true || routeOpts.mode === "web") {
            context.isWeb = true;
        } else if (routeOpts._isResource === true || routeOpts.api === true || routeOpts.mode === "api") {
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
