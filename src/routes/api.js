function registerRoutes() {
    // Public routes
    Route.get("", function () {
        return {
            status: true,
            message: "Asal-GAS API is running",
            version: "1.0.0"
        };
    });

    Route.middleware("throttle:5,10", function () {
        Route.post("auth/login", "AuthController@login");
    });

    // Authenticated routes (requires `session` parameter or payload)
    Route.middleware("auth", function () {
        Route.post("auth/logout", "AuthController@logout");
        Route.get("auth/verify", "AuthController@verifySession");

        Route.resource("users", "UserController");
    });
}
