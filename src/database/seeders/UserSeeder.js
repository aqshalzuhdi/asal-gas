Seeder.register("UserSeeder", {
    run: function () {
        var defaultPassword = CONFIG.getOptional("ADMIN_DEFAULT_PASSWORD", "password123");
        var initialUsers = [
            { name: "Administrator", username: "admin", email: "admin@example.com", password: defaultPassword }
        ];

        var seeded = [];
        var skipped = [];

        for (var i = 0; i < initialUsers.length; i++) {
            var user = initialUsers[i];
            var existing = read("users", { username: user.username, with_trashed: true, with: "none" });

            if (existing.status && existing.data && existing.data.length > 0) {
                skipped.push(user.username);
                continue;
            }

            var insertRes = create("users", {
                data: {
                    session: "",
                    session_expires_at: "",
                    name: user.name,
                    username: user.username,
                    password: Hash.make(user.password),
                    email: user.email
                }
            });

            if (!insertRes.status) {
                throw new Error("Failed to seed user '" + user.username + "': " + insertRes.message);
            }
            seeded.push(user.username);
        }

        return { table: "users", seeded: seeded, skipped: skipped, count: seeded.length };
    }
});
