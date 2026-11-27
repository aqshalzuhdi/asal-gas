class AuthController extends Controller {
    login(ctx) {
        const payload = ctx.payload || {};
        const input = (payload.data && typeof payload.data === "object") ? payload.data : payload;

        const validation = Validator.make(input, {
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

        const username = String(input.username).trim();
        const password = input.password;

        const user = User.where("username", username)
            .withHidden("password")
            .first();

        if (user && Hash.check(password, user.password)) {
            const updatePayload = {};
            if (Hash.needsRehash(user.password)) {
                updatePayload.password = Hash.make(password);
            }

            let ttlMinutes = parseInt(CONFIG.getOptional("SESSION_TTL_MINUTES", 1440), 10);
            if (isNaN(ttlMinutes) || ttlMinutes < 1) ttlMinutes = 1440;

            const session = generateSessionKey();
            const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

            updatePayload.session = session;
            updatePayload.session_expires_at = expiresAt;

            const updated = User.forceUpdate(user.id, updatePayload);
            const safeUser = (updated && updated.data) ? updated.data : User.find(user.id);

            return {
                status: true,
                session: session,
                expires_at: expiresAt,
                data: safeUser
            };
        }

        return { status: false, code: 401, message: "Unauthorized" };
    }

    logout(ctx) {
        const auth = ctx.auth;
        const authUser = (auth && auth.data)
            ? (Array.isArray(auth.data) ? auth.data[0] : auth.data)
            : null;
        const userId = authUser && authUser.id !== undefined ? authUser.id : null;

        if (!userId) {
            return { status: false, code: 401, message: "User ID not found in session." };
        }

        const logoutProcess = User.forceUpdate(userId, {
            session: "",
            session_expires_at: ""
        });

        if (logoutProcess && logoutProcess.status) {
            return { status: true, message: "Successfully logged out." };
        }
        return logoutProcess;
    }

    verifySession(ctx) {
        if (!ctx.auth) {
            return { status: false, code: 401, message: "Unauthorized" };
        }
        return ctx.auth;
    }
}
