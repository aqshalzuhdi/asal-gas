const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const MARKER_START = "# >>> asal-gas-cli >>>";
const MARKER_END = "# <<< asal-gas-cli <<<";

function isShellConfigured(profilePath) {
    if (!profilePath || !fs.existsSync(profilePath)) return false;
    const content = fs.readFileSync(profilePath, "utf8");
    return content.includes(MARKER_START) && content.includes("--no-deprecation");
}

function getGlobalNpmBinDir() {
    const isWin = process.platform === "win32";
    const probe = isWin
        ? spawnSync("npm.cmd prefix -g", { encoding: "utf8", shell: true })
        : spawnSync("npm", ["prefix", "-g"], { encoding: "utf8" });

    if (probe.status !== 0 || !probe.stdout) return null;
    const prefix = probe.stdout.trim();
    if (!prefix) return null;
    return isWin ? prefix : path.join(prefix, "bin");
}

function buildDynamicNodeShimJs() {
    return [
        "#!/usr/bin/env node",
        "process.noDeprecation = true;",
        "const fs = require('fs');",
        "const path = require('path');",
        "const { spawnSync } = require('child_process');",
        "",
        "let dir = path.resolve(process.cwd());",
        "let targetGas = null;",
        "while (true) {",
        "    const candidate = path.join(dir, 'gas');",
        "    try {",
        "        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {",
        "            targetGas = candidate;",
        "            break;",
        "        }",
        "    } catch (_) {}",
        "    const parent = path.dirname(dir);",
        "    if (parent === dir) break;",
        "    dir = parent;",
        "}",
        "",
        "if (!targetGas) {",
        "    console.error(\"❌ File 'gas' tidak ditemukan di direktori ini atau parent folder mana pun.\");",
        "    process.exit(1);",
        "}",
        "",
        "const res = spawnSync(process.execPath, ['--no-deprecation', targetGas, ...process.argv.slice(2)], {",
        "    cwd: path.dirname(targetGas),",
        "    stdio: 'inherit'",
        "});",
        "process.exit(res.status ?? 0);",
        ""
    ].join("\n");
}

function neutralizeStaleNpmLinkShims() {
    const globalBinDir = getGlobalNpmBinDir();
    if (!globalBinDir || !fs.existsSync(globalBinDir)) return;

    const dynamicJs = buildDynamicNodeShimJs();

    if (process.platform === "win32") {
        const npmGasCmd = path.join(globalBinDir, "gas.cmd");
        const npmGasPs1 = path.join(globalBinDir, "gas.ps1");
        const npmGasPosix = path.join(globalBinDir, "gas");
        const npmResolverJs = path.join(globalBinDir, "asal-gas-resolver.js");

        if (fs.existsSync(npmGasCmd) || fs.existsSync(npmGasPs1) || fs.existsSync(npmGasPosix)) {
            try {
                fs.writeFileSync(npmResolverJs, dynamicJs, "utf8");
                fs.writeFileSync(
                    npmGasCmd,
                    '@echo off\r\nnode --no-deprecation "%~dp0\\asal-gas-resolver.js" %*\r\n',
                    "utf8"
                );
                fs.writeFileSync(
                    npmGasPs1,
                    '#!/usr/bin/env pwsh\r\n& node --no-deprecation "$PSScriptRoot/asal-gas-resolver.js" @args\r\nexit $LASTEXITCODE\r\n',
                    "utf8"
                );
                fs.writeFileSync(
                    npmGasPosix,
                    '#!/bin/sh\nbasedir=$(dirname "$0")\nexec node --no-deprecation "$basedir/asal-gas-resolver.js" "$@"\n',
                    { encoding: "utf8", mode: 0o755 }
                );
            } catch (_) { }
        }
    } else {
        const npmGasBin = path.join(globalBinDir, "gas");
        try {
            if (fs.lstatSync(npmGasBin)) {
                fs.rmSync(npmGasBin, { force: true });
                fs.writeFileSync(npmGasBin, dynamicJs, { encoding: "utf8", mode: 0o755 });
                fs.chmodSync(npmGasBin, 0o755);
            }
        } catch (_) { }
    }
}

function ensureLocalProjectWrappers(projectRoot) {
    if (!projectRoot || !fs.existsSync(path.join(projectRoot, "gas"))) return;

    if (process.platform === "win32") {
        const localCmd = path.join(projectRoot, "gas.cmd");
        const expectedCmd = '@echo off\r\nnode --no-deprecation "%~dp0\\gas" %*\r\n';
        const currentCmd = fs.existsSync(localCmd) ? fs.readFileSync(localCmd, "utf8") : "";
        if (currentCmd !== expectedCmd) {
            try {
                fs.writeFileSync(localCmd, expectedCmd, "utf8");
            } catch (_) { }
        }
    } else {
        try {
            fs.chmodSync(path.join(projectRoot, "gas"), 0o755);
        } catch (_) { }
    }
}

