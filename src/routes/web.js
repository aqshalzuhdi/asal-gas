function registerWebRoutes() {
    Route.get("/", "HomeController@index").name("home");
    Route.get("index", "HomeController@index").name("index");

    Route.resource("users", "HomeController", {
        except: ["index", "show"]
    });
}
