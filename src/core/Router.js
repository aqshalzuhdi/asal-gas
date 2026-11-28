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
                var lower = raw.toLowerCase();
                if (lower === "true" || lower === "1") return "api";
                return (lower === "none" || lower === "false" || lower === "0" || raw === "-") ? "" : raw;
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

        if (getAppMode() === "web" && typeof registerWebRoutes === "function") {
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

    function resolveControllerTarget(target) {
        if (!target) return null;
        if (typeof Controller !== "undefined" && typeof Controller.resolve === "function") {
            return Controller.resolve(target);
        }
        if (typeof target === "string") {
            return globalThis[target.trim()] || null;
        }
        if (typeof target === "function") {
            if (!target.__singletonInstance) {
                target.__singletonInstance = new target();
            }
            return target.__singletonInstance;
        }
        return typeof target === "object" ? target : null;
    }

    function invokeControllerMethod(ctrlObj, methodName, ctx, extraArgs) {
        var routeValues = [];
        if (ctx && ctx.routeParams && typeof ctx.routeParams === "object") {
            var keys = Object.keys(ctx.routeParams);
            for (var i = 0; i < keys.length; i++) {
                routeValues.push(ctx.routeParams[keys[i]]);
            }
        }
        var callArgs = [ctx].concat(routeValues).concat(extraArgs || []);
        return ctrlObj[methodName].apply(ctrlObj, callArgs);
    }

    function resolveHandler(handlerSpec) {
        if (!handlerSpec) return null;

        if (typeof handlerSpec === "function") {
            if (typeof Controller !== "undefined" && handlerSpec.prototype instanceof Controller) {
                return null;
            }
            return function (ctx) {
                var routeValues = [];
                if (ctx && ctx.routeParams && typeof ctx.routeParams === "object") {
                    var keys = Object.keys(ctx.routeParams);
                    for (var i = 0; i < keys.length; i++) {
                        routeValues.push(ctx.routeParams[keys[i]]);
                    }
                }
                return handlerSpec.apply(null, [ctx].concat(routeValues));
            };
        }

        if (Array.isArray(handlerSpec)) {
            if (handlerSpec.length < 2) return null;
            var arrCtrl = resolveControllerTarget(handlerSpec[0]);
            var arrMethod = String(handlerSpec[1] || "").trim();

            if (!arrCtrl || typeof arrCtrl !== "object") return null;
            if (!arrMethod || typeof arrCtrl[arrMethod] !== "function") return null;

            return function (ctx) {
                return invokeControllerMethod(arrCtrl, arrMethod, ctx, []);
            };
        }

        if (typeof handlerSpec === "string") {
            var parts = handlerSpec.split("@");
            if (parts.length !== 2) return null;

            var ctrlName = parts[0].trim();
            var methodName = parts[1].trim();
            var ctrlObj = resolveControllerTarget(ctrlName);

            if (!ctrlObj || typeof ctrlObj !== "object") return null;
            if (typeof ctrlObj[methodName] !== "function") return null;

            return function (ctx) {
                return invokeControllerMethod(ctrlObj, methodName, ctx, []);
            };
        }

        if (typeof handlerSpec === "object") {
            var targetCtrl = resolveControllerTarget(handlerSpec.controller);

            if (!targetCtrl || typeof targetCtrl !== "object") return null;
            if (typeof targetCtrl[handlerSpec.method] !== "function") return null;

            return function (ctx) {
                return invokeControllerMethod(targetCtrl, handlerSpec.method, ctx, handlerSpec.args || []);
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
        var opts = Object.assign({}, options || {});

        if ((_currentRouteLayer === "web" || opts.web === true) && appMode !== "web") {
            return buildFluentBuilder([]);
        }

        if (!_routes[cleanRoute]) {
            _routes[cleanRoute] = [];
        }

        var apiPrefix = getApiPrefix();
        if (
            _currentRouteLayer === "api" ||
            appMode !== "web" ||
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

        var hasMutatingMethod = normalizedMethods.some(function (m) {
            return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
        });

        var routeMiddlewares = currentMiddlewares();
        if (opts._isWeb && hasMutatingMethod && !opts.withoutCsrf && routeMiddlewares.indexOf("csrf") === -1) {
            routeMiddlewares.unshift("csrf");
        }

        var entryObj = {
            methods: normalizedMethods,
            action: opts.action || null,
            name: opts.name || null,
            middlewares: routeMiddlewares,
            handlerSpec: handlerSpec,
            options: opts
        };

        if (opts.name && !_namedRoutes[String(opts.name).trim()]) {
            _namedRoutes[String(opts.name).trim()] = cleanRoute;
        }

        _routes[cleanRoute].push(entryObj);
        return buildFluentBuilder([{ path: cleanRoute, entry: entryObj }]);
    }

    function resolveApiIndexEntries(normalizedRoute) {
        var apiPrefix = getApiPrefix();
        var isIndexRequest = (
            normalizedRoute === "" ||
            normalizedRoute === "index" ||
            (apiPrefix !== "" && (normalizedRoute === apiPrefix || normalizedRoute === apiPrefix + "/index"))
        );

        if (!isIndexRequest) {
            return null;
        }

        var candidates = [];
        if (normalizedRoute === "index" || (apiPrefix !== "" && normalizedRoute === apiPrefix + "/index")) {
            if (apiPrefix !== "") {
                candidates.push(apiPrefix + "/index", apiPrefix);
            }
            candidates.push("index", "");
        } else {
            if (apiPrefix !== "") {
                candidates.push(apiPrefix, apiPrefix + "/index");
            }
            candidates.push("", "index");
        }

        for (var i = 0; i < candidates.length; i++) {
            var key = candidates[i];
            if (_routes[key] && _routes[key].length > 0) {
                return _routes[key];
            }
        }

        return null;
    }

    function resolveResourceAbilities(opts, isApiOnly) {
        var all = isApiOnly
            ? ["index", "store", "show", "update", "destroy"]
            : ["index", "create", "store", "show", "edit", "update", "destroy"];

        function expandTokens(list) {
            var map = {};
            for (var i = 0; i < list.length; i++) {
                var token = String(list[i]).trim();
                var upper = token.toUpperCase();
                if (upper === "GET") {
                    map.index = true;
                    map.show = true;
                    if (!isApiOnly) {
                        map.create = true;
                        map.edit = true;
                    }
                } else if (upper === "POST") {
                    map.store = true;
                    map.update = true;
                    map.destroy = true;
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

    function registerResourceRoutes(routeName, controller, options, isApiOnly) {
        var ctrl = controller;
        var baseFlag = isApiOnly ? { _isResource: true, _isApi: true } : { _isResource: true };
        var opts = Object.assign({}, options || {}, baseFlag);

        if (
            ctrl &&
            typeof ctrl === "object" &&
            !Array.isArray(ctrl) &&
            typeof ctrl.index !== "function" &&
            typeof ctrl.store !== "function"
        ) {
            opts = Object.assign({}, ctrl, baseFlag);
            ctrl = null;
        }

        var cleanBase = normalizeRoutePath(routeName);
        var resourcePrefix = opts.as || cleanBase.split("/").pop();
        var abilities = resolveResourceAbilities(opts, isApiOnly);
        var registeredRefs = [];

        function addResRoute(methods, path, methodName, actionName, routeAlias) {
            var routeOptions = Object.assign({}, opts, {
                action: actionName || null,
                name: routeAlias || null
            });
            var builder = register(methods, path, {
                controller: ctrl,
                method: methodName
            }, routeOptions);
            return builder;
        }

        if (abilities.indexOf("index") !== -1) {
            addResRoute(["GET"], cleanBase, "index", null, resourcePrefix ? resourcePrefix + ".index" : null);
        }

        if (!isApiOnly && abilities.indexOf("create") !== -1) {
            addResRoute(["GET"], cleanBase + "/create", "create", null, resourcePrefix ? resourcePrefix + ".create" : null);
        }

        if (abilities.indexOf("store") !== -1) {
            addResRoute(["POST"], cleanBase, "store", "create", resourcePrefix ? resourcePrefix + ".store" : null);
            addResRoute(["POST"], cleanBase, "store", null, null);
        }

        if (abilities.indexOf("show") !== -1) {
            addResRoute(["GET"], cleanBase + "/:id", "show", null, resourcePrefix ? resourcePrefix + ".show" : null);
        }

        if (!isApiOnly && abilities.indexOf("edit") !== -1) {
            addResRoute(["GET"], cleanBase + "/:id/edit", "edit", null, resourcePrefix ? resourcePrefix + ".edit" : null);
        }

        if (abilities.indexOf("update") !== -1) {
            addResRoute(["PUT", "PATCH"], cleanBase + "/:id", "update", null, resourcePrefix ? resourcePrefix + ".update" : null);
            addResRoute(["POST"], cleanBase + "/:id", "update", "update", null);
            addResRoute(["POST"], cleanBase + "/:id", "update", null, null);
            addResRoute(["POST"], cleanBase, "update", "update", null);
        }

        if (abilities.indexOf("destroy") !== -1) {
            addResRoute(["DELETE"], cleanBase + "/:id", "destroy", null, resourcePrefix ? resourcePrefix + ".destroy" : null);
            addResRoute(["POST"], cleanBase + "/:id", "destroy", "delete", null);
            addResRoute(["POST"], cleanBase, "destroy", "delete", null);
        }

        return Route;
    }

    function inferControllerSheetLabel(controllerRef) {
        if (!controllerRef) return "-";

        if (typeof Model !== "undefined" && typeof Model.extractModelsFromTarget === "function") {
            var discovered = Model.extractModelsFromTarget(controllerRef);
            if (discovered.length > 0) {
                return discovered.map(function (item) {
                    return item.error
                        ? item.table + " [Model Error: " + item.error + "]"
                        : item.table;
                }).join(", ");
            }
        }

        var rawName = "";
        if (typeof controllerRef === "string") {
            rawName = controllerRef.trim();
        } else if (typeof controllerRef === "function" && controllerRef.name) {
            rawName = controllerRef.name;
        } else if (typeof controllerRef === "object" && controllerRef.constructor && controllerRef.constructor.name) {
            rawName = controllerRef.constructor.name;
        }

        if (rawName && rawName !== "Controller" && rawName !== "Object") {
            var stripped = rawName.replace(/Controller$/i, "");
            if (stripped) {
                var snake = stripped
                    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
                    .replace(/[^a-zA-Z0-9]+/g, "_")
                    .replace(/^_+|_+$/g, "")
                    .toLowerCase();
                if (/[^aeiou]y$/.test(snake)) return snake.replace(/y$/, "ies");
                if (/(s|x|z|ch|sh)$/.test(snake)) return snake + "es";
                return snake + "s";
            }
        }

        return "-";
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
            return registerResourceRoutes(routeName, controller, options, false);
        },

        apiResource: function (routeName, controller, options) {
            return registerResourceRoutes(routeName, controller, options, true);
        },

        resolveName: function (name) {
            boot();
            return _namedRoutes[String(name || "").trim()] || null;
        },

        resolve: function (routeName, method, action) {
            boot();

            var normalizedRoute = normalizeRoutePath(routeName);
            var routeParams = {};
            var entries = null;

            if (getAppMode() !== "web") {
                entries = resolveApiIndexEntries(normalizedRoute);
            }

            if (!entries) {
                entries = _routes[normalizedRoute] || (normalizedRoute === "" ? _routes["/"] : null);
            }

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
                    var specDesc = typeof entries[v].handlerSpec === "string"
                        ? entries[v].handlerSpec
                        : Array.isArray(entries[v].handlerSpec)
                            ? ((entries[v].handlerSpec[0] && entries[v].handlerSpec[0].name) || String(entries[v].handlerSpec[0])) + "@" + entries[v].handlerSpec[1]
                            : JSON.stringify(entries[v].handlerSpec);
                    brokenSpecs.push(specDesc);
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
                    var controllerRef = null;

                    if (typeof entry.handlerSpec === "string") {
                        handlerLabel = entry.handlerSpec;
                        controllerRef = entry.handlerSpec.split("@")[0].trim();
                    } else if (Array.isArray(entry.handlerSpec) && entry.handlerSpec.length >= 2) {
                        controllerRef = entry.handlerSpec[0];
                        var tupleCtrlName = typeof controllerRef === "string"
                            ? controllerRef
                            : (controllerRef && controllerRef.name ? controllerRef.name : "Controller");
                        handlerLabel = tupleCtrlName + "@" + entry.handlerSpec[1];
                    } else if (entry.handlerSpec && typeof entry.handlerSpec === "object") {
                        controllerRef = entry.handlerSpec.controller;
                        var ctrlName = typeof controllerRef === "string"
                            ? controllerRef
                            : (controllerRef && controllerRef.name ? controllerRef.name : "Controller");
                        handlerLabel = ctrlName + "@" + entry.handlerSpec.method;
                    }

                    var sheetLabel = (entry.options && entry.options.sheet)
                        ? entry.options.sheet
                        : inferControllerSheetLabel(controllerRef);

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
        var cacheKey = prefix + "THROTTLE_" + ctx._routePath + "_" + cleanId;

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
    },

    csrf: function (ctx) {
        var method = String((ctx && ctx.method) || "GET").toUpperCase();
        if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
            return { passed: true };
        }

        var params = (ctx && ctx.params) || {};
        var payload = (ctx && ctx.payload) || {};
        var headers = (ctx && ctx.headers) || {};

        var submittedToken =
            payload._token ||
            payload.csrf_token ||
            params._token ||
            params.csrf_token ||
            headers["x-csrf-token"] ||
            headers["X-CSRF-TOKEN"] ||
            headers["x-xsrf-token"] ||
            headers["X-XSRF-TOKEN"] ||
            "";

        if (typeof Csrf === "undefined") {
            return {
                passed: false,
                response: {
                    status: false,
                    code: 500,
                    message: "Csrf module is not loaded."
                }
            };
        }

        var check = typeof Csrf.verifyDetailed === "function"
            ? Csrf.verifyDetailed(String(submittedToken))
            : { valid: Csrf.verify(String(submittedToken)), reason: "verification_failed" };

        if (!check.valid) {
            var debugMsg = (typeof isDebugEnabled === "function" && isDebugEnabled())
                ? "CSRF token mismatch or expired (" + check.reason + ")."
                : "CSRF token mismatch or expired.";

            return {
                passed: false,
                response: {
                    status: false,
                    code: 419,
                    message: debugMsg
                }
            };
        }

        return { passed: true };
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

        var baseContextData = {
            event: e,
            headers: (e.headers && typeof e.headers === "object") ? e.headers : {},
            route: routeName,
            routeParams: {},
            method: rawMethod,
            action: action,
            params: params,
            payload: payload,
            auth: null
        };

        context = typeof Request === "function"
            ? new Request(baseContextData)
            : Object.assign(baseContextData, {
                _routePath: routeName,
                wantsJson: function () { return true; }
            });

        var resolution = Route.resolve(routeName, rawMethod, action);
        if (resolution.statusCode !== 200) {
            return handleResponse({
                status: false,
                code: resolution.statusCode,
                message: resolution.message
            }, e, context);
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
