function doGet(e) {
    try {
        return dispatchHttpRequest(e, "GET");
    } catch (err) {
        return handleHttpError(err, e, { method: "GET" });
    }
}

function doPost(e) {
    try {
        return dispatchHttpRequest(e, "POST");
    } catch (err) {
        return handleHttpError(err, e, { method: "POST" });
    }
}
