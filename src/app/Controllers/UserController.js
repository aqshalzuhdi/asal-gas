var UserController = BaseController.init({
    sheet: "users",
    with: [],

    beforeStore: function (ctx) {
        return this._validateAndHashPassword(ctx, "create");
    },

    beforeUpdate: function (ctx) {
        return this._validateAndHashPassword(ctx, "update");
    },

    _validateAndHashPassword: function (ctx, mode) {
        var payload = ctx.payload || {};
        var data = payload.data;

        if (!data || typeof data !== "object") {
            return { status: false, message: "Payload data is required." };
        }

        if (data.username !== undefined) {
            data.username = String(data.username).trim();
        }

        var exceptId = mode === "update" && data.id !== undefined ? data.id : "";
        var rules = mode === "create"
            ? {
                name: "nullable|string|max:100",
                username: "required|string|min:3|max:50|unique:users,username",
                email: "nullable|email",
                password: "required|string|min:6"
            }
            : {
                id: "required",
                name: "nullable|string|max:100",
                username: "nullable|string|min:3|max:50|unique:users,username," + exceptId,
                email: "nullable|email",
                password: "nullable|string|min:6"
            };

        var validation = Validator.make(data, rules);
        if (validation.fails()) {
            return {
                status: false,
                code: 422,
                message: validation.firstError(),
                errors: validation.errors()
            };
        }

        if (mode === "create") {
            delete data.session;
            delete data.session_expires_at;
        }

        if (data.password !== undefined && data.password !== null && String(data.password).trim() !== "") {
            data.password = Hash.make(String(data.password));
        } else {
            delete data.password;
        }

        return { status: true };
    }
});
