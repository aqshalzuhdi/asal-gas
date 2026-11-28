class User extends Model {
    // table = "users";
    // primaryKey = "id";
    // timestamps = true;
    // softDeletes = true;

    guarded = ['id'];

    // fillable = [
    //     "name",
    //     "username",
    //     "email",
    //     "password"
    // ];

    hidden = [
        "password",
        "session",
        "session_expires_at",
        "deleted_at"
    ];

    casts = {
        //
    };
}
