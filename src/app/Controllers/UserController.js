class UserController extends Controller {
    _extractInput(request) {
        const nested = request.input("data");
        const raw = (nested && typeof nested === "object")
            ? Object.assign({}, nested)
            : request.only(["id", "name", "username", "email", "password"]);

        if (raw.name !== undefined && raw.name !== null) {
            raw.name = String(raw.name).trim();
        }
        if (raw.username !== undefined && raw.username !== null) {
            raw.username = String(raw.username).trim();
        }
        if (raw.email !== undefined && raw.email !== null) {
            raw.email = String(raw.email).trim().toLowerCase();
        }

        delete raw.session;
        delete raw.session_expires_at;

        return raw;
    }

    _resolveTargetId(request, routeId, inputData) {
        if (routeId !== undefined && routeId !== null && routeId !== "") {
            return routeId;
        }
        if (inputData && inputData.id !== undefined && inputData.id !== null && inputData.id !== "") {
            return inputData.id;
        }
        return request.input("id");
    }

    index(request) {
        return User.datatable(request);
    }

    store(request) {
        const data = this._extractInput(request);

        const validation = Validator.make(data, {
            name: "nullable|string|max:100",
            username: "required|string|min:3|max:50|unique:users,username",
            email: "nullable|email|unique:users,email",
            password: "required|string|min:6"
        });

        if (validation.fails()) {
            return {
                status: false,
                code: 422,
                message: validation.firstError(),
                errors: validation.errors()
            };
        }

        data.password = Hash.make(String(data.password));
        return User.create(data);
    }

    show(request, id) {
        const targetId = this._resolveTargetId(request, id, null);
        const user = User.find(targetId);

        if (!user) {
            return failResponse("User not found.", 404);
        }

        return {
            status: true,
            code: 200,
            data: user
        };
    }

    update(request, id) {
        const data = this._extractInput(request);
        const targetId = this._resolveTargetId(request, id, data);

        if (targetId === undefined || targetId === null || targetId === "") {
            return failResponse("User ID is required.", 422);
        }

        const user = User.find(targetId);
        if (!user) {
            return failResponse("User not found.", 404);
        }

        const validation = Validator.make(data, {
            name: "nullable|string|max:100",
            username: "nullable|string|min:3|max:50|unique:users,username," + user.id,
            email: "nullable|email|unique:users,email," + user.id,
            password: "nullable|string|min:6"
        });

        if (validation.fails()) {
            return {
                status: false,
                code: 422,
                message: validation.firstError(),
                errors: validation.errors()
            };
        }

        delete data.id;

        if (data.password !== undefined && data.password !== null && String(data.password).trim() !== "") {
            data.password = Hash.make(String(data.password));
        } else {
            delete data.password;
        }

        return User.update(user.id, data);
    }

    destroy(request, id) {
        const nested = request.input("data");
        const targetId = this._resolveTargetId(request, id, nested);

        if (targetId === undefined || targetId === null || targetId === "") {
            return failResponse("User ID is required.", 422);
        }

        const user = User.find(targetId);
        if (!user) {
            return failResponse("User not found.", 404);
        }

        return User.destroy(user.id);
    }
}
