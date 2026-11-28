function extractSessionToken(requestObject, isPost) {
    if (!requestObject) return null;

    if (isPost && requestObject.postData && requestObject.postData.contents) {
        var rawBody = String(requestObject.postData.contents).trim();
        if (rawBody.charAt(0) === "{") {
            try {
                var payload = JSON.parse(rawBody);
                if (payload && payload.session) {
                    return String(payload.session).trim();
                }
            } catch (_) { }
        } else if (rawBody !== "") {
            var pairs = rawBody.split("&");
            for (var p = 0; p < pairs.length; p++) {
                var eqIdx = pairs[p].indexOf("=");
                if (eqIdx === -1) continue;
                var k = decodeURIComponent(pairs[p].slice(0, eqIdx).replace(/\+/g, " "));
                if (k === "session") {
                    var v = decodeURIComponent(pairs[p].slice(eqIdx + 1).replace(/\+/g, " ")).trim();
                    if (v) return v;
                }
            }
        }
    }

    if (requestObject.parameter && requestObject.parameter.session) {
        return String(requestObject.parameter.session).trim();
    }

    if (requestObject.headers && typeof requestObject.headers === "object") {
        var headerKeys = Object.keys(requestObject.headers);
        for (var h = 0; h < headerKeys.length; h++) {
            if (String(headerKeys[h]).toLowerCase() === "x-session-key") {
                var headerVal = String(requestObject.headers[headerKeys[h]] || "").trim();
                if (headerVal) return headerVal;
            }
        }
    }

    return null;
}

function middlewareAuth(requestObject, isPost) {
    var providedKey = extractSessionToken(requestObject, Boolean(isPost));
    if (!providedKey) {
        return failResponse("Unauthorized", 401);
    }

    var rows = typeof sheetRowsCached === "function" ? sheetRowsCached("users") : sheetRows("users");
    if (!rows || rows.length < 2) {
        return failResponse("Unauthorized", 401);
    }

    var headers = rows[0].map(function (h, idx) {
        return h !== null && h !== undefined && String(h).trim() !== ""
            ? String(h).trim()
            : "col_" + idx;
    });

    var sessionIndex = headers.indexOf("session");
    if (sessionIndex === -1) {
        return failResponse("Internal error: column 'session' not found.", 500);
    }

    var deletedAtIndex = headers.indexOf("deleted_at");
    var expiresAtIndex = headers.indexOf("session_expires_at");

    for (var i = 1; i < rows.length; i++) {
        var row = rows[i];
        var cellSession = row[sessionIndex] !== null && row[sessionIndex] !== undefined
            ? String(row[sessionIndex]).trim()
            : "";

        if (cellSession !== "" && cellSession === providedKey) {
            if (
                deletedAtIndex !== -1 &&
                row[deletedAtIndex] !== "" &&
                row[deletedAtIndex] !== null &&
                row[deletedAtIndex] !== undefined
            ) {
                return failResponse("Unauthorized", 401);
            }

            if (
                expiresAtIndex !== -1 &&
                row[expiresAtIndex] !== "" &&
                row[expiresAtIndex] !== null &&
                row[expiresAtIndex] !== undefined
            ) {
                var expiresTs = parseDateValue(row[expiresAtIndex]);
                if (expiresTs !== null && Date.now() > expiresTs) {
                    return failResponse("Session expired.", 401);
                }
            }

            var userData = {};
            for (var j = 0; j < headers.length; j++) {
                var key = headers[j];
                if (key === "password") continue;
                userData[key] = row[j] !== undefined ? row[j] : "";
            }

            return {
                status: true,
                message: "Authorized",
                data: userData
            };
        }
    }

    return failResponse("Unauthorized", 401);
}
