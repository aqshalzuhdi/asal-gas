var Csrf = (function () {
    var DEFAULT_TTL_SECONDS = 7200;
    var _keyCache = {};

    function getDerivedKeys(secret) {
        if (!_keyCache[secret]) {
            _keyCache[secret] = {
                encKeyBytes: hmacSha256Bytes("csrf-enc:" + secret, secret),
                macKeyBytes: hmacSha256Bytes("csrf-mac:" + secret, secret)
            };
        }
        return _keyCache[secret];
    }

    function getSecretKey() {
        var key = "";
        if (typeof CONFIG !== "undefined") {
            if (CONFIG._runtime && CONFIG._runtime.APP_KEY) {
                key = String(CONFIG._runtime.APP_KEY).trim();
            } else if (typeof CONFIG.getOptional === "function") {
                key = String(CONFIG.getOptional("APP_KEY", "") || "").trim();
            }
        }

        if (!key && typeof process !== "undefined" && process.env && process.env.APP_KEY) {
            key = String(process.env.APP_KEY).trim();
        }

        if (!key) {
            try {
                if (typeof ScriptApp !== "undefined" && ScriptApp.getScriptId) {
                    key = "fallback:" + ScriptApp.getScriptId();
                }
            } catch (_) { }
        }

        return key || "asal-gas-default-ephemeral-key";
    }

    function stringToUtf8Bytes(str) {
        var utf8 = unescape(encodeURIComponent(String(str)));
        var bytes = [];
        for (var i = 0; i < utf8.length; i++) {
            var code = utf8.charCodeAt(i);
            bytes.push(code > 127 ? code - 256 : code);
        }
        return bytes;
    }

    function utf8BytesToString(bytes) {
        var raw = "";
        for (var i = 0; i < bytes.length; i++) {
            raw += String.fromCharCode(bytes[i] & 0xff);
        }
        return decodeURIComponent(escape(raw));
    }

    function hmacSha256Bytes(message, secret) {
        var msgBytes = Array.isArray(message) ? message : stringToUtf8Bytes(message);
        var keyBytes = Array.isArray(secret) ? secret : stringToUtf8Bytes(secret);
        return Utilities.computeHmacSha256Signature(msgBytes, keyBytes);
    }

    function bytesToBase64Url(bytes) {
        var b64 = Utilities.base64Encode(bytes);
        return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function base64UrlToBytes(str) {
        var clean = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
        var pad = clean.length % 4;
        if (pad === 2) clean += "==";
        else if (pad === 3) clean += "=";
        return Utilities.base64Decode(clean);
    }

    function xorCipherBytes(dataBytes, keyBytes, ivBytes) {
        var out = [];
        var blockCounter = 0;
        var keyStream = [];
        var ivB64 = bytesToBase64Url(ivBytes);

        for (var i = 0; i < dataBytes.length; i++) {
            if (i % 32 === 0) {
                keyStream = hmacSha256Bytes("csrf-stream:" + blockCounter + ":" + ivB64, keyBytes);
                blockCounter++;
            }
            var ksByte = keyStream[i % 32] & 0xff;
            var dByte = dataBytes[i] & 0xff;
            var xorVal = dByte ^ ksByte;
            out.push(xorVal > 127 ? xorVal - 256 : xorVal);
        }

        return out;
    }

    function constantTimeEqual(a, b) {
        var strA = String(a || "");
        var strB = String(b || "");
        if (strA.length !== strB.length) return false;
        var diff = 0;
        for (var i = 0; i < strA.length; i++) {
            diff |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
        }
        return diff === 0;
    }

    function generateNonce() {
        var seed = Utilities.getUuid() + ":" + new Date().getTime() + ":" + Math.random();
        var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
        return bytesToBase64Url(digest.slice(0, 16));
    }

    return {
        token: function (ttlSeconds) {
            var ttl = Number(ttlSeconds) > 0 ? Number(ttlSeconds) : DEFAULT_TTL_SECONDS;
            var nowSec = Math.floor(Date.now() / 1000);
            var payloadObj = {
                n: generateNonce(),
                iat: nowSec,
                exp: nowSec + ttl
            };

            var secret = getSecretKey();
            var derived = getDerivedKeys(secret);
            var ivBytes = hmacSha256Bytes("csrf-iv:" + generateNonce() + ":" + Date.now(), secret).slice(0, 16);

            var plainBytes = stringToUtf8Bytes(JSON.stringify(payloadObj));
            var cipherBytes = xorCipherBytes(plainBytes, derived.encKeyBytes, ivBytes);

            var ivB64 = bytesToBase64Url(ivBytes);
            var cipherB64 = bytesToBase64Url(cipherBytes);
            var sigBytes = hmacSha256Bytes(ivB64 + "." + cipherB64, derived.macKeyBytes);
            var sigB64 = bytesToBase64Url(sigBytes);

            return ivB64 + "." + cipherB64 + "." + sigB64;
        },

        verifyDetailed: function (token) {
            if (!token || typeof token !== "string" || token.trim() === "") {
                return { valid: false, reason: "missing_token" };
            }

            var parts = token.trim().split(".");
            if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
                return { valid: false, reason: "invalid_token_format" };
            }

            try {
                var ivB64 = parts[0];
                var cipherB64 = parts[1];
                var sigB64 = parts[2];

                var secret = getSecretKey();
                var derived = getDerivedKeys(secret);

                var expectedSigBytes = hmacSha256Bytes(ivB64 + "." + cipherB64, derived.macKeyBytes);
                var expectedSigB64 = bytesToBase64Url(expectedSigBytes);

                if (!constantTimeEqual(sigB64, expectedSigB64)) {
                    return { valid: false, reason: "signature_mismatch" };
                }

                var ivBytes = base64UrlToBytes(ivB64);
                var cipherBytes = base64UrlToBytes(cipherB64);
                var plainBytes = xorCipherBytes(cipherBytes, derived.encKeyBytes, ivBytes);
                var parsed = JSON.parse(utf8BytesToString(plainBytes));

                if (!parsed || typeof parsed !== "object" || !parsed.exp) {
                    return { valid: false, reason: "invalid_payload" };
                }

                var nowSec = Math.floor(Date.now() / 1000);
                if (nowSec > Number(parsed.exp)) {
                    return { valid: false, reason: "token_expired" };
                }

                return { valid: true, reason: "ok" };
            } catch (err) {
                return { valid: false, reason: "decrypt_error: " + err.message };
            }
        },

        verify: function (token) {
            return this.verifyDetailed(token).valid;
        },

        field: function (ttlSeconds) {
            var tok = this.token(ttlSeconds);
            var escaped = typeof escapeHtml === "function"
                ? escapeHtml(tok)
                : String(tok).replace(/"/g, "&quot;");
            return '<input type="hidden" name="_token" value="' + escaped + '">';
        },

        meta: function (ttlSeconds) {
            var tok = this.token(ttlSeconds);
            var escaped = typeof escapeHtml === "function"
                ? escapeHtml(tok)
                : String(tok).replace(/"/g, "&quot;");
            return '<meta name="csrf-token" content="' + escaped + '">';
        }
    };
})();

function csrfToken(ttlSeconds) {
    return Csrf.token(ttlSeconds);
}

function csrfField(ttlSeconds) {
    return Csrf.field(ttlSeconds);
}