function setupWindowsCmdAndPath(silent = false) {
    const shimDir = path.join(os.homedir(), ".asal-gas", "bin");
    const resolverJs = path.join(shimDir, "asal-gas-resolver.js");
    const shimCmd = path.join(shimDir, "gas.cmd");
    const shimPosix = path.join(shimDir, "gas");

    const expectedCmd = '@echo off\r\nnode --no-deprecation "%~dp0\\asal-gas-resolver.js" %*\r\n';
    const currentCmd = fs.existsSync(shimCmd) ? fs.readFileSync(shimCmd, "utf8") : "";

    const needsShimWrite =
        !fs.existsSync(resolverJs) ||
        !fs.existsSync(shimPosix) ||
        currentCmd !== expectedCmd;

    if (needsShimWrite) {
        fs.mkdirSync(shimDir, { recursive: true });
        fs.writeFileSync(resolverJs, buildDynamicNodeShimJs(), "utf8");
        fs.writeFileSync(shimCmd, expectedCmd, "utf8");
        fs.writeFileSync(
            shimPosix,
            '#!/bin/sh\nbasedir=$(dirname "$0")\nexec node --no-deprecation "$basedir/asal-gas-resolver.js" "$@"\n',
            { encoding: "utf8", mode: 0o755 }
        );
    }

    const psScript = [
        `$target = '${shimDir.replace(/'/g, "''")}'`,
        "$reg = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)",
        "$raw = $reg.GetValue('Path', '', 'DoNotExpandEnvironmentNames')",
        "$parts = @($raw -split ';' | Where-Object { $_ -and $_.Trim() -ne '' })",
        "if ($parts.Count -eq 0 -or $parts[0].TrimEnd('\\') -ine $target.TrimEnd('\\')) {",
        "    $filtered = @($parts | Where-Object { $_.TrimEnd('\\') -ine $target.TrimEnd('\\') })",
        "    $newPath = (@($target) + $filtered) -join ';'",
        "    $reg.SetValue('Path', $newPath, 'ExpandString')",
        "    Write-Output 'UPDATED'",
        "}",
        "$reg.Close()"
    ].join("; ");

    const res = spawnSync("powershell", ["-NoProfile", "-Command", psScript], {
        encoding: "utf8"
    });

    if (!silent && res.stdout && res.stdout.includes("UPDATED")) {
        console.log(`✅ Windows CMD/Global PATH synced: ${shimDir}`);
    }
}

