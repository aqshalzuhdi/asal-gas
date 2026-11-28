function isWebRequest(e, context) {
    var ctx = (context && typeof context === "object") ? context : {};
    if (typeof ctx.wantsJson === "function" && ctx.wantsJson()) return false;

    var params = (ctx.params && typeof ctx.params === "object")
        ? ctx.params
        : (typeof ctx.query === "function"
            ? ctx.query()
            : ((e && e.parameter && typeof e.parameter === "object") ? e.parameter : {}));

    var payload = (ctx.payload && typeof ctx.payload === "object")
        ? ctx.payload
        : (typeof ctx.all === "function" ? ctx.all() : {});

    var formatHint = String(params.format || payload.format || "").trim().toLowerCase();
    if (formatHint === "json") return false;
    if (formatHint === "html") return true;

    if (ctx.isApi === true) return false;
    if (ctx.isWeb === true) return true;

    var appMode = (typeof CONFIG !== "undefined" && typeof CONFIG.getOptional === "function")
        ? String(CONFIG.getOptional("APP_MODE", "web") || "web").trim().toLowerCase()
        : "web";

    if (appMode !== "web") {
        return false;
    }

    var rawRoute = typeof ctx.path === "function"
        ? ctx.path()
        : (ctx.route || params.route || (e && e.pathInfo) || "");
    var route = String(rawRoute).replace(/^\/+|\/+$/g, "").toLowerCase();
    if (route === "api" || route.indexOf("api/") === 0) {
        return false;
    }

    var headers = (e && e.headers && typeof e.headers === "object") ? e.headers : {};
    var acceptHeader = String(headers.accept || headers.Accept || "").toLowerCase();
    if (acceptHeader.indexOf("application/json") !== -1 && acceptHeader.indexOf("text/html") === -1) {
        return false;
    }

    var rawMethod = typeof ctx.method === "function"
        ? ctx.method()
        : (ctx.method || params._method || payload._method || "GET");
    var method = String(rawMethod).toUpperCase();
    if (method !== "GET" && acceptHeader.indexOf("text/html") === -1) {
        return false;
    }

    return true;
}

