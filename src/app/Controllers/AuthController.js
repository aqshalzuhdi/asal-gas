var AuthController = {
    login: function (ctx) {
        var payload = ctx.payload || {};
        var input = (payload.data && typeof payload.data === "object") ? payload.data : payload;

        var validation = Validator.make(input, {
            username: "required|string",
            password: "required"
        });

        if (validation.fails()) {
            return {
                status: false,
                code: 422,
                message: validation.firstError(),
                errors: validation.errors()
            };
        }

        var username = String(input.username).trim();
        var password = input.password;

        var result = read("users", { username: username, with_password: true, with: "none" });
        if (result.status && result.data && result.data.length >= 1) {
            var data = result.data[0];
            delete data.session;

            if (Hash.check(password, data.password)) {
                var updatePayload = {};
                if (Hash.needsRehash(data.password)) {
                    updatePayload.password = Hash.make(password);
                }

                var ttlMinutes = parseInt(CONFIG.getOptional("SESSION_TTL_MINUTES", 1440), 10);
                if (isNaN(ttlMinutes) || ttlMinutes < 1) ttlMinutes = 1440;

                var session = generateSessionKey();
                var expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

                updatePayload.id = data.id;
                updatePayload.session = session;
                updatePayload.session_expires_at = expiresAt;
                update("users", { data: updatePayload });

                delete data.password;
                data.session_expires_at = expiresAt;

                return {
                    status: true,
                    session: session,
                    expires_at: expiresAt,
                    data: data
                };
            }
        }

        return { status: false, code: 401, message: "Unauthorized" };
    },

    logout: function (ctx) {
        var auth = ctx.auth;
        var userId = (auth && auth.data)
            ? (auth.data.id !== undefined ? auth.data.id : auth.data[0])
            : null;

        if (!userId) {
            return { status: false, message: "User ID not found in session." };
        }

        var logoutProcess = update("users", {
            data: {
                id: userId,
                session: "",
                session_expires_at: ""
            }
        });

        if (logoutProcess.status) {
            return { status: true, message: "Successfully logged out." };
        }
        return logoutProcess;
    },

    verifySession: function (ctx) {
        return ctx.auth;
    }
};
