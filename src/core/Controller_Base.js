var BaseController = {
    init: function (config) {
        var cfg = config || {};
        var defaultSheet = cfg.sheet || null;
        var defaultWith = Array.isArray(cfg.with) ? cfg.with : [];
        var defaultView = cfg.view || null;

        function defaultIndex(ctx, routeOpts) {
            var opts = routeOpts || {};
            var targetSheet = opts.sheet || this.sheet;
            var targetView = opts.view || this.defaultView;

            if (!targetSheet) {
                if (targetView && ctx && typeof ctx.wantsJson === "function" && !ctx.wantsJson()) {
                    return view(targetView, { params: ctx.params || {} });
                }
                return failResponse("404 Not Found", 404);
            }

            var relations = (opts.with !== undefined) ? opts.with : this.with;
            var flt = Object.assign({}, ctx.params);
            flt.with = (Array.isArray(relations) && relations.length > 0) ? relations : "none";

            var page = ctx.params.page || 1;
            var perPage = ctx.params.per_page || 10;
            var sort = ctx.params.sort || null;

            var res = read(targetSheet, flt, page, perPage, sort);

            if (targetView && ctx && typeof ctx.wantsJson === "function" && !ctx.wantsJson()) {
                return view(targetView, {
                    items: res.data || [],
                    meta: res.meta || null,
                    pagination: res.meta || null,
                    result: res
                });
            }

            return res;
        }

        function defaultStore(ctx, routeOpts) {
            var opts = routeOpts || {};
            var targetSheet = opts.sheet || this.sheet;
            if (!targetSheet) {
                return failResponse("404 Not Found", 404);
            }

            if (ctx.payload.data === undefined) {
                return failResponse("Payload data is required.", 422);
            }

            if (typeof this.beforeStore === "function") {
                var beforeRes = this.beforeStore(ctx);
                if (beforeRes && beforeRes.status === false) {
                    return beforeRes;
                }
            }

            var result = create(targetSheet, ctx.payload);

            if (typeof this.afterStore === "function") {
                var afterRes = this.afterStore(ctx, result);
                if (afterRes !== undefined) {
                    return afterRes;
                }
            }

            return result;
        }

        function defaultUpdate(ctx, routeOpts) {
            var opts = routeOpts || {};
            var targetSheet = opts.sheet || this.sheet;
            if (!targetSheet) {
                return failResponse("404 Not Found", 404);
            }

            if (ctx.payload.data === undefined) {
                return failResponse("Payload data is required.", 422);
            }

            if (typeof this.beforeUpdate === "function") {
                var beforeRes = this.beforeUpdate(ctx);
                if (beforeRes && beforeRes.status === false) {
                    return beforeRes;
                }
            }

            var result = update(targetSheet, ctx.payload);

            if (typeof this.afterUpdate === "function") {
                var afterRes = this.afterUpdate(ctx, result);
                if (afterRes !== undefined) {
                    return afterRes;
                }
            }

            return result;
        }

        function defaultDestroy(ctx, routeOpts) {
            var opts = routeOpts || {};
            var targetSheet = opts.sheet || this.sheet;
            if (!targetSheet) {
                return failResponse("404 Not Found", 404);
            }

            var targetId = ctx.payload.id !== undefined ? ctx.payload.id : ctx.params.id;
            if (targetId === undefined || targetId === "") {
                return failResponse("Payload id is required.", 422);
            }

            if (typeof this.beforeDestroy === "function") {
                var beforeRes = this.beforeDestroy(ctx, targetId);
                if (beforeRes && beforeRes.status === false) {
                    return beforeRes;
                }
            }

            var result = destroy(targetSheet, targetId);

            if (typeof this.afterDestroy === "function") {
                var afterRes = this.afterDestroy(ctx, targetId, result);
                if (afterRes !== undefined) {
                    return afterRes;
                }
            }

            return result;
        }

        function defaultRestore(ctx, routeOpts) {
            var opts = routeOpts || {};
            var targetSheet = opts.sheet || this.sheet;
            if (!targetSheet) {
                return failResponse("404 Not Found", 404);
            }

            var targetId = ctx.payload.id !== undefined ? ctx.payload.id : ctx.params.id;
            if (targetId === undefined || targetId === "") {
                return failResponse("Payload id is required.", 422);
            }

            if (typeof this.beforeRestore === "function") {
                var beforeRes = this.beforeRestore(ctx, targetId);
                if (beforeRes && beforeRes.status === false) {
                    return beforeRes;
                }
            }

            var result = restore(targetSheet, targetId);

            if (typeof this.afterRestore === "function") {
                var afterRes = this.afterRestore(ctx, targetId, result);
                if (afterRes !== undefined) {
                    return afterRes;
                }
            }

            return result;
        }

        function defaultForceDelete(ctx, routeOpts) {
            var opts = routeOpts || {};
            var targetSheet = opts.sheet || this.sheet;
            if (!targetSheet) {
                return failResponse("404 Not Found", 404);
            }

            var targetId = ctx.payload.id !== undefined ? ctx.payload.id : ctx.params.id;
            if (targetId === undefined || targetId === "") {
                return failResponse("Payload id is required.", 422);
            }

            if (typeof this.beforeForceDelete === "function") {
                var beforeRes = this.beforeForceDelete(ctx, targetId);
                if (beforeRes && beforeRes.status === false) {
                    return beforeRes;
                }
            }

            var result = forceDelete(targetSheet, targetId);

            if (typeof this.afterForceDelete === "function") {
                var afterRes = this.afterForceDelete(ctx, targetId, result);
                if (afterRes !== undefined) {
                    return afterRes;
                }
            }

            return result;
        }

        var controller = {
            sheet: defaultSheet,
            with: defaultWith,
            defaultView: defaultView,

            view: function (viewName, data, statusCode) {
                return view(viewName, data, statusCode);
            },

            respond: function (ctx, viewName, data, statusCode) {
                if (ctx && typeof ctx.wantsJson === "function" && ctx.wantsJson()) {
                    return {
                        status: true,
                        code: statusCode || 200,
                        message: "Success",
                        data: data !== undefined ? data : null
                    };
                }
                return view(viewName, data || {}, statusCode || 200);
            },

            index: typeof cfg.index === "function" ? cfg.index : defaultIndex,
            store: typeof cfg.store === "function" ? cfg.store : defaultStore,
            update: typeof cfg.update === "function" ? cfg.update : defaultUpdate,
            destroy: typeof cfg.destroy === "function" ? cfg.destroy : defaultDestroy,
            restore: typeof cfg.restore === "function" ? cfg.restore : defaultRestore,
            forceDelete: typeof cfg.forceDelete === "function" ? cfg.forceDelete : defaultForceDelete,

            superIndex: defaultIndex,
            superStore: defaultStore,
            superUpdate: defaultUpdate,
            superDestroy: defaultDestroy,
            superRestore: defaultRestore,
            superForceDelete: defaultForceDelete
        };

        var reservedKeys = {
            sheet: true,
            with: true,
            view: true,
            index: true,
            store: true,
            update: true,
            destroy: true,
            restore: true,
            forceDelete: true
        };

        Object.keys(cfg).forEach(function (key) {
            if (!reservedKeys[key]) {
                controller[key] = cfg[key];
            }
        });

        return controller;
    }
};
