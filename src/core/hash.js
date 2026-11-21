const Hash = {
    DEFAULT_ITERATIONS: 30000,
    SALT_LENGTH: 16,
    KEY_LENGTH: 32,

    make: function (password, options = {}) {
        if (password == null || String(password) === "") {
            throw new Error("Password cannot be empty.");
        }

        const iterations = options.iterations || this.DEFAULT_ITERATIONS;
        const saltBytes = this._generateRandomBytes(this.SALT_LENGTH);
        const derivedKeyBytes = this._pbkdf2(String(password), saltBytes, iterations, this.KEY_LENGTH);

        const saltB64 = Utilities.base64Encode(saltBytes);
        const hashB64 = Utilities.base64Encode(derivedKeyBytes);

        return `$pbkdf2-sha256$i=${iterations}$${saltB64}$${hashB64}`;
    },

    check: function (password, hashedValue) {
        if (password == null || String(password) === "" || !hashedValue || typeof hashedValue !== "string") {
            return false;
        }

        const parts = hashedValue.trim().split("$");
        if (parts.length !== 5 || parts[1] !== "pbkdf2-sha256") {
            return false;
        }

        const iterMatch = parts[2].match(/^i=(\d+)$/);
        if (!iterMatch) return false;

        try {
            const iterations = parseInt(iterMatch[1], 10);
            const saltBytes = Utilities.base64Decode(this._padBase64(parts[3]));
            const expectedHashBytes = Utilities.base64Decode(this._padBase64(parts[4]));

            const actualHashBytes = this._pbkdf2(
                String(password),
                saltBytes,
                iterations,
                expectedHashBytes.length
            );

            return this._constantTimeEquals(actualHashBytes, expectedHashBytes);
        } catch (e) {
            return false;
        }
    },

    needsRehash: function (hashedValue, options = {}) {
        const targetIterations = options.iterations || this.DEFAULT_ITERATIONS;
        const parts = String(hashedValue || "").trim().split("$");

        if (parts.length !== 5 || parts[1] !== "pbkdf2-sha256") return true;

        const iterMatch = parts[2].match(/^i=(\d+)$/);
        if (!iterMatch) return true;

        return parseInt(iterMatch[1], 10) !== targetIterations;
    },

    _padBase64: function (str) {
        const pad = str.length % 4;
        if (pad === 2) return str + "==";
        if (pad === 3) return str + "=";
        return str;
    },

    _generateRandomBytes: function (length) {
        const seed = Utilities.getUuid() + ":" + new Date().getTime() + ":" + Math.random();
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
        return digest.slice(0, length);
    },

    _pbkdf2: function (password, saltBytes, iterations, keyLength) {
        const passwordBytes = Utilities.newBlob(password).getBytes();
        const hLen = 32;
        const blocks = Math.ceil(keyLength / hLen);
        let derivedKey = [];

        for (let block = 1; block <= blocks; block++) {
            const blockBytes = [
                ((block >>> 24) & 0xff) << 24 >> 24,
                ((block >>> 16) & 0xff) << 24 >> 24,
                ((block >>> 8) & 0xff) << 24 >> 24,
                (block & 0xff) << 24 >> 24
            ];
            const initialInput = saltBytes.concat(blockBytes);

            let u = Utilities.computeHmacSha256Signature(initialInput, passwordBytes);
            let t = u.slice();

            for (let i = 1; i < iterations; i++) {
                u = Utilities.computeHmacSha256Signature(u, passwordBytes);
                for (let j = 0; j < hLen; j++) {
                    t[j] ^= u[j];
                }
            }

            derivedKey = derivedKey.concat(t);
        }

        return derivedKey.slice(0, keyLength);
    },

    _constantTimeEquals: function (a, b) {
        if (a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) {
            diff |= ((a[i] & 0xff) ^ (b[i] & 0xff));
        }
        return diff === 0;
    }
};
