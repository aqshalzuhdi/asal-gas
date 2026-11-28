class HomeController extends Controller {
    _extractInput(request) {
        const nested = request.input("data");
        const raw = (nested && typeof nested === "object")
            ? nested
            : request.all();

        return {
            name: raw.name !== undefined ? String(raw.name).trim() : "",
            username: raw.username !== undefined ? String(raw.username).trim() : "",
            email: raw.email !== undefined ? String(raw.email).trim().toLowerCase() : "",
            password: raw.password !== undefined ? String(raw.password) : ""
        };
    }

    _latestUsersPage() {
        return User.orderBy("id", "desc").paginate(10, 1);
    }

    index(request) {
        const res = User.datatable(request);
        if (request.wantsJson()) return res;

        return view("home", {
            title: "Home",
            user: { name: "Aqshal" },
            items: res.data || [],
            meta: res.meta || null
        });
    }

    create(request) {
        return view("users.create", {
            title: "Add User",
            errors: {},
            old: {}
        });
    }

    store(request) {
        const input = this._extractInput(request);

        const validator = Validator.make(input, {
            name: "required|string|min:3|max:100",
            username: "required|string|min:3|max:50|unique:users,username",
            email: "required|email|unique:users,email",
            password: "required|string|min:6"
        });

        if (validator.fails()) {
            if (request.wantsJson()) {
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

        const created = User.create({
            name: input.name,
            username: input.username,
            email: input.email,
            password: Hash.make(input.password)
        });

        if (!created || created.status === false) {
            if (request.wantsJson()) {
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

        if (request.wantsJson()) {
            return created;
        }

        const listRes = this._latestUsersPage();

        return view("home", {
            title: "Home",
            user: { name: "Aqshal" },
            items: listRes.data || [],
            meta: listRes.meta || null,
            success: "User " + input.name + " added successfully."
        });
    }

    edit(request, id) {
        const targetId = id || request.input("id");
        const item = User.find(targetId);

        if (!item) {
            return failResponse("User with ID " + targetId + " not found.", 404);
        }

        return view("users.edit", {
            title: "Edit User",
            item: item,
            errors: {},
            old: item
        });
    }

    update(request, id) {
        const nested = request.input("data");
        const targetId = id || (nested && nested.id) || request.input("id");

        const existing = User.find(targetId);
        if (!existing) {
            return failResponse("User with ID " + targetId + " not found.", 404);
        }

        const input = this._extractInput(request);

        const validator = Validator.make(input, {
            name: "required|string|min:3|max:100",
            username: "required|string|min:3|max:50|unique:users,username," + existing.id,
            email: "required|email|unique:users,email," + existing.id,
            password: "nullable|string|min:6"
        });

        if (validator.fails()) {
            if (request.wantsJson()) {
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

        const updated = User.update(existing.id, recordData);

        if (!updated || updated.status === false) {
            if (request.wantsJson()) return updated;

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

        if (request.wantsJson()) return updated;

        const listRes = this._latestUsersPage();

        return view("home", {
            title: "Home",
            user: { name: "Aqshal" },
            items: listRes.data || [],
            meta: listRes.meta || null,
            success: "User " + recordData.name + " updated successfully."
        });
    }

    destroy(request, id) {
        const targetId = id || request.input("id");

        const existing = User.find(targetId);
        if (!existing) {
            return failResponse("User with ID " + targetId + " not found.", 404);
        }

        const deleted = User.destroy(existing.id);

        if (!deleted || deleted.status === false) {
            if (request.wantsJson()) return deleted;

            const errList = this._latestUsersPage();

            return view("home", {
                title: "Home",
                user: { name: "Aqshal" },
                items: errList.data || [],
                meta: errList.meta || null,
                errorMessage: (deleted && deleted.message) || "Failed to delete user."
            }, 400);
        }

        if (request.wantsJson()) return deleted;

        const listRes = this._latestUsersPage();

        return view("home", {
            title: "Home",
            user: { name: "Aqshal" },
            items: listRes.data || [],
            meta: listRes.meta || null,
            success: "User " + (existing.name || "#" + existing.id) + " deleted successfully."
        });
    }
}
