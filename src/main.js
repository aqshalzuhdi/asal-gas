function doGet(e) {
    try {
        return dispatchHttpRequest(e || { parameter: {}, pathInfo: "" }, "GET");
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

function gasNavigate(req) {
    var request = (req && typeof req === "object") ? req : {};
    var method = String(request.method || "GET").toUpperCase();
    var routePath = String(request.route || "").trim().replace(/^\/+|\/+$/g, "");
    var params = Object.assign({}, (request.query && typeof request.query === "object") ? request.query : {});

    if (routePath !== "") {
        params.route = routePath;
    }

    var payloadObj = (request.payload && typeof request.payload === "object") ? request.payload : {};
    if (method === "POST") {
        Object.keys(payloadObj).forEach(function (k) {
            if (params[k] === undefined && payloadObj[k] !== null && typeof payloadObj[k] !== "object") {
                params[k] = payloadObj[k];
            }
        });
    }

    var fakeEvent = {
        parameter: params,
        parameters: {},
        pathInfo: routePath,
        queryString: "",
        headers: Object.assign({ accept: "text/html,application/xhtml+xml" }, request.headers || {}),
        postData: method === "POST"
            ? { contents: JSON.stringify(payloadObj), type: "application/json" }
            : null
    };

    try {
        var output = dispatchHttpRequest(fakeEvent, method);
        var html = (output && typeof output.getContent === "function")
            ? output.getContent()
            : (typeof output === "string" ? output : JSON.stringify(output));
        var statusCode = (output && typeof output._statusCode === "number") ? output._statusCode : 200;
        var isHtml = (output && typeof output.getMimeType === "function")
            ? String(output.getMimeType()).toUpperCase().indexOf("HTML") !== -1
            : /^\s*(<!DOCTYPE html|<html)/i.test(html);

        return {
            status: true,
            code: statusCode,
            isHtml: isHtml,
            route: routePath,
            query: (request.query && typeof request.query === "object") ? request.query : {},
            html: html
        };
    } catch (err) {
        var errOut = handleHttpError(err, fakeEvent, { route: routePath, method: method });
        var errHtml = (errOut && typeof errOut.getContent === "function")
            ? errOut.getContent()
            : JSON.stringify(errOut);

        return {
            status: false,
            code: (err && err.statusCode) || 500,
            isHtml: true,
            route: routePath,
            query: {},
            html: errHtml
        };
    }
}
