function _resolveControllerClass(target) {
    if (!target) return null;

    if (typeof target === "string") {
        var clean = target.trim();
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(clean)) return null;

        if (typeof globalThis !== "undefined" && globalThis[clean] !== undefined) {
            target = globalThis[clean];
        } else {
            try {
                target = (new Function("return typeof " + clean + " !== 'undefined' ? " + clean + " : null;"))();
            } catch (_) {
                return null;
            }
        }
    }

    if (typeof target === "function") {
        if (!target.__singletonInstance) {
            target.__singletonInstance = new target();
        }
        return target.__singletonInstance;
    }

    return typeof target === "object" ? target : null;
}

class Controller {
    constructor() {
        this.model = null;
        this.sheet = null;
        this.with = [];
        this.primaryKey = "id";
    }

    static resolve(target) {
        return _resolveControllerClass(target);
    }

    // Backward compatibility untuk controller lama yang memakai BaseController.init({...})
    static init(definition) {
        var instance = new Controller();
        var def = definition || {};
        var keys = Object.keys(def);

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            instance[key] = typeof def[key] === "function"
                ? def[key].bind(instance)
                : def[key];
        }

        return instance;
    }

    _extractPayloadData(ctx) {
        var payload = (ctx && ctx.payload) || {};
        if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
            return payload.data;
        }
        return payload;
    }

    _resolveRecordId(ctx, data) {
        var pk = this.model ? this.model.getPrimaryKey() : (this.primaryKey || "id");
        if (ctx && ctx.routeParams && ctx.routeParams[pk] !== undefined && ctx.routeParams[pk] !== "") {
            return ctx.routeParams[pk];
        }
        if (data && data[pk] !== undefined && data[pk] !== "") {
            return data[pk];
        }
        if (ctx && ctx.payload && ctx.payload[pk] !== undefined && ctx.payload[pk] !== "") {
            return ctx.payload[pk];
        }
        if (ctx && ctx.params && ctx.params[pk] !== undefined && ctx.params[pk] !== "") {
            return ctx.params[pk];
        }
        return null;
    }

    respond(ctx, viewName, data, statusCode) {
        var code = statusCode || 200;
        if (ctx && typeof ctx.wantsJson === "function" && ctx.wantsJson()) {
            return {
                status: code < 400,
                code: code,
                data: data
            };
        }
        return view(viewName, data, code);
    }

    index(ctx) {
        var params = (ctx && ctx.params) || {};
        var page = parseInt(params.page, 10) || 1;
        var perPage = parseInt(params.per_page, 10) || 15;
        var sort = params.sort || null;

        var reserved = {
            route: true,
            session: true,
            page: true,
            per_page: true,
            sort: true,
            with: true,
            with_trashed: true,
            only_trashed: true
        };

        var filters = {};
        var paramKeys = Object.keys(params);
        for (var i = 0; i < paramKeys.length; i++) {
            var key = paramKeys[i];
            if (!reserved[key] && params[key] !== undefined && params[key] !== "") {
                filters[key] = params[key];
            }
        }

        if (this.model) {
            var qb = this.model.query();
            if (Array.isArray(this.with) && this.with.length > 0) {
                qb.with(this.with);
            }
            if (params.with_trashed === true || params.with_trashed === "true" || params.with_trashed === "1") {
                qb.withTrashed();
            }
            if (params.only_trashed === true || params.only_trashed === "true" || params.only_trashed === "1") {
                qb.onlyTrashed();
            }
            if (Object.keys(filters).length > 0) {
                qb.where(filters);
            }
            if (sort) {
                var desc = String(sort).charAt(0) === "-";
                var col = desc ? String(sort).slice(1) : String(sort);
                qb.orderBy(col, desc ? "desc" : "asc");
            }
            return qb.paginate(perPage, page);
        }

        var readFilters = Object.assign({}, filters, {
            with: Array.isArray(this.with) && this.with.length > 0 ? this.with : "none"
        });
        return read(this.sheet, readFilters, page, perPage, sort);
    }

    show(ctx) {
        var id = this._resolveRecordId(ctx, null);
        if (!id) {
            return failResponse("Record ID is required.", 400);
        }

        if (this.model) {
            var qb = this.model.query();
            if (Array.isArray(this.with) && this.with.length > 0) {
                qb.with(this.with);
            }
            var item = qb.find(id);
            if (!item) {
                return failResponse("Record not found.", 404);
            }
            return { status: true, data: item };
        }

        var res = read(this.sheet, {
            id: id,
            with: Array.isArray(this.with) && this.with.length > 0 ? this.with : "none"
        }, 1, 1);

        var row = (res && res.status && Array.isArray(res.data) && res.data[0]) ? res.data[0] : null;
        if (!row) {
            return failResponse("Record not found.", 404);
        }
        return { status: true, data: row };
    }

    store(ctx) {
        if (typeof this.beforeStore === "function") {
            var hookRes = this.beforeStore(ctx);
            if (hookRes && hookRes.status === false) {
                return hookRes;
            }
        }

        var data = this._extractPayloadData(ctx);
        var created = this.model
            ? this.model.create(data)
            : create(this.sheet, { data: data });

        if (created && created.status && typeof this.afterStore === "function") {
            var afterRes = this.afterStore(ctx, created);
            if (afterRes !== undefined) return afterRes;
        }

        return created;
    }

    update(ctx) {
        if (typeof this.beforeUpdate === "function") {
            var hookRes = this.beforeUpdate(ctx);
            if (hookRes && hookRes.status === false) {
                return hookRes;
            }
        }

        var data = this._extractPayloadData(ctx);
        var id = this._resolveRecordId(ctx, data);
        if (!id) {
            return failResponse("Record ID is required.", 400);
        }

        var updated = this.model
            ? this.model.update(id, data)
            : update(this.sheet, { data: Object.assign({}, data, { id: id }) });

        if (updated && updated.status && typeof this.afterUpdate === "function") {
            var afterRes = this.afterUpdate(ctx, updated);
            if (afterRes !== undefined) return afterRes;
        }

        return updated;
    }

    destroy(ctx) {
        if (typeof this.beforeDestroy === "function") {
            var hookRes = this.beforeDestroy(ctx);
            if (hookRes && hookRes.status === false) {
                return hookRes;
            }
        }

        var id = this._resolveRecordId(ctx, null);
        if (!id) {
            return failResponse("Record ID is required.", 400);
        }

        var deleted = this.model
            ? this.model.destroy(id)
            : destroy(this.sheet, id);

        if (deleted && deleted.status && typeof this.afterDestroy === "function") {
            var afterRes = this.afterDestroy(ctx, id, deleted);
            if (afterRes !== undefined) return afterRes;
        }

        return deleted;
    }

    restore(ctx) {
        var id = this._resolveRecordId(ctx, null);
        if (!id) {
            return failResponse("Record ID is required.", 400);
        }
        if (this.model) {
            return this.model.restore(id);
        }
        return typeof restore === "function"
            ? restore(this.sheet, id)
            : update(this.sheet, { data: { id: id, deleted_at: "" } });
    }

    forceDelete(ctx) {
        var id = this._resolveRecordId(ctx, null);
        if (!id) {
            return failResponse("Record ID is required.", 400);
        }
        if (this.model) {
            return this.model.forceDelete(id);
        }
        return typeof forceDelete === "function"
            ? forceDelete(this.sheet, id)
            : destroy(this.sheet, id);
    }
}

Controller.prototype.superIndex = Controller.prototype.index;
Controller.prototype.superShow = Controller.prototype.show;
Controller.prototype.superStore = Controller.prototype.store;
Controller.prototype.superUpdate = Controller.prototype.update;
Controller.prototype.superDestroy = Controller.prototype.destroy;

var BaseController = Controller;
