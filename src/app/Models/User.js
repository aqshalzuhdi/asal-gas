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
        "deleted_at"
    ];

    casts = {
        //
    };
}
