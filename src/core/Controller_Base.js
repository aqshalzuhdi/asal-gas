var BaseController = {
    init: function (config) {
        var cfg = config || {};
        var defaultSheet = cfg.sheet || null;
        var defaultWith = Array.isArray(cfg.with) ? cfg.with : [];

        function defaultIndex(ctx, routeOpts) {
            var opts = routeOpts || {};
            var targetSheet = opts.sheet || this.sheet;
            if (!targetSheet) {
                return { status: false, code: 404, message: "404 Not Found" };
            }

            var relations = (opts.with !== undefined) ? opts.with : this.with;
            var flt = Object.assign({}, ctx.params);
            flt.with = (Array.isArray(relations) && relations.length > 0) ? relations : "none";

            var page = ctx.params.page || 1;
            var perPage = ctx.params.per_page || 10;
            var sort = ctx.params.sort || null;

            return read(targetSheet, flt, page, perPage, sort);
        }

        function defaultStore(ctx, routeOpts) {
            var opts = routeOpts || {};
            var targetSheet = opts.sheet || this.sheet;
            if (!targetSheet) {
                return { status: false, code: 404, message: "404 Not Found" };
            }

            if (ctx.payload.data === undefined) {
                return { status: false, message: "Payload data is required." };
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
                return { status: false, code: 404, message: "404 Not Found" };
            }

            if (ctx.payload.data === undefined) {
                return { status: false, message: "Payload data is required." };
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
                return { status: false, code: 404, message: "404 Not Found" };
            }

            var targetId = ctx.payload.id !== undefined ? ctx.payload.id : ctx.params.id;
            if (targetId === undefined || targetId === "") {
                return { status: false, message: "Payload id is required." };
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
                return { status: false, code: 404, message: "404 Not Found" };
            }

            var targetId = ctx.payload.id !== undefined ? ctx.payload.id : ctx.params.id;
            if (targetId === undefined || targetId === "") {
                return { status: false, message: "Payload id is required." };
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
                return { status: false, code: 404, message: "404 Not Found" };
            }

            var targetId = ctx.payload.id !== undefined ? ctx.payload.id : ctx.params.id;
            if (targetId === undefined || targetId === "") {
                return { status: false, message: "Payload id is required." };
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
            index: true,
            store: true,
            update: true,
            destroy: true,
            restore: true,
            forceDelete: true
        };

        Object.keys(cfg).forEach(function (key) {
            if (!reservedKeys[key] && typeof cfg[key] === "function") {
                controller[key] = cfg[key];
            }
        });

        return controller;
    }
};
