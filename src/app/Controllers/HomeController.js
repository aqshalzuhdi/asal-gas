class HomeController extends Controller {
    model = User;
    with = [];

    index(ctx) {
        const res = super.index(ctx);
        if (ctx.wantsJson()) return res;

        return view("home", {
            title: "Home",
            user: { name: "Aqshal" },
            items: res.data || [],
            meta: res.meta || null
        });
    }

    create(ctx) {
        return view("users.create", {
            title: "Add User",
            errors: {},
            old: {}
        });
    }

    store(ctx) {
        // Support payloads from HTML <form> (ctx.payload.name) and JSON API (ctx.payload.data.name)
        const rawInput = (ctx.payload && ctx.payload.data && typeof ctx.payload.data === "object")
            ? ctx.payload.data
            : (ctx.payload || {});

        const input = {
            name: rawInput.name !== undefined ? String(rawInput.name).trim() : "",
            username: rawInput.username !== undefined ? String(rawInput.username).trim() : "",
            email: rawInput.email !== undefined ? String(rawInput.email).trim().toLowerCase() : "",
            password: rawInput.password !== undefined ? String(rawInput.password) : ""
        };

        const validator = Validator.make(input, {
            name: "required|string|min:3|max:100",
            username: "required|string|min:3|max:50|unique:users,username",
            email: "required|email|unique:users,email",
            password: "required|string|min:6"
        });

        if (validator.fails()) {
            if (ctx.wantsJson()) {
                return failResponse(validator.firstError(), 422, {
                    errors: validator.errors()
                });
            }

            return view("users.create", {
                title: "Add User",
                errors: validator.errors(),
                old: {
                    name: input.name,
                    username: input.username,
                    email: input.email
                }
            }, 422);
        }

        const created = this.model.create({
            name: input.name,
            username: input.username,
            email: input.email,
            password: Hash.make(input.password)
        });

        if (!created || created.status === false) {
            if (ctx.wantsJson()) {
                return created;
            }

            return view("users.create", {
                title: "Add User",
                errorMessage: (created && created.message) || "Failed to save data.",
                errors: {},
                old: {
                    name: input.name,
                    username: input.username,
                    email: input.email
                }
            }, 400);
        }

        if (ctx.wantsJson()) {
            return created;
        }

        const listRes = super.index({
            params: { page: 1, per_page: 10, sort: "-id" },
            routeParams: {},
            payload: {}
        });

        return view("home", {
            title: "Home",
            user: { name: "Aqshal" },
            items: listRes.data || [],
            meta: listRes.meta || null,
            success: "User " + input.name + " added successfully."
        });
    }

    edit(ctx) {
        const id = ctx.routeParams.id || ctx.params.id;
        const item = this.model.find(id);

        if (!item) {
            return failResponse("User with ID " + id + " not found.", 404);
        }

        return view("users.edit", {
            title: "Edit User",
            item: item,
            errors: {},
            old: item
        });
    }

    update(ctx) {
        const id = ctx.routeParams.id ||
            (ctx.payload && ctx.payload.data && ctx.payload.data.id) ||
            (ctx.payload && ctx.payload.id) ||
            ctx.params.id;

        const existing = this.model.find(id);
        if (!existing) {
            return failResponse("User with ID " + id + " not found.", 404);
        }

        const rawInput = (ctx.payload && ctx.payload.data && typeof ctx.payload.data === "object")
            ? ctx.payload.data
            : (ctx.payload || {});

        const input = {
            name: rawInput.name !== undefined ? String(rawInput.name).trim() : "",
            username: rawInput.username !== undefined ? String(rawInput.username).trim() : "",
            email: rawInput.email !== undefined ? String(rawInput.email).trim().toLowerCase() : "",
            password: rawInput.password !== undefined ? String(rawInput.password) : ""
        };

        const validator = Validator.make(input, {
            name: "required|string|min:3|max:100",
            username: "required|string|min:3|max:50|unique:users,username," + existing.id,
            email: "required|email|unique:users,email," + existing.id,
            password: "nullable|string|min:6"
        });

        if (validator.fails()) {
            if (ctx.wantsJson()) {
                return failResponse(validator.firstError(), 422, {
                    errors: validator.errors()
                });
            }

            return view("users.edit", {
                title: "Edit User",
                item: existing,
                errors: validator.errors(),
                old: {
                    name: input.name,
                    username: input.username,
                    email: input.email
                }
            }, 422);
        }

        const recordData = {
            name: input.name,
            username: input.username,
            email: input.email
        };

        if (input.password.trim() !== "") {
            recordData.password = Hash.make(input.password);
        }

        const updated = this.model.update(existing.id, recordData);

        if (!updated || updated.status === false) {
            if (ctx.wantsJson()) return updated;

            return view("users.edit", {
                title: "Edit User",
                item: existing,
                errorMessage: (updated && updated.message) || "Failed to update data.",
                errors: {},
                old: {
                    name: input.name,
                    username: input.username,
                    email: input.email
                }
            }, 400);
        }

        if (ctx.wantsJson()) return updated;

        const listRes = super.index({
            params: { page: 1, per_page: 10, sort: "-id" },
            routeParams: {},
            payload: {}
        });

        return view("home", {
            title: "Home",
            user: { name: "Aqshal" },
            items: listRes.data || [],
            meta: listRes.meta || null,
            success: "User " + recordData.name + " updated successfully."
        });
    }

    destroy(ctx) {
        const id = ctx.routeParams.id ||
            (ctx.payload && ctx.payload.id) ||
            ctx.params.id;

        const existing = this.model.find(id);
        if (!existing) {
            return failResponse("User with ID " + id + " not found.", 404);
        }

        const deleted = this.model.destroy(existing.id);

        if (!deleted || deleted.status === false) {
            if (ctx.wantsJson()) return deleted;

            const errList = super.index({
                params: { page: 1, per_page: 10, sort: "-id" },
                routeParams: {},
                payload: {}
            });

            return view("home", {
                title: "Home",
                user: { name: "Aqshal" },
                items: errList.data || [],
                meta: errList.meta || null,
                errorMessage: (deleted && deleted.message) || "Failed to delete user."
            }, 400);
        }

        if (ctx.wantsJson()) return deleted;

        const listRes = super.index({
            params: { page: 1, per_page: 10, sort: "-id" },
            routeParams: {},
            payload: {}
        });

        return view("home", {
            title: "Home",
            user: { name: "Aqshal" },
            items: listRes.data || [],
            meta: listRes.meta || null,
            success: "User " + (existing.name || "#" + existing.id) + " deleted successfully."
        });
    }
}
