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
        if (!_routes[routeName]) {
            _routes[routeName] = [];
        }

        var opts = options || {};
        var normalizedMethods = [];
        for (var i = 0; i < methods.length; i++) {
            normalizedMethods.push(String(methods[i]).toUpperCase());
        }

        _routes[routeName].push({
            methods: normalizedMethods,
            action: opts.action || null,
            middlewares: currentMiddlewares(),
            handlerSpec: handlerSpec,
            options: opts
        });

        return Route;
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

        resource: function (routeName, controller, options) {
            var ctrl = controller;
            var opts = options || {};

            if (
                ctrl &&
                typeof ctrl === "object" &&
                typeof ctrl.index !== "function" &&
                typeof ctrl.store !== "function"
            ) {
                opts = ctrl;
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

            var normalizedRoute = routeName === "/" ? "" : routeName;
            var entries = _routes[normalizedRoute] || (normalizedRoute === "" ? _routes["/"] : null);

            var validEntries = [];
            for (var v = 0; v < entries.length; v++) {
                var resolvedFn = resolveHandler(entries[v].handlerSpec);
                if (resolvedFn) {
                    validEntries.push({
                        methods: entries[v].methods,
                        action: entries[v].action,
                        middlewares: entries[v].middlewares,
                        options: entries[v].options,
                        handler: resolvedFn
                    });
                }
            }

            if (validEntries.length === 0) {
                return { statusCode: 404, message: "404 Not Found" };
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
    try {
        if (!e || !e.parameter) {
            return handleResponse({ status: false, message: "Request parameters are required." });
        }

        var rawPayload = {};
        if (defaultMethod === "POST") {
            if (e.postData && e.postData.contents) {
                try {
                    rawPayload = JSON.parse(e.postData.contents);
                } catch (parseErr) {
                    rawPayload = e.parameter || {};
                }
            } else {
                rawPayload = e.parameter || {};
            }
        }

        var rawMethod = (e.parameter._method || rawPayload._method || defaultMethod).toString().toUpperCase();

        if (rawMethod === "OPTIONS") {
            return handleResponse({ status: true, code: 204, message: "OK" });
        }

        var routeName = e.parameter.route !== undefined && e.parameter.route !== null
            ? String(e.parameter.route).trim()
            : "";

        var params = sanitizeClientPayload(e.parameter);
        var payload = defaultMethod === "POST"
            ? sanitizeClientPayload(rawPayload)
            : {};

        var action = payload.action || params.action || "";

        var resolution = Route.resolve(routeName, rawMethod, action);
        if (resolution.statusCode !== 200) {
            return handleResponse({
                status: false,
                code: resolution.statusCode,
                message: resolution.message
            });
        }

        var matchedRoute = resolution.route;
        var context = {
            event: e,
            route: routeName,
            method: rawMethod,
            action: action,
            params: params,
            payload: payload,
            auth: null
        };

        for (var m = 0; m < matchedRoute.middlewares.length; m++) {
            var mwSpec = String(matchedRoute.middlewares[m]);
            var colonIdx = mwSpec.indexOf(":");
            var mwName = colonIdx !== -1 ? mwSpec.substring(0, colonIdx) : mwSpec;
            var mwParam = colonIdx !== -1 ? mwSpec.substring(colonIdx + 1) : null;

            var mwFn = Middlewares[mwName];
            if (typeof mwFn === "function") {
                var mwResult = mwFn(context, mwParam);
                if (!mwResult.passed) {
                    return handleResponse(mwResult.response);
                }
            }
        }

        var result = matchedRoute.handler(context);
        return handleResponse(result);
    } catch (error) {
        return handleResponse({ status: false, message: error.message });
    }
}