function _buildGasClientRuntimeScript() {
    return '<script data-asal-gas-runtime="1">' +
        '(function(){' +
        'if(window.__ASAL_GAS_RUNTIME__)return;' +
        'window.__ASAL_GAS_RUNTIME__=true;' +
        'var hasGas=typeof window.google!=="undefined"&&window.google.script&&window.google.script.run;' +
        'var progressTimer=null;' +

        'function getProgressBar(){' +
            'var el=document.getElementById("__asal_gas_progress");' +
            'if(!el){' +
                'el=document.createElement("div");' +
                'el.id="__asal_gas_progress";' +
                'el.style.cssText="position:fixed;top:0;left:0;height:3px;width:0%;background:linear-gradient(90deg,#2563eb,#38bdf8);z-index:2147483647;transition:width .25s ease,opacity .2s ease;opacity:0;pointer-events:none;";' +
                'document.documentElement.appendChild(el);' +
            '}' +
            'return el;' +
        '}' +

        'function startLoading(){' +
            'if(document.body){' +
                'document.body.style.transition="opacity .15s ease";' +
                'document.body.style.opacity="0.65";' +
                'document.body.style.pointerEvents="none";' +
            '}' +
            'var bar=getProgressBar();' +
            'clearInterval(progressTimer);' +
            'bar.style.opacity="1";' +
            'bar.style.width="25%";' +
            'var cur=25;' +
            'progressTimer=setInterval(function(){' +
                'cur=Math.min(90,cur+(90-cur)*0.2);' +
                'bar.style.width=cur.toFixed(1)+"%";' +
            '},180);' +
        '}' +

        'function stopLoading(){' +
            'clearInterval(progressTimer);' +
            'if(document.body){' +
                'document.body.style.opacity="";' +
                'document.body.style.pointerEvents="";' +
            '}' +
            'var bar=getProgressBar();' +
            'bar.style.width="100%";' +
            'setTimeout(function(){' +
                'bar.style.opacity="0";' +
                'setTimeout(function(){bar.style.width="0%";},200);' +
            '},120);' +
        '}' +

        'function markSafeTargets(){' +
            'var links=document.querySelectorAll("a[href]");' +
            'for(var i=0;i<links.length;i++){' +
                'if(!links[i].getAttribute("target"))links[i].setAttribute("target","_top");' +
            '}' +
        '}' +

        'function parseTargetUrl(rawHref){' +
            'if(!rawHref)return null;' +
            'var trimmed=String(rawHref).trim();' +
            'if(!trimmed||trimmed.charAt(0)==="#"||/^(javascript|mailto|tel):/i.test(trimmed))return null;' +
            'var parsed;' +
            'try{parsed=new URL(trimmed,window.location.href);}catch(_){return null;}' +
            'var query={};' +
            'parsed.searchParams.forEach(function(v,k){query[k]=v;});' +
            'var routePath="";' +
            'if(Object.prototype.hasOwnProperty.call(query,"route")){' +
                'routePath=String(query.route||"").replace(/^\\/+|\\/+$/g,"");' +
                'delete query.route;' +
            '}else{' +
                'var cleanPath=parsed.pathname.replace(/^\\/+|\\/+$/g,"");' +
                'if(!/\\/(exec|dev)$/i.test(cleanPath))routePath=cleanPath;' +
            '}' +
            'if(routePath==="api"||routePath.indexOf("api/")===0)return null;' +
            'return{route:routePath,query:query};' +
        '}' +

        'function syncHeadAssets(nextHead){' +
            'if(!nextHead||!document.head)return;' +
            'var oldManaged=document.head.querySelectorAll("[data-asal-gas-head]");' +
            'for(var i=0;i<oldManaged.length;i++)oldManaged[i].remove();' +
            'var nextNodes=nextHead.querySelectorAll("style,link[rel=\'stylesheet\']");' +
            'for(var j=0;j<nextNodes.length;j++){' +
                'var clone=nextNodes[j].cloneNode(true);' +
                'clone.setAttribute("data-asal-gas-head","1");' +
                'document.head.appendChild(clone);' +
            '}' +
        '}' +

        'function swapDocument(htmlStr,routePath,queryObj,pushHistory){' +
            'var parser=new DOMParser();' +
            'var nextDoc=parser.parseFromString(String(htmlStr||""),"text/html");' +
            'if(nextDoc.title)document.title=nextDoc.title;' +
            'syncHeadAssets(nextDoc.head);' +
            'if(nextDoc.body){' +
                'document.body.className=nextDoc.body.className;' +
                'document.body.style.cssText=nextDoc.body.style.cssText;' +
                'document.body.innerHTML=nextDoc.body.innerHTML;' +
                'var scripts=document.body.querySelectorAll("script");' +
                'for(var i=0;i<scripts.length;i++){' +
                    'if(scripts[i].hasAttribute("data-asal-gas-runtime")){scripts[i].remove();continue;}' +
                    'var s=document.createElement("script");' +
                    'for(var a=0;a<scripts[i].attributes.length;a++){' +
                        'var attr=scripts[i].attributes[a];' +
                        's.setAttribute(attr.name,attr.value);' +
                    '}' +
                    's.textContent=scripts[i].textContent;' +
                    'scripts[i].parentNode.replaceChild(s,scripts[i]);' +
                '}' +
            '}' +
            'markSafeTargets();' +
            'window.scrollTo(0,0);' +
            'if(pushHistory&&hasGas&&window.google.script.history){' +
                'try{' +
                    'var hParams=Object.assign({},queryObj||{});' +
                    'if(routePath)hParams.route=routePath;' +
                    'window.google.script.history.push({route:routePath,query:queryObj||{}},hParams,"");' +
                '}catch(_){}' +
            '}' +
        '}' +

        'function navigateViaGas(method,routePath,queryObj,payloadObj,pushHistory){' +
            'startLoading();' +
            'window.google.script.run' +
                '.withSuccessHandler(function(res){' +
                    'stopLoading();' +
                    'if(!res)return;' +
                    'if(res.isHtml){' +
                        'swapDocument(res.html,res.route!==undefined?res.route:routePath,res.query||queryObj,pushHistory);' +
                    '}else{' +
                        'swapDocument("<pre style=\'white-space:pre-wrap;word-break:break-word;padding:16px;\'>"+String(res.html||"").replace(/</g,"&lt;")+"</pre>",routePath,queryObj,pushHistory);' +
                    '}' +
                '})' +
                '.withFailureHandler(function(err){' +
                    'stopLoading();' +
                    'alert("Failed to load page: "+(err&&err.message?err.message:String(err)));' +
                '})' +
                '.gasNavigate({method:method,route:routePath,query:queryObj||{},payload:payloadObj||{}});' +
        '}' +

        'markSafeTargets();' +
        'if(!hasGas)return;' +

        'document.addEventListener("click",function(e){' +
            'if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;' +
            'var link=e.target.closest("a[href]");' +
            'if(!link||link.hasAttribute("download"))return;' +
            'var t=(link.getAttribute("target")||"").toLowerCase();' +
            'if(t==="_blank")return;' +
            'var target=parseTargetUrl(link.getAttribute("href"));' +
            'if(!target)return;' +
            'e.preventDefault();' +
            'navigateViaGas("GET",target.route,target.query,null,true);' +
        '});' +

        'document.addEventListener("submit",function(e){' +
            'if(e.defaultPrevented)return;' +
            'var form=e.target;' +
            'if(!form||form.tagName!=="FORM")return;' +
            'var target=parseTargetUrl(form.getAttribute("action")||window.location.href);' +
            'if(!target)return;' +
            'e.preventDefault();' +
            'var payload={};' +
            'var fd=new FormData(form);' +
            'fd.forEach(function(val,key){' +
                'if(Object.prototype.hasOwnProperty.call(payload,key)){' +
                    'if(!Array.isArray(payload[key]))payload[key]=[payload[key]];' +
                    'payload[key].push(val);' +
                '}else{payload[key]=val;}' +
            '});' +
            'if(e.submitter&&e.submitter.name)payload[e.submitter.name]=e.submitter.value;' +
            'var btns=form.querySelectorAll("button[type=\'submit\'],input[type=\'submit\']");' +
            'for(var i=0;i<btns.length;i++)btns[i].disabled=true;' +
            'var method=String(form.getAttribute("method")||"POST").toUpperCase();' +
            'navigateViaGas(method,target.route,target.query,payload,false);' +
        '});' +

        'if(window.google.script.history&&typeof window.google.script.history.setChangeHandler==="function"){' +
            'window.google.script.history.setChangeHandler(function(e){' +
                'var loc=(e&&e.location)||{};' +
                'var params=Object.assign({},loc.parameter||{});' +
                'var routePath=String(params.route||"").replace(/^\\/+|\\/+$/g,"");' +
                'delete params.route;' +
                'navigateViaGas("GET",routePath,params,null,false);' +
            '});' +
        '}' +
        '})();' +
        '</script>';
}

