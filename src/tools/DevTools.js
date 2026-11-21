var DevTools = {
    testAuthHashFlow: function (username, plainPassword) {
        var testUser = username || "admin";
        var testPass = plainPassword || "password123";

        var freshHash = Hash.make(testPass);
        Logger.log("1. Memory Hash Check (Expected true): " + Hash.check(testPass, freshHash));

        var result = read("users", { username: testUser, with_password: true, with: "none" });
        if (!result.status || !result.data || result.data.length === 0) {
            Logger.log("STOP: User '" + testUser + "' not found.");
            return;
        }

        var user = result.data[0];
        Logger.log("2. Database Hash Check: " + Hash.check(testPass, user.password));
    }
};

function testAuth() {
    DevTools.testAuthHashFlow("admin", "password123");
}
