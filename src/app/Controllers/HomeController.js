var HomeController = (function () {
    var _instance;
    return new Proxy({}, {
        get: function (_, prop) {
            if (!_instance) {
                _instance = BaseController.init({
                    sheet: "users",
                    with: [],

                    index: function (ctx) {
                        var res = this.superIndex(ctx);

                        return view("home", {
                            title: "Home",
                            user: {name: "Aqshal"},
                            items: res.data || [],
                            meta: res.meta || null
                        });
                    },

                    create: function (ctx) {
                        return view("users.create", {
                            title: "Tambah User",
                            errors: {},
                            old: {}
                        });
                    },

                    store: function (ctx) {
                        // Mendukung payload dari <form> HTML (ctx.payload.name) maupun API JSON (ctx.payload.data.name)
                        var input = (ctx.payload && ctx.payload.data && typeof ctx.payload.data === "object")
                            ? ctx.payload.data
                            : (ctx.payload || {});

                        var validator = Validator.make(input, {
                            name: "required|string|min:3",
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
                                title: "Tambah User",
                                errors: validator.errors(),
                                old: {
                                    name: input.name || "",
                                    email: input.email || ""
                                }
                            }, 422);
                        }

                        var recordData = {
                            name: String(input.name).trim(),
                            email: String(input.email).trim().toLowerCase(),
                            password: typeof hashPassword === "function"
                                ? hashPassword(String(input.password))
                                : String(input.password)
                        };

                        var created = create(this.sheet, { data: recordData });

                        if (!created || created.status === false) {
                            if (ctx.wantsJson()) {
                                return created;
                            }

                            return view("users.create", {
                                title: "Tambah User",
                                errorMessage: (created && created.message) || "Gagal menyimpan data.",
                                errors: {},
                                old: {
                                    name: input.name || "",
                                    email: input.email || ""
                                }
                            }, 400);
                        }

                        if (ctx.wantsJson()) {
                            return created;
                        }

                        // Setelah berhasil simpan di Web, render ulang halaman index beserta pesan sukses
                        var listRes = read(this.sheet, { with: this.with }, 1, 10, "-id");
                        return view("home", {
                            title: "Home",
                            user: { name: "Aqshal" },
                            items: listRes.data || [],
                            success: "User " + recordData.name + " berhasil ditambahkan."
                        });
                    },

                    edit: function (ctx) {
                        var id = ctx.routeParams.id || ctx.params.id;
                        var item = find(this.sheet, id);

                        if (!item) {
                            return failResponse("User dengan ID " + id + " tidak ditemukan.", 404);
                        }

                        return view("users.edit", {
                            title: "Edit User",
                            item: item,
                            errors: {},
                            old: item
                        });
                    },

                    update: function (ctx) {
                        var id = ctx.routeParams.id ||
                            (ctx.payload && ctx.payload.data && ctx.payload.data.id) ||
                            (ctx.payload && ctx.payload.id) ||
                            ctx.params.id;

                        var existing = find(this.sheet, id);
                        if (!existing) {
                            return failResponse("User dengan ID " + id + " tidak ditemukan.", 404);
                        }

                        var input = (ctx.payload && ctx.payload.data && typeof ctx.payload.data === "object")
                            ? ctx.payload.data
                            : (ctx.payload || {});

                        var validator = Validator.make(input, {
                            name: "required|string|min:3",
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
                                    name: input.name || "",
                                    email: input.email || ""
                                }
                            }, 422);
                        }

                        var recordData = {
                            id: existing.id,
                            name: String(input.name).trim(),
                            email: String(input.email).trim().toLowerCase()
                        };

                        if (input.password !== undefined && String(input.password).trim() !== "") {
                            recordData.password = typeof hashPassword === "function"
                                ? hashPassword(String(input.password))
                                : String(input.password);
                        }

                        var updated = update(this.sheet, { data: recordData });

                        if (!updated || updated.status === false) {
                            if (ctx.wantsJson()) return updated;

                            return view("users.edit", {
                                title: "Edit User",
                                item: existing,
                                errorMessage: (updated && updated.message) || "Gagal memperbarui data.",
                                errors: {},
                                old: {
                                    name: input.name || "",
                                    email: input.email || ""
                                }
                            }, 400);
                        }

                        if (ctx.wantsJson()) return updated;

                        var listRes = read(this.sheet, { with: this.with }, 1, 10, "-id");
                        return view("home", {
                            title: "Home",
                            user: { name: "Aqshal" },
                            items: listRes.data || [],
                            success: "User " + recordData.name + " berhasil diperbarui."
                        });
                    },

                    destroy: function (ctx) {
                        var id = ctx.routeParams.id ||
                            (ctx.payload && ctx.payload.id) ||
                            ctx.params.id;

                        var existing = find(this.sheet, id);
                        if (!existing) {
                            return failResponse("User dengan ID " + id + " tidak ditemukan.", 404);
                        }

                        var deleted = destroy(this.sheet, existing.id);

                        if (!deleted || deleted.status === false) {
                            if (ctx.wantsJson()) return deleted;

                            var errList = read(this.sheet, { with: this.with }, 1, 10, "-id");
                            return view("home", {
                                title: "Home",
                                user: { name: "Aqshal" },
                                items: errList.data || [],
                                errorMessage: (deleted && deleted.message) || "Gagal menghapus user."
                            }, 400);
                        }

                        if (ctx.wantsJson()) return deleted;

                        var listRes = read(this.sheet, { with: this.with }, 1, 10, "-id");
                        return view("home", {
                            title: "Home",
                            user: { name: "Aqshal" },
                            items: listRes.data || [],
                            success: "User " + (existing.name || "#" + existing.id) + " berhasil dihapus."
                        });
                    }
                });
            }
            var val = _instance[prop];
            return typeof val === "function" ? val.bind(_instance) : val;
        }
    });
})();