function setupWindowsPowerShellProfile(silent = false) {
    const profileBlock = [
        MARKER_START,
        "function gas {",
        "    $dir = (Get-Location).Path",
        "    while ($dir) {",
        '        $localJs = Join-Path $dir "gas"',
        '        $localCmd = Join-Path $dir "gas.cmd"',
        "        if (Test-Path $localJs -PathType Leaf) { node --no-deprecation $localJs @args; return }",
        "        if (Test-Path $localCmd -PathType Leaf) { & $localCmd @args; return }",
        "        $parent = Split-Path $dir -Parent",
        "        if (-not $parent -or $parent -eq $dir) { break }",
        "        $dir = $parent",
        "    }",
        '    Write-Error "File \'gas\' tidak ditemukan di direktori ini atau parent folder mana pun."',
        "}",
        MARKER_END
    ].join("\r\n");

    const targetProfiles = new Set();
    for (const sh of ["powershell", "pwsh"]) {
        const probe = spawnSync(
            sh,
            ["-NoProfile", "-Command", "$PROFILE.CurrentUserAllHosts"],
            { encoding: "utf8" }
        );
        if (probe.status === 0 && probe.stdout && probe.stdout.trim()) {
            targetProfiles.add(probe.stdout.trim());
        }
    }

    if (targetProfiles.size === 0) return;

    const allConfigured = Array.from(targetProfiles).every((p) => isShellConfigured(p));
    if (allConfigured) return;

    spawnSync(
        "powershell",
        [
            "-NoProfile",
            "-Command",
            "if ((Get-ExecutionPolicy -Scope CurrentUser) -in @('Restricted','Undefined')) { Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force }"
        ],
        { stdio: "ignore" }
    );

    for (const profilePath of targetProfiles) {
        fs.mkdirSync(path.dirname(profilePath), { recursive: true });
        let content = fs.existsSync(profilePath)
            ? fs.readFileSync(profilePath, "utf8")
            : "";

        const regex = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\r?\\n?`, "g");
        if (regex.test(content)) {
            content = content.replace(regex, `${profileBlock}\r\n`);
        } else {
            const sep = content && !content.endsWith("\n") ? "\r\n\r\n" : content ? "\r\n" : "";
            content = `${content}${sep}${profileBlock}\r\n`;
        }

        fs.writeFileSync(profilePath, content, "utf8");
        if (!silent) {
            console.log(`✅ PowerShell profile synced: ${profilePath}`);
        }
    }
}

function setupUnixShellProfiles(silent = false) {
    const home = os.homedir();
    const posixBlock = [
        MARKER_START,
        "gas() {",
        '    local dir="$PWD"',
        '    while [ -n "$dir" ]; do',
        '        if [ -f "$dir/gas" ]; then',
        '            node --no-deprecation "$dir/gas" "$@"',
        "            return $?",
        "        fi",
        '        local parent="$(dirname "$dir")"',
        '        if [ "$parent" = "$dir" ]; then',
        "            break",
        "        fi",
        '        dir="$parent"',
        "    done",
        "    echo \"❌ File 'gas' tidak ditemukan di direktori ini atau parent folder mana pun.\" >&2",
        "    return 1",
        "}",
        MARKER_END
    ].join("\n");

    const candidates = [
        path.join(home, ".zshrc"),
        path.join(home, ".bashrc"),
        path.join(home, ".bash_profile"),
        path.join(home, ".profile")
    ];

    const defaultRc = process.platform === "darwin"
        ? path.join(home, ".zshrc")
        : path.join(home, ".bashrc");

    const targets = new Set(candidates.filter((p) => fs.existsSync(p)));
    targets.add(defaultRc);

    const regex = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`, "g");

    for (const rcPath of targets) {
        if (isShellConfigured(rcPath)) continue;

        let content = fs.existsSync(rcPath) ? fs.readFileSync(rcPath, "utf8") : "";
        if (regex.test(content)) {
            content = content.replace(regex, `${posixBlock}\n`);
        } else {
            const sep = content && !content.endsWith("\n") ? "\n\n" : content ? "\n" : "";
            content = `${content}${sep}${posixBlock}\n`;
        }

        fs.writeFileSync(rcPath, content, "utf8");
        if (!silent) {
            console.log(`✅ Shell profile synced: ${rcPath}`);
        }
    }

    const fishConfig = path.join(home, ".config", "fish", "config.fish");
    if (fs.existsSync(path.dirname(fishConfig)) && !isShellConfigured(fishConfig)) {
        const fishBlock = [
            MARKER_START,
            "function gas",
            "    set -l dir (pwd)",
            '    while test -n "$dir"',
            '        if test -f "$dir/gas"',
            '            node --no-deprecation "$dir/gas" $argv',
            "            return $status",
            "        end",
            '        set -l parent (dirname "$dir")',
            '        if test "$parent" = "$dir"',
            "            break",
            "        end",
            '        set dir "$parent"',
            "    end",
            "    echo \"❌ File 'gas' tidak ditemukan di direktori ini atau parent folder mana pun.\" >&2",
            "    return 1",
            "end",
            MARKER_END
        ].join("\n");

        let content = fs.existsSync(fishConfig) ? fs.readFileSync(fishConfig, "utf8") : "";
        const regexFish = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`, "g");
        if (regexFish.test(content)) {
            content = content.replace(regexFish, `${fishBlock}\n`);
        } else {
            const sep = content && !content.endsWith("\n") ? "\n\n" : content ? "\n" : "";
            content = `${content}${sep}${fishBlock}\n`;
        }
        fs.writeFileSync(fishConfig, content, "utf8");
        if (!silent) {
            console.log(`✅ Fish shell config synced: ${fishConfig}`);
        }
    }
}

function syncShellIntegration(silent = false, projectRoot = null) {
    if (projectRoot) {
        ensureLocalProjectWrappers(projectRoot);
    }

    neutralizeStaleNpmLinkShims();

    if (process.platform === "win32") {
        setupWindowsCmdAndPath(silent);
        setupWindowsPowerShellProfile(silent);
    } else {
        setupUnixShellProfiles(silent);
    }
}

if (require.main === module) {
    const detectedRoot = path.resolve(__dirname, "..", "..");
    syncShellIntegration(false, detectedRoot);
}

module.exports = {
    syncShellIntegration,
    setupWindowsPowerShellProfile
};
