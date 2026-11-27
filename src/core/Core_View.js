var View = (function () {
    var _templates = {};
    var _compiled = {};
    var _shared = {};

    function normalizeName(name) {
        return String(name || "")
            .trim()
            .replace(/^\/+|\/+$/g, "")
            .replace(/\.gas\.js$/i, "")
            .replace(/\.js$/i, "")
            .replace(/\//g, ".");
    }

    function isDebugMode() {
        return typeof CONFIG !== "undefined" &&
            typeof CONFIG.isDebug === "function" &&
            CONFIG.isDebug();
    }

    function resolveSource(normalizedName) {
        var debug = isDebugMode();

        if (typeof __readLocalViewFile === "function") {
            if (debug || !Object.prototype.hasOwnProperty.call(_templates, normalizedName)) {
                var diskContent = __readLocalViewFile(normalizedName);
                if (diskContent !== null) {
                    _templates[normalizedName] = diskContent;
                    if (debug) {
                        delete _compiled[normalizedName];
                    }
                    return diskContent;
                }
            }
        }

        if (Object.prototype.hasOwnProperty.call(_templates, normalizedName)) {
            return _templates[normalizedName];
        }

        return null;
    }

    function escapeHtmlValue(val) {
        if (val === null || val === undefined) return "";
        if (typeof val === "object" && !(val instanceof Date)) {
            val = JSON.stringify(val, null, 2);
        }
        return String(val)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function rawValue(val) {
        if (val === null || val === undefined) return "";
        if (typeof val === "object" && !(val instanceof Date)) {
            return JSON.stringify(val, null, 2);
        }
        return String(val);
    }

    function isEmptyValue(val) {
        if (val === null || val === undefined || val === false || val === "") return true;
        if (Array.isArray(val)) return val.length === 0;
        if (typeof val === "object") return Object.keys(val).length === 0;
        return false;
    }

    function iterateCollection(collection, callback) {
        if (!collection) return;

        if (Array.isArray(collection)) {
            var len = collection.length;
            for (var i = 0; i < len; i++) {
                callback(collection[i], i, {
                    index: i,
                    iteration: i + 1,
                    first: i === 0,
                    last: i === len - 1,
                    count: len
                });
            }
            return;
        }

        if (typeof collection === "object") {
            var keys = Object.keys(collection);
            var kLen = keys.length;
            for (var k = 0; k < kLen; k++) {
                var key = keys[k];
                callback(collection[key], key, {
                    index: k,
                    iteration: k + 1,
                    first: k === 0,
                    last: k === kLen - 1,
                    count: kLen
                });
            }
        }
    }

    function collectionHasItems(collection) {
        if (!collection) return false;
        if (Array.isArray(collection)) return collection.length > 0;
        if (typeof collection === "object") return Object.keys(collection).length > 0;
        return false;
    }

    function readBalancedParens(src, openParenIdx) {
        var depth = 0;
        var inSingle = false;
        var inDouble = false;
        var inTemplate = false;
        var escaped = false;

        for (var i = openParenIdx; i < src.length; i++) {
            var ch = src.charAt(i);

            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }

            if (inSingle) {
                if (ch === "'") inSingle = false;
                continue;
            }
            if (inDouble) {
                if (ch === '"') inDouble = false;
                continue;
            }
            if (inTemplate) {
                if (ch === "`") inTemplate = false;
                continue;
            }

            if (ch === "'") { inSingle = true; continue; }
            if (ch === '"') { inDouble = true; continue; }
            if (ch === "`") { inTemplate = true; continue; }

            if (ch === "(") {
                depth++;
            } else if (ch === ")") {
                depth--;
                if (depth === 0) {
                    return {
                        expr: src.slice(openParenIdx + 1, i),
                        endIdx: i + 1
                    };
                }
            }
        }

        return null;
    }

    function splitTopLevelArgs(exprStr) {
        var args = [];
        var depthParen = 0;
        var depthBracket = 0;
        var depthBrace = 0;
        var inSingle = false;
        var inDouble = false;
        var inTemplate = false;
        var escaped = false;
        var start = 0;

        for (var i = 0; i < exprStr.length; i++) {
            var ch = exprStr.charAt(i);

            if (escaped) { escaped = false; continue; }
            if (ch === "\\") { escaped = true; continue; }

            if (inSingle) { if (ch === "'") inSingle = false; continue; }
            if (inDouble) { if (ch === '"') inDouble = false; continue; }
            if (inTemplate) { if (ch === "`") inTemplate = false; continue; }

            if (ch === "'") { inSingle = true; continue; }
            if (ch === '"') { inDouble = true; continue; }
            if (ch === "`") { inTemplate = true; continue; }

            if (ch === "(") depthParen++;
            else if (ch === ")") depthParen--;
            else if (ch === "[") depthBracket++;
            else if (ch === "]") depthBracket--;
            else if (ch === "{") depthBrace++;
            else if (ch === "}") depthBrace--;
            else if (ch === "," && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
                args.push(exprStr.slice(start, i).trim());
                start = i + 1;
            }
        }

        var tail = exprStr.slice(start).trim();
        if (tail !== "") args.push(tail);
        return args;
    }

    function parseForeachExpr(expr) {
        var asIdx = expr.lastIndexOf(" as ");
        if (asIdx === -1) {
            throw new Error("Invalid @foreach / @forelse syntax: (" + expr + ")");
        }
        var collectionExpr = expr.slice(0, asIdx).trim();
        var bindingExpr = expr.slice(asIdx + 4).trim();
        var arrowIdx = bindingExpr.indexOf("=>");

        if (arrowIdx !== -1) {
            return {
                collection: collectionExpr,
                keyVar: bindingExpr.slice(0, arrowIdx).trim(),
                itemVar: bindingExpr.slice(arrowIdx + 2).trim()
            };
        }

        return {
            collection: collectionExpr,
            keyVar: "__k",
            itemVar: bindingExpr
        };
    }

    function compileTemplate(viewName, source) {
        var cleaned = String(source || "").replace(/\{\{--[\s\S]*?--\}\}/g, "");
        var code = [
            "var __buf = [];",
            "function __write(s) { __buf.push(s); }",
            "var url = __h.url;",
            "var apiUrl = __h.apiUrl;",
            "var route = __h.route;",
            "var json = __h.json;",
            "var csrfToken = __h.csrfToken;",
            "var csrfField = __h.csrfField;",
            "with (__ctx) {"
        ];

        var textBuffer = "";
        var pos = 0;
        var len = cleaned.length;
        var forelseStack = [];

        function flushText() {
            if (textBuffer !== "") {
                code.push("__write(" + JSON.stringify(textBuffer) + ");");
                textBuffer = "";
            }
        }

        while (pos < len) {
            // 1. Escaped blade literal: @{{ ... }}
            if (cleaned.slice(pos, pos + 3) === "@{{") {
                textBuffer += "{{";
                pos += 3;
                continue;
            }

            // 2. Raw unescaped echo: {!! ... !!}
            if (cleaned.slice(pos, pos + 3) === "{!!") {
                var rawEnd = cleaned.indexOf("!!}", pos + 3);
                if (rawEnd !== -1) {
                    flushText();
                    var rawExpr = cleaned.slice(pos + 3, rawEnd).trim();
                    code.push("__write(__h.raw(" + rawExpr + "));");
                    pos = rawEnd + 3;
                    continue;
                }
            }

            // 3. Auto-escaped echo: {{ ... }}
            if (cleaned.slice(pos, pos + 2) === "{{") {
                var escEnd = cleaned.indexOf("}}", pos + 2);
                if (escEnd !== -1) {
                    flushText();
                    var escExpr = cleaned.slice(pos + 2, escEnd).trim();
                    code.push("__write(__h.esc(" + escExpr + "));");
                    pos = escEnd + 2;
                    continue;
                }
            }

            // 4. Blade directives: @directive
            if (cleaned.charAt(pos) === "@") {
                var prevChar = pos > 0 ? cleaned.charAt(pos - 1) : "";
                // Abaikan email seperti user@domain.com
                if (/[a-zA-Z0-9._-]/.test(prevChar)) {
                    textBuffer += "@";
                    pos++;
                    continue;
                }

                var dirMatch = cleaned.slice(pos + 1).match(/^(csrf|extends|section|endsection|yield|includeIf|include|stack|push|endpush|if|elseif|else|endif|unless|endunless|isset|endisset|empty|endempty|forelse|endforelse|foreach|endforeach|for|endfor)\b/);

                if (dirMatch) {
                    var directive = dirMatch[1];
                    var afterDir = pos + 1 + directive.length;
                    var wsMatch = cleaned.slice(afterDir).match(/^[ \t]*/);
                    var openParenPos = afterDir + (wsMatch ? wsMatch[0].length : 0);
                    var hasParens = cleaned.charAt(openParenPos) === "(";

                    // Directives without parentheses
                    if (directive === "endsection") {
                        flushText();
                        code.push("__h.endSection(__state, __buf);");
                        pos = afterDir;
                        continue;
                    }
                    if (directive === "endpush") {
                        flushText();
                        code.push("__h.endPush(__state, __buf);");
                        pos = afterDir;
                        continue;
                    }
                    if (directive === "else") {
                        flushText();
                        code.push("} else {");
                        pos = afterDir;
                        continue;
                    }
                    if (directive === "endif" || directive === "endunless" || directive === "endisset" || directive === "endempty") {
                        flushText();
                        code.push("}");
                        pos = afterDir;
                        continue;
                    }
                    if (directive === "endforeach") {
                        flushText();
                        code.push("});");
                        pos = afterDir;
                        continue;
                    }
                    if (directive === "endfor") {
                        flushText();
                        code.push("}");
                        pos = afterDir;
                        continue;
                    }
                    if (directive === "empty" && !hasParens) {
                        flushText();
                        if (forelseStack.length === 0) {
                            throw new Error("Unexpected @empty outside @forelse in view [" + viewName + "]");
                        }
                        forelseStack[forelseStack.length - 1].hasEmpty = true;
                        code.push("}); } else {");
                        pos = afterDir;
                        continue;
                    }
                    if (directive === "endforelse") {
                        flushText();
                        var fe = forelseStack.pop();
                        if (!fe) {
                            throw new Error("Unexpected @endforelse in view [" + viewName + "]");
                        }
                        code.push(fe.hasEmpty ? "}" : "}); }");
                        pos = afterDir;
                        continue;
                    }
                    if (directive === "csrf") {
                        flushText();
                        code.push("__write(__h.csrfField());");
                        pos = afterDir;
                        continue;
                    }

                    // Directives with parentheses
                    if (hasParens) {
                        var parsed = readBalancedParens(cleaned, openParenPos);
                        if (parsed) {
                            flushText();
                            var inner = parsed.expr.trim();
                            var args = splitTopLevelArgs(inner);

                            if (directive === "extends") {
                                code.push("__state.parent = " + args[0] + ";");
                            } else if (directive === "yield") {
                                var defArg = args[1] !== undefined ? args[1] : '""';
                                code.push("__write(__h.yieldSection(__state, " + args[0] + ", " + defArg + "));");
                            } else if (directive === "section") {
                                if (args.length >= 2) {
                                    code.push("__h.setSection(__state, " + args[0] + ", " + args[1] + ");");
                                } else {
                                    code.push("__h.startSection(__state, " + args[0] + ", __buf);");
                                }
                            } else if (directive === "stack") {
                                code.push("__write(__h.renderStack(__state, " + args[0] + "));");
                            } else if (directive === "push") {
                                code.push("__h.startPush(__state, " + args[0] + ", __buf);");
                            } else if (directive === "include") {
                                var incData = args[1] !== undefined ? args[1] : "{}";
                                code.push("__write(__h.includeView(" + args[0] + ", __ctx, " + incData + ", __state, false));");
                            } else if (directive === "includeIf") {
                                var incIfData = args[1] !== undefined ? args[1] : "{}";
                                code.push("__write(__h.includeView(" + args[0] + ", __ctx, " + incIfData + ", __state, true));");
                            } else if (directive === "if") {
                                code.push("if (" + inner + ") {");
                            } else if (directive === "elseif") {
                                code.push("} else if (" + inner + ") {");
                            } else if (directive === "unless") {
                                code.push("if (!(" + inner + ")) {");
                            } else if (directive === "isset") {
                                code.push("if (typeof (" + inner + ") !== 'undefined' && (" + inner + ") !== null) {");
                            } else if (directive === "empty") {
                                code.push("if (__h.isEmpty(" + inner + ")) {");
                            } else if (directive === "foreach") {
                                var feInfo = parseForeachExpr(inner);
                                code.push("__h.each(" + feInfo.collection + ", function(" + feInfo.itemVar + ", " + feInfo.keyVar + ", loop) {");
                            } else if (directive === "forelse") {
                                var flInfo = parseForeachExpr(inner);
                                forelseStack.push({ hasEmpty: false });
                                code.push("if (__h.hasItems(" + flInfo.collection + ")) { __h.each(" + flInfo.collection + ", function(" + flInfo.itemVar + ", " + flInfo.keyVar + ", loop) {");
                            } else if (directive === "for") {
                                code.push("for (" + inner + ") {");
                            }

                            pos = parsed.endIdx;
                            continue;
                        }
                    }
                }
            }

            textBuffer += cleaned.charAt(pos);
            pos++;
        }

        flushText();
        code.push("}");
        code.push("return __buf.join('');");

        try {
            return new Function("__ctx", "__h", "__state", code.join("\n"));
        } catch (compileErr) {
            var err = new Error("Template syntax error in view [" + viewName + "]: " + compileErr.message);
            err.statusCode = 500;
            throw err;
        }
    }

    var _runtimeHelpers = {
        esc: escapeHtmlValue,
        raw: rawValue,
        isEmpty: isEmptyValue,
        each: iterateCollection,
        hasItems: collectionHasItems,

        url: function (path, params) {
            return typeof url === "function" ? url(path, params) : String(path || "/");
        },
        apiUrl: function (path, params) {
            return typeof apiUrl === "function" ? apiUrl(path, params) : String(path || "/api");
        },
        route: function (name, params) {
            return typeof route === "function" ? route(name, params) : String(name || "/");
        },
        json: function (val) {
            return JSON.stringify(val === undefined ? null : val).replace(/<\/script/gi, "<\\/script");
        },

        setSection: function (state, name, content) {
            state.sections[String(name)] = String(content === undefined || content === null ? "" : content);
        },
        startSection: function (state, name, buf) {
            state.sectionStack.push({ name: String(name), startIdx: buf.length });
        },
        endSection: function (state, buf) {
            var frame = state.sectionStack.pop();
            if (!frame) return;
            var captured = buf.splice(frame.startIdx, buf.length - frame.startIdx).join("");
            if (state.sections[frame.name] === undefined) {
                state.sections[frame.name] = captured;
            }
        },
        yieldSection: function (state, name, defaultContent) {
            var key = String(name);
            if (state.sections[key] !== undefined) {
                return state.sections[key];
            }
            return defaultContent !== undefined && defaultContent !== null ? String(defaultContent) : "";
        },

        startPush: function (state, name, buf) {
            state.pushStack.push({ name: String(name), startIdx: buf.length });
        },
        endPush: function (state, buf) {
            var frame = state.pushStack.pop();
            if (!frame) return;
            var captured = buf.splice(frame.startIdx, buf.length - frame.startIdx).join("");
            if (!state.stacks[frame.name]) state.stacks[frame.name] = [];
            state.stacks[frame.name].push(captured);
        },
        renderStack: function (state, name) {
            var list = state.stacks[String(name)];
            return Array.isArray(list) ? list.join("\n") : "";
        },

        includeView: function (partialName, parentCtx, extraData, state, ignoreMissing) {
            var key = normalizeName(partialName);
            if (resolveSource(key) === null) {
                if (ignoreMissing) return "";
                var err = new Error("Partial view [" + partialName + "] not found.");
                err.statusCode = 500;
                throw err;
            }
            var merged = Object.assign({}, parentCtx, extraData || {});
            return renderInternal(key, merged, state);
        },

        csrfToken: function (ttl) {
            return typeof Csrf !== "undefined" ? Csrf.token(ttl) : "";
        },
        csrfField: function (ttl) {
            return typeof Csrf !== "undefined" ? Csrf.field(ttl) : "";
        },
    };

    function renderInternal(normalizedName, contextData, sharedState) {
        var source = resolveSource(normalizedName);
        if (source === null) {
            var notFoundErr = new Error("View [" + normalizedName + "] not found.");
            notFoundErr.statusCode = 500;
            throw notFoundErr;
        }

        if (!_compiled[normalizedName]) {
            _compiled[normalizedName] = compileTemplate(normalizedName, source);
        }

        var state = sharedState || {
            parent: null,
            sections: {},
            sectionStack: [],
            stacks: {},
            pushStack: []
        };

        var renderFn = _compiled[normalizedName];
        var output = renderFn(contextData, _runtimeHelpers, state);

        while (state.parent) {
            var parentName = normalizeName(state.parent);
            state.parent = null;

            var parentSource = resolveSource(parentName);
            if (parentSource === null) {
                var parentErr = new Error("Layout view [" + parentName + "] extended by [" + normalizedName + "] not found.");
                parentErr.statusCode = 500;
                throw parentErr;
            }

            if (!_compiled[parentName]) {
                _compiled[parentName] = compileTemplate(parentName, parentSource);
            }

            output = _compiled[parentName](contextData, _runtimeHelpers, state);
        }

        return output;
    }

    return {
        register: function (name, templateContent) {
            var key = normalizeName(name);
            _templates[key] = String(templateContent || "");
            delete _compiled[key];
            return this;
        },

        exists: function (name) {
            return resolveSource(normalizeName(name)) !== null;
        },

        share: function (key, value) {
            if (key && typeof key === "object") {
                Object.assign(_shared, key);
            } else if (key) {
                _shared[String(key)] = value;
            }
            return this;
        },

        render: function (name, data) {
            var key = normalizeName(name);
            var appName = (typeof CONFIG !== "undefined" && typeof CONFIG.getOptional === "function")
                ? CONFIG.getOptional("APP_NAME", "Asal-GAS")
                : "Asal-GAS";

            var ctx = Object.assign({
                appName: appName
            }, _shared, data || {});

            return renderInternal(key, ctx, null);
        },

        make: function (name, data, statusCode) {
            var appMode = (typeof CONFIG !== "undefined" && typeof CONFIG.getOptional === "function")
                ? String(CONFIG.getOptional("APP_MODE", "web") || "web").trim().toLowerCase()
                : "web";

            if (appMode !== "web") {
                return {
                    status: true,
                    code: statusCode || 200,
                    message: "Success",
                    data: data || {}
                };
            }

            var html = this.render(name, data);
            if (typeof createHtmlOutputSafe === "function") {
                return createHtmlOutputSafe(html, statusCode || 200);
            }
            return HtmlService.createHtmlOutput(html);
        },

        list: function () {
            return Object.keys(_templates).sort();
        }
    };
})();

function view(name, data, statusCode) {
    return View.make(name, data, statusCode);
}
