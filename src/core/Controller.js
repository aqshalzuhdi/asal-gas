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
    static resolve(target) {
        return _resolveControllerClass(target);
    }

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

    respond(request, viewName, data, statusCode) {
        var code = statusCode || 200;
        if (request && typeof request.wantsJson === "function" && request.wantsJson()) {
            return {
                status: code < 400,
                code: code,
                data: data
            };
        }
        return view(viewName, data, code);
    }
}

var BaseController = Controller;