function createHtmlOutputSafe(html, statusCode) {
    var content = String(html || "");
    if (typeof HtmlService !== "undefined" && typeof HtmlService.createHtmlOutput === "function") {
        var runtimeScript = _buildGasClientRuntimeScript();
        var enhancedContent = content;

        if (enhancedContent.indexOf("data-asal-gas-runtime") === -1) {
            if (/<\/body>/i.test(enhancedContent)) {
                enhancedContent = enhancedContent.replace(/<\/body>/i, runtimeScript + "</body>");
            } else {
                enhancedContent += runtimeScript;
            }
        }

        var out = HtmlService.createHtmlOutput(enhancedContent);
        if (typeof out.setXFrameOptionsMode === "function" && HtmlService.XFrameOptionsMode) {
            out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
        }
        if (typeof out.setSandboxMode === "function" && HtmlService.SandboxMode) {
            out.setSandboxMode(HtmlService.SandboxMode.IFRAME);
        }
        if (typeof out.addMetaTag === "function") {
            out.addMetaTag("viewport", "width=device-width, initial-scale=1");
        }
        var titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && typeof out.setTitle === "function") {
            out.setTitle(titleMatch[1].replace(/<[^>]+>/g, "").trim());
        }
        out._statusCode = statusCode || 200;
        return out;
    }

    return {
        _statusCode: statusCode || 200,
        getContent: function () { return content; },
        getMimeType: function () { return "HTML"; }
    };
}

