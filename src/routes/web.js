function registerWebRoutes() {
    Route.get("/", "HomeController@index").name("home");
    Route.get("index", "HomeController@index").name("index");

    Route.get("users/create", "HomeController@create").name("users.create");
    Route.post("users", "HomeController@store").name("users.store");
    Route.get("users/:id/edit", "HomeController@edit").name("users.edit");
    Route.match(["PUT", "PATCH"], "users/:id", "HomeController@update").name("users.update");
    Route.delete("users/:id", "HomeController@destroy").name("users.destroy");
}
