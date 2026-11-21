Migration.register({
    name: "2026_11_21_103144_create_users_table",

    up: function () {
        Schema.create("users", function (table) {
            table.id();
            table.string("session");
            table.datetime("session_expires_at");
            table.string("name");
            table.string("username");
            table.string("password");
            table.string("email");
            table.timestamps();
            table.softDeletes();
        });
    },

    down: function () {
        Schema.dropIfExists("users");
    }
});