function formatErrorResponse(err, statusCode, fallbackMessage, context) {
    var code = statusCode || (err && err.statusCode) || 500;
    var rawMessage = (err && err.message)
        ? String(err.message)
        : (typeof err === "string" && err ? err : (fallbackMessage || "Unexpected error"));

    if (typeof Logger !== "undefined" && typeof Logger.log === "function") {
        Logger.log("[ERROR " + code + "] " + rawMessage + (err && err.stack ? "\n" + err.stack : ""));
    }

    if (isDebugEnabled()) {
        var debugPayload = {
            _isException: true,
            status: false,
            code: code,
            error_type: (err && err.name) ? String(err.name) : "Error",
            message: rawMessage
        };

        if (err && (err.fileName || err.lineNumber)) {
            debugPayload.location = {
                file: err.fileName ? String(err.fileName) : "",
                line: err.lineNumber || null
            };
        }

        if (err && (err.errors || err.details)) {
            debugPayload.details = err.errors || err.details;
        }

        if (context && typeof context === "object") {
            debugPayload.context = {
                route: context.route || "",
                method: context.method || "",
                action: context.action || ""
            };
            if (context.debug) {
                debugPayload.debug = context.debug;
            }
        }

        if (err && err.stack) {
            var stackStr = String(err.stack);
            debugPayload.stack = stackStr;
            debugPayload.stack_trace = stackStr.split(/\r?\n/).map(function (line) {
                return line.trim();
            }).filter(Boolean);
        }

        return debugPayload;
    }

    var isExposed = Boolean(err && err.expose === true);
    var publicPayload = {
        _isException: true,
        status: false,
        code: code,
        message: isExposed
            ? rawMessage
            : (fallbackMessage || (code === 404 ? "404 Not Found" : "Internal server error."))
    };

    if (isExposed && err && err.name) {
        publicPayload.error_type = String(err.name);
    }

    return publicPayload;
}

function renderErrorHtml(errorPayload, isException) {
    var code = Number(errorPayload && errorPayload.code) || 500;
    var showDiagnostics = Boolean(isException) && isDebugEnabled();
    var appName = (typeof CONFIG !== "undefined" && typeof CONFIG.getOptional === "function")
        ? String(CONFIG.getOptional("APP_NAME", "Asal-GAS"))
        : "Asal-GAS";

    var title = showDiagnostics
        ? (errorPayload.error_type || "Error") + " (" + code + ") - " + appName
        : code + " | " + (errorPayload.message || "Internal Server Error");

    var bodyHtml = "";
    if (!showDiagnostics) {
        var validationJson = errorPayload.errors ? JSON.stringify(errorPayload.errors, null, 2) : "";
        bodyHtml =
            '<div class="card">' +
                '<div class="header">' +
                    '<span class="badge">HTTP ' + escapeHtml(code) + '</span>' +
                    (errorPayload.error_type ? '<span class="type">' + escapeHtml(errorPayload.error_type) + '</span>' : '') +
                '</div>' +
                '<h1 class="msg">' + escapeHtml(errorPayload.message || "Internal server error.") + '</h1>' +
                (validationJson ? '<h3>Details</h3><pre>' + escapeHtml(validationJson) + '</pre>' : '') +
                (isException ? '<p class="muted">Enable <code>APP_DEBUG=true</code> to inspect full error diagnostics.</p>' : '') +
            '</div>';
    } else {
        var ctx = errorPayload.context || {};
        var loc = errorPayload.location || {};
        var stackText = errorPayload.stack || (Array.isArray(errorPayload.stack_trace) ? errorPayload.stack_trace.join("\n") : "");
        var detailsJson = errorPayload.details ? JSON.stringify(errorPayload.details, null, 2) : "";
        var extraDebugJson = errorPayload.debug ? JSON.stringify(errorPayload.debug, null, 2) : "";

        bodyHtml =
            '<div class="card">' +
                '<div class="header">' +
                    '<span class="badge">HTTP ' + escapeHtml(code) + '</span>' +
                    '<span class="type">' + escapeHtml(errorPayload.error_type || "Error") + '</span>' +
                '</div>' +
                '<h1 class="msg">' + escapeHtml(errorPayload.message || "Unexpected error") + '</h1>' +
                '<div class="meta">' +
                    '<div><strong>Method:</strong> ' + escapeHtml(ctx.method || "-") + '</div>' +
                    '<div><strong>Route:</strong> /' + escapeHtml(ctx.route || "") + '</div>' +
                    '<div><strong>Action:</strong> ' + escapeHtml(ctx.action || "-") + '</div>' +
                    (loc.file ? '<div><strong>Location:</strong> ' + escapeHtml(loc.file + (loc.line ? ":" + loc.line : "")) + '</div>' : '') +
                '</div>' +
                (detailsJson ? '<h3>Details</h3><pre>' + escapeHtml(detailsJson) + '</pre>' : '') +
                (extraDebugJson ? '<h3>Debug Info</h3><pre>' + escapeHtml(extraDebugJson) + '</pre>' : '') +
                (stackText ? '<h3>Stack Trace</h3><pre>' + escapeHtml(stackText) + '</pre>' : '') +
            '</div>';
    }

    var html =
        '<!DOCTYPE html><html lang="en"><head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<meta name="http-status" content="' + escapeHtml(code) + '">' +
        '<title>' + escapeHtml(title) + '</title>' +
        '<style>' +
            'body{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;}' +
            '.card{max-width:960px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.35);}' +
            '.header{display:flex;align-items:center;gap:10px;margin-bottom:12px;}' +
            '.badge{background:#dc2626;color:#fff;font-weight:700;padding:4px 10px;border-radius:6px;font-size:13px;}' +
            '.type{color:#fca5a5;font-weight:700;font-size:15px;}' +
            '.msg{margin:8px 0 18px;font-size:20px;line-height:1.4;color:#f8fafc;word-break:break-word;}' +
            '.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;background:#0f172a;padding:12px 14px;border-radius:8px;border:1px solid #334155;font-size:13px;margin-bottom:18px;}' +
            'h3{margin:16px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;}' +
            'pre{background:#020617;color:#f8fafc;padding:14px;border-radius:8px;border:1px solid #334155;overflow-x:auto;font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;}' +
            '.muted{color:#94a3b8;font-size:14px;}' +
        '</style></head><body>' + bodyHtml + '</body></html>';

    return createHtmlOutputSafe(html, code);
}

