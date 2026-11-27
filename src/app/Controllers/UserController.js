class UserController extends Controller {
    model = User;
    with = [];

    beforeStore(ctx) {
        return this.validateAndPrepare(ctx, "create");
    }

    beforeUpdate(ctx) {
        return this.validateAndPrepare(ctx, "update");
    }

    validateAndPrepare(ctx, mode) {
        const payload = ctx.payload || {};
        const data = payload.data;

        if (!data || typeof data !== "object") {
            return { status: false, code: 422, message: "Payload data is required." };
        }

        if (mode === "update" && (data.id === undefined || data.id === null || data.id === "")) {
            const resolvedId = (ctx.routeParams && ctx.routeParams.id) ||
                payload.id ||
                (ctx.params && ctx.params.id);
            if (resolvedId !== undefined && resolvedId !== null && resolvedId !== "") {
                data.id = resolvedId;
            }
        }

        if (data.name !== undefined && data.name !== null) {
            data.name = String(data.name).trim();
        }
        if (data.username !== undefined && data.username !== null) {
            data.username = String(data.username).trim();
        }
        if (data.email !== undefined && data.email !== null) {
            data.email = String(data.email).trim().toLowerCase();
        }

        const exceptId = mode === "update" && data.id !== undefined ? data.id : "";
        const rules = mode === "create"
            ? {
                name: "nullable|string|max:100",
                username: "required|string|min:3|max:50|unique:users,username",
                email: "nullable|email|unique:users,email",
                password: "required|string|min:6"
            }
            : {
                id: "required",
                name: "nullable|string|max:100",
                username: "nullable|string|min:3|max:50|unique:users,username," + exceptId,
                email: "nullable|email|unique:users,email," + exceptId,
                password: "nullable|string|min:6"
            };

        const validation = Validator.make(data, rules);
        if (validation.fails()) {
            return {
                status: false,
                code: 422,
                message: validation.firstError(),
                errors: validation.errors()
            };
        }

        delete data.session;
        delete data.session_expires_at;

        if (data.password !== undefined && data.password !== null && String(data.password).trim() !== "") {
            data.password = Hash.make(String(data.password));
        } else {
            delete data.password;
        }

        return { status: true };
    }
}
