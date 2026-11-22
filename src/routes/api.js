function registerRoutes() {
    Route.get("", function () {
        return {
            status: true,
            message: "Asal-GAS API is running",
            version: "1.0.0"
        };
    });

    Route.middleware("throttle:5,10", function () {
        Route.post("login", "AuthController@login");
    });

    Route.middleware("auth", function () {
        Route.post("logout", "AuthController@logout");
        Route.get("verify", "AuthController@verifySession");

        Route.resource("users", "UserController");
    });
}