function failResponse(message, code, extra) {
    var isErrInstance = message instanceof Error;
    var statusCode = code || (isErrInstance && message.statusCode) || 400;
    var msg = isErrInstance
        ? (message.message || "Request failed.")
        : (message || "Request failed.");

    var res = Object.assign({
        status: false,
        code: statusCode,
        message: msg
    }, extra || {});

    if (isErrInstance) {
        res._exception = message;
    } else if (res.error instanceof Error) {
        res._exception = res.error;
    }
    delete res.error;

    return res;
}

function handleResponse(responseObject, e, context) {
    if (responseObject && typeof responseObject.getContent === "function") {
        return responseObject;
    }

    var webMode = isWebRequest(e, context);

    if (responseObject && typeof responseObject === "object" && responseObject.status === false) {
        var isCaughtException = Boolean(
            responseObject._isException === true ||
            responseObject._exception instanceof Error ||
            responseObject.error instanceof Error
        );

        var cleaned = Object.assign({}, responseObject);

        if (isCaughtException && !responseObject._isException) {
            var rawErr = responseObject._exception instanceof Error
                ? responseObject._exception
                : responseObject.error;

            if (responseObject.errors && !rawErr.errors) {
                rawErr.errors = responseObject.errors;
            }

            var formatted = formatErrorResponse(
                rawErr,
                responseObject.code || rawErr.statusCode || 500,
                responseObject.message,
                context
            );
            cleaned = Object.assign({}, cleaned, formatted);
        }

        delete cleaned._isException;
        delete cleaned._exception;
        delete cleaned.error;

        if (webMode) {
            return renderErrorHtml(cleaned, isCaughtException);
        }

        return ContentService.createTextOutput(JSON.stringify(cleaned))
            .setMimeType(ContentService.MimeType.JSON);
    }

    if (typeof responseObject === "string" && webMode) {
        return createHtmlOutputSafe(responseObject, 200);
    }

    return ContentService.createTextOutput(JSON.stringify(responseObject))
        .setMimeType(ContentService.MimeType.JSON);
}

function handleHttpError(err, e, context) {
    var statusCode = (err && err.statusCode) ? err.statusCode : 500;
    var payload = typeof formatErrorResponse === "function"
        ? formatErrorResponse(err, statusCode, null, context)
        : { status: false, code: statusCode, message: "Internal server error." };

    return handleResponse(payload, e, context);
}
