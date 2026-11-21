function doGet(e) {
    return dispatchHttpRequest(e, "GET");
}

function doPost(e) {
    return dispatchHttpRequest(e, "POST");
}
