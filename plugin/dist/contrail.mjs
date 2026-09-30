var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/shell-quote/quote.js
var require_quote = __commonJS({
  "node_modules/shell-quote/quote.js"(exports, module) {
    "use strict";
    var OPS = (
      /** @type {const} */
      [
        "||",
        "&&",
        ";;",
        "|&",
        "<(",
        "<<<",
        ">>",
        ">&",
        "<&",
        "&",
        ";",
        "(",
        ")",
        "|",
        "<",
        ">"
      ]
    );
    var LINE_TERMINATORS = /[\n\r\u2028\u2029]/;
    var GLOB_SHELL_SPECIAL = /[\s#!"$&'():;<=>@\\^`|]/g;
    module.exports = function quote2(xs) {
      return xs.map(function(s) {
        if (s === "") {
          return (
            /** @type {const} */
            "''"
          );
        }
        if (s && typeof s === "object") {
          if ("op" in s && s.op === "glob") {
            if (typeof s.pattern !== "string") {
              throw new TypeError("glob token requires a string `pattern`");
            }
            if (LINE_TERMINATORS.test(s.pattern)) {
              throw new TypeError("glob `pattern` must not contain line terminators");
            }
            return s.pattern.replace(GLOB_SHELL_SPECIAL, "\\$&");
          }
          if ("op" in s && typeof s.op === "string") {
            if (OPS.indexOf(s.op) < 0) {
              throw new TypeError("invalid `op` value: " + JSON.stringify(s.op));
            }
            return s.op.replace(/[\s\S]/g, "\\$&");
          }
          if ("comment" in s && typeof s.comment === "string") {
            if (LINE_TERMINATORS.test(s.comment)) {
              throw new TypeError("`comment` must not contain line terminators");
            }
            return "#" + s.comment;
          }
          throw new TypeError("unrecognized object token shape");
        }
        if (/["\s\\]/.test(s) && !/'/.test(s)) {
          return "'" + s.replace(/(['])/g, "\\$1") + "'";
        }
        if (/["'\s]/.test(s)) {
          return '"' + s.replace(/(["\\$`!])/g, "\\$1") + '"';
        }
        return String(s).replace(/([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}~])/g, "$1\\$2");
      }).join(" ");
    };
  }
});

// node_modules/shell-quote/parse.js
var require_parse = __commonJS({
  "node_modules/shell-quote/parse.js"(exports, module) {
    "use strict";
    var CONTROL = (
      /** @type {const} */
      "(?:" + /** @type {const} */
      [
        "\\|\\|",
        "\\&\\&",
        ";;",
        "\\|\\&",
        "\\<\\(",
        "\\<\\<\\<",
        ">>",
        ">\\&",
        "<\\&",
        "[&;()|<>]"
      ].join(
        /** @type {const} */
        "|"
      ) + /** @type {const} */
      ")"
    );
    var controlRE = new RegExp("^" + CONTROL + "$");
    var META = (
      /** @type {const} */
      "|&;()<> \\t"
    );
    var SINGLE_QUOTE = (
      /** @type {const} */
      "'([^']*?)'"
    );
    var DOUBLE_QUOTE = (
      /** @type {const} */
      '"((\\\\"|[^"])*?)"'
    );
    var hash = /^#$/;
    var SQ = (
      /** @type {const} */
      "'"
    );
    var DQ = (
      /** @type {const} */
      '"'
    );
    var DS = (
      /** @type {const} */
      "$"
    );
    var TOKEN = "";
    var mult = (
      /** @type {const} */
      4294967296
    );
    for (i = 0; i < 4; i++) {
      TOKEN += (mult * Math.random()).toString(16);
    }
    var i;
    var startsWithToken = new RegExp("^" + TOKEN);
    function matchAll(s, r) {
      var origIndex = r.lastIndex;
      var matches = [];
      var matchObj;
      while (matchObj = r.exec(s)) {
        matches[matches.length] = matchObj;
        if (r.lastIndex === matchObj.index) {
          r.lastIndex += 1;
        }
      }
      r.lastIndex = origIndex;
      return matches;
    }
    function getVar(env, pre, key) {
      var r = typeof env === "function" ? env(key) : env[key];
      if (typeof r === "undefined" && key != "") {
        r = "";
      } else if (typeof r === "undefined") {
        r = "$";
      }
      if (typeof r === "object") {
        return pre + TOKEN + JSON.stringify(r) + TOKEN;
      }
      return pre + r;
    }
    function parseInternal(string, env, opts) {
      if (!opts) {
        opts = {};
      }
      var BS = opts.escape || "\\";
      var ifs = opts.splitUnquoted === true ? " 	\n" : typeof opts.splitUnquoted === "string" ? opts.splitUnquoted : "";
      var BAREWORD = "(\\" + BS + `['"` + META + `]|[^\\s'"` + META + "])+";
      var chunker = new RegExp([
        "(" + CONTROL + ")",
        // control chars
        "(" + BAREWORD + "|" + DOUBLE_QUOTE + "|" + SINGLE_QUOTE + ")+"
      ].join("|"), "g");
      var matches = matchAll(string, chunker);
      if (matches.length === 0) {
        return [];
      }
      if (!env) {
        env = {};
      }
      var commented = false;
      return matches.map(function(match) {
        var s = match[0];
        if (!s || commented) {
          return void 0;
        }
        if (controlRE.test(s)) {
          return (
            /** @type {ControlOperator} */
            { op: s }
          );
        }
        var quote2 = false;
        var esc = false;
        var out = "";
        var words2 = [];
        var sawQuote = false;
        var pendingNw = null;
        var isGlob = false;
        var i2;
        function parseEnvVar() {
          i2 += 1;
          var varend;
          var varname;
          var char = s.charAt(i2);
          if (char === "{") {
            i2 += 1;
            if (s.charAt(i2) === "}") {
              throw new Error("Bad substitution: " + s.slice(i2 - 2, i2 + 1));
            }
            var depth = 1;
            varend = i2;
            while (depth > 0 && varend < s.length) {
              if (s.charAt(varend) === "{" && s.charAt(varend - 1) === "$") {
                depth += 1;
              } else if (s.charAt(varend) === "}") {
                depth -= 1;
              }
              varend += 1;
            }
            if (depth !== 0) {
              throw new Error("Bad substitution: " + s.slice(i2));
            }
            varend -= 1;
            varname = s.slice(i2, varend);
            i2 = varend;
          } else if (/[*@#?$!_-]/.test(char)) {
            varname = char;
            i2 += 1;
          } else {
            var slicedFromI = s.slice(i2);
            varend = slicedFromI.match(/[^\w\d_]/);
            if (!varend) {
              varname = slicedFromI;
              i2 = s.length;
            } else {
              varname = slicedFromI.slice(0, varend.index);
              i2 += /** @type {number} */
              varend.index - 1;
            }
          }
          return getVar(
            /** @type {NonNullable<typeof env>} */
            env,
            "",
            varname
          );
        }
        function flushRun() {
          if (pendingNw === null) {
            return;
          }
          if (pendingNw === 0) {
            if (out !== "") {
              words2[words2.length] = out;
              out = "";
            }
          } else {
            words2[words2.length] = out;
            out = "";
            for (var fe = 1; fe < pendingNw; fe += 1) {
              words2[words2.length] = "";
            }
          }
          pendingNw = null;
        }
        for (i2 = 0; i2 < s.length; i2++) {
          var c = s.charAt(i2);
          if (ifs && c !== DS) {
            flushRun();
          }
          isGlob = isGlob || !quote2 && (c === "*" || c === "?");
          if (esc) {
            out += c;
            esc = false;
          } else if (quote2) {
            if (c === quote2) {
              quote2 = false;
            } else if (quote2 == SQ) {
              out += c;
            } else {
              if (c === BS) {
                i2 += 1;
                c = s.charAt(i2);
                if (c === DQ || c === BS || c === DS) {
                  out += c;
                } else {
                  out += BS + c;
                }
              } else if (c === DS) {
                out += parseEnvVar();
              } else {
                out += c;
              }
            }
          } else if (c === DQ || c === SQ) {
            quote2 = c;
            sawQuote = true;
          } else if (controlRE.test(c)) {
            return (
              /** @type {ControlOperator} */
              { op: s }
            );
          } else if (hash.test(c)) {
            commented = true;
            var commentObj = { comment: string.slice(match.index + i2 + 1) };
            if (out.length) {
              return (
                /** @type {const} */
                [out, commentObj]
              );
            }
            return (
              /** @type {const} */
              [commentObj]
            );
          } else if (c === BS) {
            esc = true;
          } else if (c === DS) {
            var value = parseEnvVar();
            if (!ifs) {
              out += value;
            } else {
              for (var vi = 0; vi < value.length; vi += 1) {
                var vc = value.charAt(vi);
                if (ifs.indexOf(vc) < 0) {
                  flushRun();
                  out += vc;
                } else if (pendingNw === null) {
                  pendingNw = vc === " " || vc === "	" || vc === "\n" ? 0 : 1;
                } else if (vc !== " " && vc !== "	" && vc !== "\n") {
                  pendingNw += 1;
                }
              }
            }
          } else {
            out += c;
          }
        }
        if (isGlob) {
          return (
            /** @type {GlobPattern} */
            { op: "glob", pattern: out }
          );
        }
        if (ifs) {
          if (pendingNw !== null && pendingNw > 0) {
            words2[words2.length] = out;
            out = "";
            for (var te = 1; te < pendingNw; te += 1) {
              words2[words2.length] = "";
            }
          }
          if (out !== "" || sawQuote && words2.length === 0) {
            words2[words2.length] = out;
          }
          return words2;
        }
        return out;
      }).reduce(
        function(prev, arg) {
          if (typeof arg === "undefined") {
            return prev;
          }
          [].concat(arg).forEach(function(entry) {
            prev[prev.length] = entry;
          });
          return prev;
        },
        /** @type {ParseEntry[]} */
        []
      );
    }
    module.exports = function parse2(s, env, opts) {
      var mapped = parseInternal(s, env, opts);
      if (typeof env !== "function") {
        return mapped;
      }
      return mapped.reduce(
        function(acc, s2) {
          if (typeof s2 === "object") {
            acc[acc.length] = s2;
            return acc;
          }
          var xs = s2.split(RegExp("(" + TOKEN + ".*?" + TOKEN + ")", "g"));
          if (xs.length === 1) {
            acc[acc.length] = xs[0];
            return acc;
          }
          xs.filter(Boolean).forEach(function(x) {
            acc[acc.length] = startsWithToken.test(x) ? JSON.parse(x.split(TOKEN)[1]) : x;
          });
          return acc;
        },
        /** @type {ParseEntry[]} */
        []
      );
    };
  }
});

// node_modules/shell-quote/index.js
var require_shell_quote = __commonJS({
  "node_modules/shell-quote/index.js"(exports) {
    "use strict";
    exports.quote = require_quote();
    exports.parse = require_parse();
  }
});

// src/main.ts
import { homedir as homedir2 } from "node:os";

// src/cli.ts
import { spawnSync } from "node:child_process";
import { chmodSync as chmodSync2, existsSync as existsSync3, mkdirSync, mkdtempSync, readdirSync as readdirSync3, readFileSync as readFileSync5, renameSync, rmSync as rmSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { basename as basename7, dirname as dirname3, join as join7, resolve as resolve7 } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// src/engine/effects.ts
import { basename as basename3, isAbsolute as isAbsolute3, resolve as resolve3 } from "node:path";

// src/util.ts
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
function stringLeaves(value, path = "$") {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => stringLeaves(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => stringLeaves(v, `${path}.${k}`));
  }
  return [];
}
function toText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((b) => b && typeof b === "object" && "type" in b)) {
    return value.map((b) => field(b, "text")).filter((t) => typeof t === "string").join("\n");
  }
  return stringLeaves(value).map((l) => l.value).join("\n");
}
function field(o, key) {
  return o && typeof o === "object" && !Array.isArray(o) ? o[key] : void 0;
}
function str(o, key) {
  const v = field(o, key);
  return typeof v === "string" ? v : void 0;
}
function obj(o, key) {
  const v = field(o, key);
  return v && typeof v === "object" && !Array.isArray(v) ? v : void 0;
}
function arr(v) {
  return Array.isArray(v) ? v : [];
}
function hostPath(url) {
  try {
    const u = new URL(url);
    return (u.host.toLowerCase() + u.pathname).replace(/\/+$/, "");
  } catch {
    return url;
  }
}
function displayPath(path, cwd, home) {
  if (cwd && path === cwd) return ".";
  if (cwd && path.startsWith(cwd + "/")) return relative(cwd, path);
  if (home && path.startsWith(home + "/")) return "~/" + path.slice(home.length + 1);
  return path;
}
function changedFiles(response, cwd) {
  const diff = obj(response, "bashEditDiff");
  return arr(field(diff, "changedFiles")).map((f) => typeof f === "string" ? f : str(f, "path") ?? str(f, "filePath") ?? str(f, "file")).filter((f) => Boolean(f)).map((f) => isAbsolute(f) || !cwd ? f : resolve(cwd, f));
}
function clip(s, max) {
  const one = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "\uFFFD").replace(/`/g, "'").replace(/\s+/g, " ").trim();
  return one.length <= max ? one : one.slice(0, max - 1) + "\u2026";
}
function callId(id) {
  const safe = id.replace(/[^\w-]/g, "?");
  return safe.length > 12 ? `${safe.slice(0, 5)}\u2026${safe.slice(-5)}` : safe;
}
function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    try {
      return join(realpathSync(dirname(path)), basename(path));
    } catch {
      return path;
    }
  }
}

// src/engine/tokens.ts
var import_shell_quote = __toESM(require_shell_quote(), 1);
import { basename as basename2, dirname as dirname2, isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";

// src/engine/text.ts
var INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;
var READ_PREFIX = /^\s*(\d+)(?:→|\t)(.*)$/;
function normalize(s) {
  return s.normalize("NFKC").replace(INVISIBLE, "").toLowerCase();
}
function isShaped(raw) {
  return /[-_./@:]|\d|[a-z][A-Z]/.test(raw);
}
function findMention(text, token) {
  return findNormalized(normalize(text), normalize(token));
}
function findNormalized(hay, needle) {
  if (!needle) return -1;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    if (!isWordCode(hay.charCodeAt(i - 1)) && !isWordCode(hay.charCodeAt(i + needle.length))) return i;
  }
  return -1;
}
function isWordCode(c) {
  return c >= 97 && c <= 122 || c >= 48 && c <= 57 || c === 95 || c === 45;
}
function lineOf(text, index, normalized = normalize(text)) {
  const end = Math.max(0, index);
  let lineIndex = 0;
  for (let k = normalized.indexOf("\n"); k !== -1 && k < end; k = normalized.indexOf("\n", k + 1)) lineIndex++;
  let start = 0;
  for (let n = 0; n < lineIndex && start !== -1; n++) {
    const next = text.indexOf("\n", start);
    start = next === -1 ? -1 : next + 1;
  }
  const stop = start === -1 ? -1 : text.indexOf("\n", start);
  const raw = start === -1 ? "" : text.slice(start, stop === -1 ? text.length : stop);
  const prefixed = READ_PREFIX.exec(raw);
  if (prefixed) return { line: Number(prefixed[1]), text: prefixed[2].trim() };
  return { line: text.includes("\n") ? lineIndex + 1 : null, text: raw.trim() };
}

// src/engine/tokens.ts
var STOP = /* @__PURE__ */ new Set([
  "bash",
  "echo",
  "printf",
  "grep",
  "head",
  "tail",
  "find",
  "sort",
  "uniq",
  "xargs",
  "true",
  "false",
  "test",
  "mkdir",
  "touch",
  "chmod",
  "sudo",
  "export",
  "source",
  "node",
  "python",
  "python3",
  "deno",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bunx",
  "install",
  "uninstall",
  "run",
  "build",
  "start",
  "exec",
  "remove",
  "update",
  "init",
  "save",
  "global",
  "latest",
  "git",
  "commit",
  "push",
  "pull",
  "fetch",
  "clone",
  "status",
  "diff",
  "checkout",
  "switch",
  "branch",
  "merge",
  "rebase",
  "stash",
  "origin",
  "main",
  "master",
  "head",
  "const",
  "function",
  "return",
  "import",
  "export",
  "from",
  "default",
  "class",
  "async",
  "await",
  "null",
  "undefined",
  "this",
  "self",
  "none",
  "else",
  "elif",
  "while",
  "with",
  "type",
  "interface",
  "string",
  "number",
  "boolean",
  "object",
  "void",
  "public",
  "private",
  "static",
  "true",
  "false",
  "read",
  "write",
  "edit",
  "multiedit",
  "glob",
  "webfetch",
  "websearch",
  "task",
  "agent",
  "skill",
  "todowrite"
]);
var GENERIC_BASENAMES = /* @__PURE__ */ new Set([
  "readme.md",
  "readme",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "makefile",
  "dockerfile",
  "go.mod",
  "go.sum",
  "cargo.toml",
  "cargo.lock",
  "pyproject.toml",
  "requirements.txt",
  ".gitignore",
  ".env",
  "claude.md"
]);
var GENERIC_DIRS = /* @__PURE__ */ new Set(["src", "lib", "app", "test", "tests", "dist", "build", "docs", "scripts", "packages", "utils", "node_modules"]);
var INSTALL_VERBS = {
  npm: ["install", "i", "add"],
  pnpm: ["install", "i", "add"],
  yarn: ["add"],
  bun: ["install", "i", "add"],
  pip: ["install"],
  pip3: ["install"],
  cargo: ["add"],
  go: ["get"],
  gem: ["install"],
  brew: ["install"],
  uv: ["add"]
};
var RUNNERS = /* @__PURE__ */ new Set(["npx", "bunx", "pnpx", "uvx"]);
var WRAPPERS = /* @__PURE__ */ new Set(["sudo", "env", "time", "nohup", "command", "exec", "nice", "timeout"]);
var WRAPPER_VALUE_OPTIONS = /* @__PURE__ */ new Set(["sudo -u", "sudo -g", "sudo -C", "sudo -h", "sudo -p", "env -u", "env -C", "nice -n", "timeout -s", "timeout -k"]);
function unwrapCommand(words2) {
  let argv = words2;
  for (let guard = 0; guard < 8 && argv.length; guard++) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0])) {
      argv = argv.slice(1);
      continue;
    }
    const wrapper = basename2(argv[0]);
    if (!WRAPPERS.has(wrapper)) break;
    argv = argv.slice(1);
    while (argv.length && argv[0].startsWith("-") && argv[0] !== "-") {
      const option = argv[0];
      argv = argv.slice(WRAPPER_VALUE_OPTIONS.has(`${wrapper} ${option}`) ? 2 : 1);
    }
    if (wrapper === "timeout" && argv.length) argv = argv.slice(1);
  }
  return argv;
}
var URL_RE = /https?:\/\/[^\s'"<>)\]]{1,2048}/g;
var WORD_RUN = /[A-Za-z0-9_@][A-Za-z0-9_\-./@:]{0,4096}/g;
var WORD_END = /[^A-Za-z0-9_]{1,4096}$/;
var WORDS_SCAN = 64 * 1024;
var MAX_HINTS = 20;
var MAX_TARGETS = 40;
function extractTokens(action, env) {
  const b = collector(env);
  const input = action.input;
  const tool = action.tool;
  if (tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") {
    b.path(str(input, "file_path") ?? str(input, "notebook_path") ?? "", 0, "$.file_path");
    if (tool === "MultiEdit") {
      arr(input.edits).forEach((e, i) => b.newNames(str(e, "old_string") ?? "", str(e, "new_string") ?? "", `$.edits[${i}].new_string`));
    } else {
      b.newNames(str(input, "old_string") ?? "", str(input, "new_string") ?? str(input, "new_source") ?? "", "$.new_string");
    }
  } else if (tool === "Write") {
    b.path(str(input, "file_path") ?? "", 0, "$.file_path");
    b.hints(str(input, "content") ?? "", "$.content");
  } else if (tool === "Bash") {
    bash(str(input, "command") ?? "", b);
  } else if (tool === "WebFetch") {
    const url = str(input, "url");
    if (url) b.target(hostPath(url), 0, "$.url", true);
    b.hints(str(input, "prompt") ?? "", "$.prompt");
  } else if (tool.startsWith("mcp__")) {
    for (const leaf of stringLeaves(input)) {
      if (/^https?:\/\//.test(leaf.value)) b.target(hostPath(leaf.value), 0, leaf.path, true);
      else if (leaf.value.length <= 64 && !/\s/.test(leaf.value)) b.target(leaf.value, 0, leaf.path);
      else b.hints(leaf.value, leaf.path);
    }
  } else if (tool === "Skill") {
    const name = str(input, "skill");
    if (name) b.target(name, 0, "$.skill", true);
  } else if (tool === "Agent" || tool === "Task") {
    b.hints(str(input, "prompt") ?? "", "$.prompt");
  } else {
    for (const leaf of stringLeaves(input)) {
      if (looksLikePath(leaf.value)) b.path(leaf.value, 0, leaf.path);
      else b.hints(leaf.value, leaf.path);
    }
  }
  return b.tokens();
}
function collector(env) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const noise = new Set(
    [...env.cwd.split("/"), ...env.home.split("/"), env.user].filter(Boolean).map((s) => s.toLowerCase())
  );
  let hintCount = 0;
  let targetCount = 0;
  const passes = (raw) => {
    const lower = raw.toLowerCase();
    return raw.length >= 4 && /[a-z]/i.test(raw) && !raw.startsWith("-") && !raw.startsWith("[REDACTED") && !STOP.has(lower) && !noise.has(lower);
  };
  const push = (text, role, group, argPath, derived = false) => {
    const key = `${role}:${group}:${text.toLowerCase()}`;
    if (!text || seen.has(key)) return false;
    seen.add(key);
    out.push({ text, role, group, shaped: isShaped(text), derived, argPath });
    return true;
  };
  const api = {
    /** `exempt` skips the word filters, for values that are explicit on purpose (packages, URLs, skills). */
    target(text, group, argPath, exempt = false) {
      if (targetCount < MAX_TARGETS && (exempt ? text.length >= 2 : passes(text)) && push(text, "target", group, argPath)) targetCount++;
    },
    hint(text, argPath) {
      if (hintCount < MAX_HINTS && passes(text) && isShaped(text) && push(text, "hint", null, argPath)) hintCount++;
    },
    hints(text, argPath) {
      for (const w of words(text)) api.hint(w, argPath);
    },
    newNames(oldText, newText, argPath) {
      const old = new Set(words(oldText).map((w) => w.toLowerCase()));
      for (const w of words(newText)) if (!old.has(w.toLowerCase())) api.hint(w, argPath);
    },
    path(p, group, argPath) {
      if (!p) return;
      const expanded = p === "~" || p.startsWith("~/") ? env.home + p.slice(1) : p;
      const abs = isAbsolute2(expanded) ? expanded : resolve2(env.cwd || "/", expanded);
      if (abs === env.cwd || abs === env.home || abs === "/") return;
      const rel = displayPath(abs, env.cwd, env.home);
      if (targetCount >= MAX_TARGETS) return;
      if (push(rel, "target", group, argPath)) targetCount++;
      const base = basename2(abs);
      if (!GENERIC_BASENAMES.has(base.toLowerCase())) {
        if (base !== rel && passes(base)) push(base, "target", group, argPath);
        const stem = base.replace(/\.[^.]+$/, "");
        if (stem !== base && passes(stem)) push(stem, "target", group, argPath, true);
      }
      for (const seg of dirname2(rel).split("/")) {
        if (seg && seg !== "." && seg !== "~" && !GENERIC_DIRS.has(seg.toLowerCase())) api.hint(seg, argPath);
      }
    },
    tokens: () => out
  };
  return api;
}
function words(text) {
  const found = [];
  const rest = text.slice(0, WORDS_SCAN).replace(URL_RE, (url) => {
    found.push(hostPath(url));
    return " ";
  });
  for (const m of rest.matchAll(WORD_RUN)) {
    const word = m[0].replace(WORD_END, "");
    if (word.length >= 2) found.push(word);
  }
  return found;
}
function looksLikePath(s) {
  if (/\s/.test(s) || /^https?:\/\//.test(s) || s.includes("=")) return false;
  return /[a-z]/i.test(s) && (/^[.~/]/.test(s) || s.includes("/") || /\.[A-Za-z0-9]{1,6}$/.test(s));
}
function bash(command, b) {
  let group = 0;
  for (const seg of segments(command)) {
    const argv = unwrapCommand(seg.words);
    if (argv.length === 0) continue;
    const prog = basename2(argv[0]);
    const args = argv.slice(1);
    const packages = installArgs(prog, args);
    if (packages) {
      for (const p of packages) b.target(stripVersion(p), group++, "$.command", true);
      continue;
    }
    if (prog === "git") {
      const sub = gitSubcommand(args);
      if (sub === "commit" || sub === "push") {
        b.target(sub, group++, "$.command", true);
        const message = commitMessage(args);
        if (message) b.hints(message, "$.command");
        continue;
      }
    }
    const g = group++;
    for (const a of [...args, ...seg.redirects]) {
      if (/^https?:\/\//.test(a)) b.target(hostPath(a), g, "$.command", true);
      else if (/\s/.test(a)) b.hints(a, "$.command");
      else if (looksLikePath(a)) b.path(a, g, "$.command");
      else if (isShaped(a)) b.target(a, g, "$.command");
    }
  }
}
function shellSegments(command) {
  return segments(command);
}
function segments(command) {
  const out = [];
  for (const line of withoutHeredocs(logicalLines(command)).map(withoutFdNumbers)) {
    let entries;
    try {
      entries = (0, import_shell_quote.parse)(line, (key) => `$${key}`);
    } catch {
      entries = line.split(/\s+/).filter(Boolean);
    }
    let cur = { words: [], redirects: [] };
    let redirectNext = false;
    for (const e of entries) {
      if (typeof e === "string") {
        if ((redirectNext === ">&" || redirectNext === "<&") && /^(\d{1,4}|-)$/.test(e)) {
          redirectNext = false;
          continue;
        }
        (redirectNext === ">" || redirectNext === ">&" ? cur.redirects : cur.words).push(e);
        redirectNext = false;
        continue;
      }
      if ("comment" in e) break;
      if ("pattern" in e) {
        cur.words.push(e.pattern);
        continue;
      }
      if (e.op === ">" || e.op === ">>" || e.op === ">&") {
        redirectNext = e.op === ">&" ? ">&" : ">";
        continue;
      }
      if (e.op === "<") continue;
      if (e.op === "<&") {
        redirectNext = "<&";
        continue;
      }
      if (cur.words.length || cur.redirects.length) out.push(cur);
      cur = { words: [], redirects: [] };
    }
    if (cur.words.length || cur.redirects.length) out.push(cur);
  }
  return out;
}
function logicalLines(command) {
  const out = [];
  let cur = "";
  let quote2 = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote2) {
      if (ch === quote2) quote2 = null;
      else if (ch === "\\" && quote2 === '"') {
        cur += ch + (command[++i] ?? "");
        continue;
      }
    } else if (ch === "'" || ch === '"') {
      quote2 = ch;
    } else if (ch === "\\" && command[i + 1] === "\n") {
      i++;
      cur += " ";
      continue;
    } else if (ch === "\n") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function withoutFdNumbers(line) {
  let out = "";
  let quote2 = null;
  let wordStart = true;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote2) {
      if (ch === quote2) quote2 = null;
      else if (ch === "\\" && quote2 === '"') {
        out += ch + (line[++i] ?? "");
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote2 = ch;
      wordStart = false;
    } else if (ch === "\\") {
      out += ch + (line[++i] ?? "");
      wordStart = false;
      continue;
    } else if (wordStart && /^\d{1,4}[<>]/.test(line.slice(i, i + 5))) {
      while (/\d/.test(line[i])) i++;
      i--;
      wordStart = false;
      continue;
    } else {
      wordStart = /[\s;|&(]/.test(ch);
    }
    out += ch;
  }
  return out;
}
function withoutHeredocs(lines) {
  const out = [];
  let end = null;
  for (const line of lines) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;
    }
    out.push(line);
    const heredoc = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(line);
    if (heredoc) end = heredoc[2];
  }
  return out;
}
function installArgs(prog, args) {
  const plain = args.filter((a) => !a.startsWith("-"));
  if (RUNNERS.has(prog)) return plain.slice(0, 1);
  if (prog === "uv" && plain[0] === "pip" && plain[1] === "install") return plain.slice(2);
  const verbs = INSTALL_VERBS[prog];
  if (verbs && plain[0] && verbs.includes(plain[0])) return plain.slice(1);
  return null;
}
function stripVersion(spec) {
  if (spec.startsWith("@")) {
    const at = spec.indexOf("@", 1);
    return at === -1 ? spec : spec.slice(0, at);
  }
  return spec.split(/==|>=|<=|~=|!=|@|=|>|</)[0];
}
function gitSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-C" || a === "-c") {
      i++;
      continue;
    }
    if (!a.startsWith("-")) return a;
  }
  return void 0;
}
function commitMessage(args) {
  const i = args.findIndex((a) => a === "-m" || a === "--message");
  if (i >= 0) return args[i + 1];
  return args.find((a) => a.startsWith("--message="))?.slice("--message=".length);
}

// src/engine/effects.ts
var COMMIT_LINE = /^\[([^\s\]]+)(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.*)$/m;
var COMMIT_SUBCOMMANDS = /* @__PURE__ */ new Set(["commit", "cherry-pick", "revert", "merge"]);
function parseCommitSha(command, stdout) {
  if (!runsGitCommit(command)) return null;
  const m = COMMIT_LINE.exec(stdout);
  return m ? { branch: m[1], sha: m[2], subject: m[3] } : null;
}
function runsGitCommit(command) {
  return shellSegments(command).some((seg) => {
    const words2 = unwrapCommand(seg.words);
    if (basename3(words2[0] ?? "") !== "git") return false;
    if (words2.some((w) => w === "--dry-run" || w === "--abort" || w === "--quit")) return false;
    for (let i = 1; i < words2.length; i++) {
      const w = words2[i];
      if (w === "-C" || w === "-c") i++;
      else if (!w.startsWith("-")) return COMMIT_SUBCOMMANDS.has(w);
    }
    return false;
  });
}
function commitByTime(commitSec, calls) {
  const hits = calls.filter((c) => runsGitCommit(c.command) && Math.floor(c.preUs / 1e6) <= commitSec && commitSec <= Math.ceil(c.postUs / 1e6));
  return { match: hits.length === 1 ? hits[0] : null, candidates: hits.length };
}
var LOCKFILES = { npm: "package-lock.json", pnpm: "pnpm-lock.yaml", yarn: "yarn.lock", bun: "bun.lock" };
var INSTALL_VERBS2 = /* @__PURE__ */ new Set(["install", "i", "add"]);
var NETWORK_PROGRAMS = /* @__PURE__ */ new Set(["curl", "wget", "nc", "ncat", "scp", "rsync", "ssh", "ftp", "sftp", "http", "https"]);
function expectedShellEffects(command, cwd) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (kind, target) => {
    const key = `${kind}:${target}`;
    if (target && !seen.has(key)) {
      seen.add(key);
      out.push({ kind, target });
    }
  };
  const file = (p) => add("file", isAbsolute3(p) ? p : resolve3(cwd || "/", p));
  for (const seg of shellSegments(command)) {
    for (const r of seg.redirects) if (!r.startsWith("&") && r !== "/dev/null") file(r);
    const words2 = seg.words.filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
    const [first, ...args] = words2;
    if (!first) continue;
    const prog = basename3(first === "sudo" ? args.shift() ?? "" : first);
    const plain = args.filter((a) => !a.startsWith("-"));
    if (LOCKFILES[prog] && plain[0] && INSTALL_VERBS2.has(plain[0])) {
      file("package.json");
      file(LOCKFILES[prog]);
    } else if (prog === "tee" || prog === "touch") {
      plain.forEach(file);
    } else if ((prog === "mv" || prog === "cp") && plain.length >= 2) {
      file(plain[plain.length - 1]);
    } else if (prog === "sed" && args.some((a) => a === "-i" || a.startsWith("-i"))) {
      if (plain.length >= 2) file(plain[plain.length - 1]);
    }
    if (NETWORK_PROGRAMS.has(prog) || prog === "git" && ["clone", "fetch", "pull", "push"].includes(plain[0] ?? "")) {
      const url = args.find((a) => /^https?:\/\//.test(a));
      if (url) add("network", hostPath(url).split("/")[0]);
      else if (prog === "git") add("network", "git remote");
      else if (prog === "ssh" || prog === "scp" || prog === "rsync") {
        const host = plain.find((a) => a.includes("@") || a.includes(":"));
        if (host) add("network", host.replace(/:.*$/, "").replace(/^.*@/, ""));
      }
    }
  }
  return out;
}
function commitContains(commitSeq, files, writes, earlierCommits) {
  return files.map((file) => {
    const since = Math.max(0, ...earlierCommits.filter((c) => c.seq < commitSeq && c.files.includes(file)).map((c) => c.seq));
    const candidates = writes.filter((w) => w.path === file && w.seq > since && w.seq < commitSeq).sort((a, b) => b.seq - a.seq);
    const latest = candidates.find((w) => !w.expected) ?? candidates[0];
    if (!latest) return { file, actionId: null, grade: "UNKNOWN" };
    return { file, actionId: latest.actionId, grade: latest.expected ? "POSSIBLE" : "LIKELY" };
  });
}

// src/engine/scope.ts
var scopeKey = (s) => `${s.sessionId}/${s.agentId ?? "main"}`;
var sameScope = (a, b) => a.sessionId === b.sessionId && a.agentId === b.agentId;

// src/engine/hashed.ts
var HASHED = "\u27E6contrail:hashed\u27E7";
var READ_PREFIX2 = /^(\s{0,12}\d{1,9}(?:→|\t))/;
var RUN = /[^\s"'`<>()[\]{},;|]{1,256}/g;
var WORD = /[a-z0-9_-]/;
var MAX_BOUNDS = 32;
function spansOf(run) {
  const starts = [];
  const ends = [];
  for (let i = 0; i < run.length; i++) {
    const here = WORD.test(run[i]);
    const before = i > 0 && WORD.test(run[i - 1]);
    if (starts.length < MAX_BOUNDS && (i === 0 || here && !before || !here && run[i - 1] === "/")) starts.push(i);
    const after = i + 1 < run.length && WORD.test(run[i + 1]);
    if (ends.length < MAX_BOUNDS && (i + 1 === run.length || here && !after)) ends.push(i + 1);
  }
  const spans = [];
  for (const s of starts) {
    for (const e of ends) {
      if (e <= s) continue;
      const span = run.slice(s, e);
      if (/[a-z0-9]/.test(span)) spans.push(span);
    }
  }
  return spans;
}
function hashText(text, hmac) {
  const seenSpans = /* @__PURE__ */ new Set();
  const seenRuns = /* @__PURE__ */ new Set();
  const lines = text.split("\n").map((raw) => {
    const prefix = READ_PREFIX2.exec(raw)?.[1] ?? "";
    const words2 = [];
    for (const run of normalize(raw.slice(prefix.length)).match(RUN) ?? []) {
      if (seenRuns.has(run)) continue;
      seenRuns.add(run);
      for (const span of spansOf(run)) {
        if (seenSpans.has(span)) continue;
        seenSpans.add(span);
        words2.push(hmac(span));
      }
    }
    return prefix + words2.join(" ");
  });
  return `${HASHED} ${lines.join("\n")}`;
}
function hashNeedle(needle, hmac) {
  return needle && !/\s/.test(needle) ? hmac(needle) : null;
}

// src/engine/context.ts
function availableTo(probe, inputs, compactSeqs) {
  const boundary = Math.max(0, ...compactSeqs.filter((s) => s < probe.seq));
  return inputs.filter((i) => sameScope(i.scope, probe.scope) && i.availableAt < probe.seq && i.availableAt >= boundary);
}
function firstUse(token, action, scopeActions) {
  const needle = normalize(token.text);
  let first = action;
  for (const a of scopeActions) {
    if (a.preSeq >= first.preSeq || !sameScope(a.scope, action.scope)) continue;
    if (findNormalized(normalizedInput(a), needle) >= 0) first = a;
  }
  return first;
}
var inputCache = /* @__PURE__ */ new WeakMap();
var textCache = /* @__PURE__ */ new WeakMap();
function normalizedInput(a) {
  let n = inputCache.get(a);
  if (n === void 0) {
    n = stringLeaves(a.input).map((l) => normalize(l.value)).join("\n");
    inputCache.set(a, n);
  }
  return n;
}
function normalizedText(i) {
  let n = textCache.get(i);
  if (n === void 0) {
    n = normalize(i.text);
    textCache.set(i, n);
  }
  return n;
}
function findInInput(i, needle, hashToken) {
  if (i.hashed) {
    const hashedNeedle = hashToken ? hashNeedle(needle, hashToken) : null;
    if (hashedNeedle === null) return -1;
    needle = hashedNeedle;
  }
  let found = foundCache.get(i);
  if (!found) {
    found = /* @__PURE__ */ new Map();
    foundCache.set(i, found);
  }
  let index = found.get(needle);
  if (index === void 0) {
    index = search(i, needle);
    found.set(needle, index);
  }
  return index;
}
var foundCache = /* @__PURE__ */ new WeakMap();
function search(i, needle) {
  let bits = wordFilterCache.get(i);
  if (!bits) {
    const searches = (searchCount.get(i) ?? 0) + 1;
    if (searches <= SCANS_BEFORE_FILTER) {
      searchCount.set(i, searches);
      return findNormalized(normalizedText(i), needle);
    }
    bits = wordFilter(normalizedText(i));
    wordFilterCache.set(i, bits);
  }
  if (!mayHoldWords(bits, needleWords(needle))) return -1;
  return findNormalized(normalizedText(i), needle);
}
var SCANS_BEFORE_FILTER = 8;
var searchCount = /* @__PURE__ */ new WeakMap();
var wordFilterCache = /* @__PURE__ */ new WeakMap();
var needleWordCache = /* @__PURE__ */ new Map();
var MAX_NEEDLES_CACHED = 1e4;
var FNV_OFFSET = 2166136261;
var FNV_PRIME = 16777619;
function rehash(h) {
  h = Math.imul(h ^ h >>> 16, 2246822507);
  return h ^ h >>> 13;
}
function wordHashes(text) {
  const out = [];
  let h = FNV_OFFSET;
  let inWord = false;
  for (let k = 0; k < text.length; k++) {
    const c = text.charCodeAt(k);
    if (isWordCode(c)) {
      h = Math.imul(h ^ c, FNV_PRIME);
      inWord = true;
    } else if (inWord) {
      out.push(h);
      h = FNV_OFFSET;
      inWord = false;
    }
  }
  if (inWord) out.push(h);
  return out;
}
function wordFilter(text) {
  let size = 1024;
  while (size < text.length && size < 1 << 26) size *= 2;
  const bits = new Uint32Array(size / 32);
  const mask = size - 1;
  let h = FNV_OFFSET;
  let inWord = false;
  for (let k = 0; k <= text.length; k++) {
    const c = k < text.length ? text.charCodeAt(k) : -1;
    if (isWordCode(c)) {
      h = Math.imul(h ^ c, FNV_PRIME);
      inWord = true;
    } else if (inWord) {
      const a = h & mask;
      const b = rehash(h) & mask;
      bits[a >>> 5] |= 1 << (a & 31);
      bits[b >>> 5] |= 1 << (b & 31);
      h = FNV_OFFSET;
      inWord = false;
    }
  }
  return bits;
}
function needleWords(needle) {
  let hashes = needleWordCache.get(needle);
  if (!hashes) {
    if (needleWordCache.size >= MAX_NEEDLES_CACHED) needleWordCache.clear();
    hashes = wordHashes(needle);
    needleWordCache.set(needle, hashes);
  }
  return hashes;
}
function mayHoldWords(bits, hashes) {
  const mask = bits.length * 32 - 1;
  for (const h of hashes) {
    const a = h & mask;
    const b = rehash(h) & mask;
    if (!(bits[a >>> 5] & 1 << (a & 31)) || !(bits[b >>> 5] & 1 << (b & 31))) return false;
  }
  return true;
}

// src/engine/grade.ts
var ORDER = ["DIRECT", "LIKELY", "POSSIBLE", "UNKNOWN"];
function minGrade(grades) {
  if (grades.length === 0) return "UNKNOWN";
  return grades.reduce((weakest, g) => ORDER.indexOf(g) > ORDER.indexOf(weakest) ? g : weakest);
}
function maxGrade(grades) {
  return grades.reduce((best, g) => ORDER.indexOf(g) < ORDER.indexOf(best) ? g : best, "UNKNOWN");
}
function gradeSources(token, candidates, actionId, indexIn) {
  const base = { type: "value_from", from: actionId, recorded: false, token: token.text };
  if (candidates.length === 0) {
    return [{ ...base, to: null, grade: "UNKNOWN", rule: "R4", note: "no observed input contains it" }];
  }
  const bySource = /* @__PURE__ */ new Map();
  for (const c of [...candidates].sort((a, b) => a.availableAt - b.availableAt)) {
    if (!bySource.has(c.ref)) bySource.set(c.ref, c);
  }
  const sources = [...bySource.values()];
  const link = (input, grade, extra = {}) => ({
    ...base,
    to: input.id,
    grade,
    rule: "R3",
    quote: quote(input, indexIn ? indexIn(input) : findMention(input.text, token.text)),
    ...extra
  });
  const yours = sources.find((s) => s.trust === "principal");
  if (yours) {
    return sources.map(
      (s) => s === yours ? link(s, token.shaped ? "LIKELY" : "POSSIBLE", { note: "you supplied it" }) : link(s, "POSSIBLE", { note: "also in" })
    );
  }
  if (sources.length === 1) {
    const only = sources[0];
    return [token.shaped ? link(only, "LIKELY") : link(only, "POSSIBLE", { note: "plain word; the model may know it" })];
  }
  if (sources.length <= 3) {
    return sources.map((s, i) => link(s, "POSSIBLE", i === 0 ? { firstSeen: true } : {}));
  }
  return [{ ...base, to: null, grade: "UNKNOWN", rule: "R3", note: `in ${sources.length} observed inputs; too common to attribute` }];
}
function quote(input, index) {
  const { line, text } = lineOf(input.text, index, normalizedText(input));
  return { ref: input.ref, line, text: input.hashed ? "" : text };
}

// src/engine/requested.ts
var NEGATOR = /(?<![\w./-])(?:not|never|no|without|avoid|stop|skip|instead of|rather than)(?![\w-])|n't(?![\w-])/i;
var CLAUSE_BREAK = /[,;:()]|\s(?:but|then|just|so|and then)\s/gi;
function negates(text, index) {
  const before = text.slice(0, index);
  let start = 0;
  for (const m of before.matchAll(CLAUSE_BREAK)) start = m.index + m[0].length;
  return NEGATOR.test(before.slice(start));
}
function splitSentences(text) {
  return text.replace(/```[\s\S]*?(?:```|$)/g, "\n").split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}
function requested(action, tokens, sentences) {
  const before = sentences.filter((s) => s.seq < action.preSeq);
  const searched = before.length;
  const groups = /* @__PURE__ */ new Map();
  for (const t of tokens) {
    if (t.role === "target" && t.group !== null) groups.set(t.group, [...groups.get(t.group) ?? [], t]);
  }
  if (groups.size === 0) return { verdict: "NOTHING_TO_MATCH", grade: "UNKNOWN", searched };
  const kept = [];
  for (const alternatives of groups.values()) {
    let latest2 = null;
    for (const s of before) {
      const hit = alternatives.find((t) => !t.derived && findMention(s.text, t.text) >= 0) ?? alternatives.find((t) => findMention(s.text, t.text) >= 0);
      if (hit) latest2 = { sentence: s, token: hit, strong: !hit.derived, negated: negates(s.text, findMention(s.text, hit.text)) };
    }
    if (latest2) kept.push(latest2);
  }
  if (kept.length === 0) return { verdict: "NOT_NAMED", grade: "UNKNOWN", searched };
  const negated = kept.find((k) => k.negated);
  if (negated) {
    return { verdict: "NAMED_NEGATED", grade: "POSSIBLE", searched, sentence: negated.sentence, matched: negated.token.text };
  }
  const latest = kept.reduce((a, b) => b.sentence.seq > a.sentence.seq ? b : a);
  const verdict = kept.length === groups.size && kept.every((k) => k.strong) ? "NAMED" : "PARTLY_NAMED";
  return {
    verdict,
    grade: verdict === "NAMED" ? "LIKELY" : "POSSIBLE",
    searched,
    sentence: latest.sentence,
    matched: latest.token.text
  };
}

// src/engine/trace.ts
var MAX_DEPTH = 3;
var UPSTREAM_TOKENS = 8;
function traceToken(token, action, g, depth = 0, visited = /* @__PURE__ */ new Set([action.id])) {
  const first = firstUse(token, action, g.actions.filter((a) => sameScope(a.scope, action.scope)));
  const firstUseInfo = first === action ? null : { actionId: first.id, preSeq: first.preSeq };
  return traceAt(token, { scope: action.scope, seq: first.preSeq }, action.id, firstUseInfo, g, depth, visited);
}
function traceAt(token, probe, fromId, firstUseInfo, g, depth, visited) {
  const available = availableTo(probe, g.inputs, g.compactSeqs[scopeKey(probe.scope)] ?? []);
  const needle = normalize(token.text);
  const at = /* @__PURE__ */ new Map();
  for (const i of available) {
    const index = findInInput(i, needle, g.hashToken);
    if (index >= 0) at.set(i, index);
  }
  const links = gradeSources(token, [...at.keys()], fromId, (i) => at.get(i) ?? -1);
  const trace3 = {
    token,
    firstUse: firstUseInfo,
    searched: { count: available.length, beforeSeq: probe.seq },
    links,
    upstream: null
  };
  const best = links.find((l) => l.grade === "LIKELY") ?? links.find((l) => l.firstSeen);
  const source = best?.to ? g.inputs.find((i) => i.id === best.to) : void 0;
  if (!source) return trace3;
  if (depth >= MAX_DEPTH) {
    const next = nextStep(token, source, g, visited);
    if (next !== void 0) trace3.truncated = { next };
    return trace3;
  }
  trace3.upstream = followSource(token, source, g, depth + 1, visited);
  return trace3;
}
function nextStep(token, source, g, visited) {
  if (source.origin === "compaction") return visited.has(source.id) ? void 0 : null;
  if (source.relays) return source.producedBy && !visited.has(`relay:${source.id}`) ? null : void 0;
  const writer = source.origin === "file" ? agentWriter(token, source, g) : void 0;
  if (writer && !visited.has(writer.id)) return writer.id;
  return source.producedBy && !visited.has(source.producedBy) && g.actions.some((a) => a.id === source.producedBy) ? source.producedBy : void 0;
}
function followSource(token, source, g, depth, visited) {
  if (source.origin === "compaction") {
    if (visited.has(source.id)) return null;
    visited.add(source.id);
    const before = traceAt(token, { scope: source.scope, seq: source.availableAt }, source.id, null, g, depth, visited);
    return { kind: "compaction", via: null, trace: before };
  }
  if (source.relays) {
    const via = source.producedBy ? g.actions.find((a) => a.id === source.producedBy) : void 0;
    const key = `relay:${source.id}`;
    if (!via || visited.has(key)) return null;
    visited.add(key);
    return { kind: "conduit", via, trace: traceAt(token, { scope: source.relays, seq: source.availableAt }, source.id, null, g, depth, visited) };
  }
  const writer = source.origin === "file" ? agentWriter(token, source, g) : void 0;
  if (writer && !visited.has(writer.id)) {
    visited.add(writer.id);
    return { kind: "conduit", via: writer, trace: traceToken(token, writer, g, depth, visited) };
  }
  const producer = source.producedBy ? g.actions.find((a) => a.id === source.producedBy) : void 0;
  if (!producer || visited.has(producer.id)) return null;
  visited.add(producer.id);
  if (source.trust === "agent") return { kind: "conduit", via: producer, trace: traceToken(token, producer, g, depth, visited) };
  const next = headline(producer, g, depth, visited);
  return next ? { kind: "call", via: producer, trace: next } : null;
}
function agentWriter(token, source, g) {
  const read = g.actions.find((a) => a.id === source.producedBy);
  const path = read ? read.input.file_path : void 0;
  if (!path) return void 0;
  const writes = g.effects.filter((e) => e.kind === "file" && e.path === path && e.evidence !== "expected").map((e) => g.actions.find((a) => a.id === e.actionId)).filter((a) => !!a && a.preSeq < source.availableAt).filter((a) => stringLeaves(a.input).some((l) => findMention(l.value, token.text) >= 0));
  return writes.sort((a, b) => b.preSeq - a.preSeq)[0];
}
function headline(action, g, depth, visited) {
  const tokens = extractTokens(action, g.env).sort((a, b) => Number(a.role === "hint") - Number(b.role === "hint")).slice(0, UPSTREAM_TOKENS);
  const traces = tokens.map((t) => traceToken(t, action, g, depth, new Set(visited)));
  const found = (t) => t.links.some((l) => l.grade !== "UNKNOWN");
  return traces.find((t) => t.token.role === "target" && found(t)) ?? traces.find(found) ?? traces[0] ?? null;
}

// src/engine/explain.ts
var BASE_BLIND_SPOTS = [
  "model knowledge and reasoning",
  "system prompt",
  "AGENTS.md",
  "context injected by other hooks"
];
function explain(actionId, g) {
  const action = g.actions.find((a) => a.id === actionId);
  if (!action) throw new Error(`No recorded action ${actionId}`);
  const prompt = g.prompts.find((p) => p.promptId === action.promptId);
  const turn = prompt ? { type: "in_turn", from: action.id, to: `prompt:${prompt.promptId}`, grade: "DIRECT", rule: "R1", recorded: true } : null;
  const tokens = extractTokens(action, g.env);
  const sentences = g.prompts.filter((p) => p.from === "you").flatMap((p) => splitSentences(p.text).map((text) => ({ promptId: p.promptId, seq: p.seq, text })));
  const traces = tokens.map((t) => traceToken(t, action, g, 0, /* @__PURE__ */ new Set([action.id])));
  const effects = g.effects.filter((e) => e.actionId === action.id).map(
    (e) => e.evidence === "expected" ? { type: "changed", from: action.id, to: e.id, grade: "POSSIBLE", rule: "R6", recorded: false } : { type: "changed", from: action.id, to: e.id, grade: "DIRECT", rule: "R1", recorded: true }
  );
  return {
    action,
    turn,
    requested: requested(action, tokens, sentences),
    traces,
    effects,
    chainGrade: chainGrade(traces),
    blindSpots: blindSpots(action, g)
  };
}
function chainGrade(traces) {
  const found = (t) => t.links.some((l) => l.grade !== "UNKNOWN");
  const head = traces.find((t) => t.token.role === "target" && found(t)) ?? traces.find(found);
  if (!head) return "UNKNOWN";
  const grades = [];
  for (let t = head; t && found(t); t = t.upstream?.trace) {
    grades.push(maxGrade(t.links.map((l) => l.grade)));
  }
  return minGrade(grades);
}
function blindSpots(action, g) {
  const spots = [...BASE_BLIND_SPOTS];
  const mentions = g.prompts.filter((p) => p.from === "you" && p.seq < action.preSeq).flatMap((p) => [...p.text.matchAll(/(?:^|\s)@([\w.~/-]+)/g)].map((m) => m[1]));
  if (mentions.length) spots.push(`@-mentioned: ${[...new Set(mentions)].join(", ")} (contents not observable)`);
  if (g.inputs.some((i) => i.truncated && sameScope(i.scope, action.scope) && i.availableAt < action.preSeq)) {
    spots.push("some inputs were truncated when stored");
  }
  const skills = g.actions.filter((a) => a.tool === "Skill" && a.preSeq < action.preSeq && sameScope(a.scope, action.scope) && !g.inputs.some((i) => i.id === `skillbody:${a.id}`)).map((a) => str(a.input, "skill") ?? "unnamed");
  if (skills.length) spots.push(`the body of skill ${[...new Set(skills)].join(", ")} (not recorded; plugin skills are never read)`);
  const unseen = g.prompts.filter((p) => p.command && !p.command.bodyObserved && p.seq < action.preSeq).map((p) => p.command.text.split(" ")[0]);
  if (unseen.length) spots.push(`the text ${[...new Set(unseen)].join(", ")} expanded to (Claude Code records the command, not its body)`);
  const compactions = (g.compactSeqs[scopeKey(action.scope)] ?? []).filter((s) => s < action.preSeq);
  if (compactions.length) {
    spots.push(`context compacted at seq ${compactions.join(", ")}; earlier inputs are only visible through the summary`);
  }
  const knownStarts = ["SessionStart", "UserPromptSubmit", "UserPromptExpansion", "InstructionsLoaded"];
  if (g.firstEvent && !knownStarts.includes(g.firstEvent)) spots.push("the start of this session was not recorded");
  return spots;
}
function bestPerGroup(traces) {
  const found = (t) => t.links.some((l) => l.grade !== "UNKNOWN");
  const byGroup = /* @__PURE__ */ new Map();
  const out = [];
  for (const t of traces) {
    if (t.token.group === null) {
      out.push(t);
      continue;
    }
    const current = byGroup.get(t.token.group);
    if (!current) {
      byGroup.set(t.token.group, t);
      out.push(t);
    } else if (!found(current) && found(t)) {
      byGroup.set(t.token.group, t);
      out[out.indexOf(current)] = t;
    }
  }
  return out;
}

// src/engine/risks.ts
var CREDENTIAL_PATH = /(\.aws\/(credentials|config)|\.ssh\/|\bid_(rsa|ed25519|ecdsa)\b|\.netrc|\.npmrc|\.pypirc|\.docker\/config\.json|\.kube\/config|\.gnupg\/|(^|[\s/"'])\.env(\.[\w-]+)?(?=$|[\s"'])|keychain|credentials\.json|secrets?\.(json|ya?ml|env|toml)|\.git-credentials|\.config\/gh\/hosts\.ya?ml|\.pgpass|\.my\.cnf|\.config\/gcloud\/|\.azure\/|\.vault-token|\.terraform\.d\/credentials|\.boto\b)/i;
var DUMPS_ENV = /(^|[\s;&|(])(printenv|env)\s{0,8}($|[|;&>)])/;
var RUNS_REMOTE_CODE = /\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b|\b(ba|z)?sh\s+<\(\s*(curl|wget)\b|\beval\s+"?\$\((curl|wget)\b/;
var NETWORK = /(^|[\s;&|(])(curl|wget|nc|ncat|scp|rsync|ssh|sftp|ftp)\s|\bgit\s+push\b|\bgh\s+api\b/;
var INSTALL = /(^|[\s;&|(])((npm|pnpm|bun)\s+(install|i|add)\s+[^-\s]|yarn\s+add\s|pip3?\s+install\s|uv\s+(add|pip\s+install)\s|cargo\s+add\s|gem\s+install\s|brew\s+install\s|go\s+get\s|npx\s+[^-\s])/;
var DESTRUCTIVE = /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR])|\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|push\s+(.*\s)?(-f|--force)\b)|\bchmod\s+(-R\s+)?777\b|\b(drop|truncate)\s+(table|database)\b|\bmkfs\b|\bdd\s+if=/i;
var CONTRAIL_DATA = /plugins\/data\/contrail[\w-]{0,64}|\bcontrail\.db\b|\bCONTRAIL_HOME\b/;
var CONTRAIL_OWN_USE = /\S{0,512}plugins\/data\/contrail[\w-]{0,64}\/bin\/contrail\b|--(plugin-)?data[= ]\s{0,4}("[^"]{0,1024}"|'[^']{0,1024}'|\S{1,1024})/g;
function sensitivity(action) {
  const kinds = /* @__PURE__ */ new Set();
  if (action.tool === "Bash") {
    const cmd = str(action.input, "command") ?? "";
    if (CREDENTIAL_PATH.test(cmd) || DUMPS_ENV.test(cmd)) kinds.add("credentials");
    if (RUNS_REMOTE_CODE.test(cmd)) kinds.add("runs remote code");
    if (NETWORK.test(cmd)) kinds.add("network");
    if (INSTALL.test(cmd)) kinds.add("install");
    if (DESTRUCTIVE.test(cmd)) kinds.add("destructive");
    if (CONTRAIL_DATA.test(cmd.replace(CONTRAIL_OWN_USE, " "))) kinds.add("touches Contrail's records");
  } else if (["Read", "Edit", "MultiEdit", "Write"].includes(action.tool)) {
    const path = str(action.input, "file_path") ?? "";
    if (CREDENTIAL_PATH.test(path)) kinds.add("credentials");
    if (action.tool !== "Read" && CONTRAIL_DATA.test(path)) kinds.add("touches Contrail's records");
  }
  return [...kinds];
}
function creditedSources(e, g) {
  const inputs = new Map(g.inputs.map((i) => [i.id, i]));
  const sources = [];
  let level = bestPerGroup(e.traces);
  while (level.length) {
    for (const t of level) {
      for (const link of t.links) {
        const input = link.to ? inputs.get(link.to) : void 0;
        if (!input || link.grade === "UNKNOWN") continue;
        const sameLine = (s) => s.input.id === input.id && s.link.quote?.line === link.quote?.line;
        const seen = sources.some((s) => s.input.id === input.id && s.link.token === link.token || t.token.role === "hint" && sameLine(s));
        if (!seen) sources.push({ link, input });
      }
    }
    level = level.flatMap((t) => t.upstream ? [t.upstream.trace] : []);
  }
  return sources;
}
function assess(e, g) {
  const kinds = sensitivity(e.action);
  if (!kinds.length) return null;
  const sources = creditedSources(e, g);
  return {
    action: e.action,
    kinds,
    requested: e.requested.verdict,
    sources,
    externalUpstream: sources.some((s) => s.input.trust === "external")
  };
}
function findingsFor(g, explainOne = (id) => explain(id, g)) {
  return g.actions.filter((a) => sensitivity(a).length).map((a) => assess(explainOne(a.id), g)).filter((f) => f !== null);
}
function rankFindings(findings) {
  const weight = (f) => f.externalUpstream ? 0 : f.requested === "NAMED" ? 2 : 1;
  return [...findings].sort((a, b) => weight(a) - weight(b) || b.action.preSeq - a.action.preSeq);
}

// src/engine/find.ts
function findValue(g, value) {
  const needle = normalize(value.trim());
  if (!needle) return [];
  const own = new Set(g.actions.filter(runsContrail).map((a) => a.id));
  const out = [];
  for (const input of g.inputs) {
    if (input.producedBy && own.has(input.producedBy) || input.origin === "prompt" && /^\s*\/contrail:/.test(input.text)) continue;
    const index = findInInput(input, needle, g.hashToken);
    if (index < 0) continue;
    const { line, text } = lineOf(input.text, index, normalizedText(input));
    out.push({ seq: input.availableAt, source: { input, line, text: input.hashed ? "" : text } });
  }
  for (const action of g.actions) {
    if (own.has(action.id)) continue;
    const leaf = stringLeaves(action.input).find((l) => findNormalized(normalize(l.value), needle) >= 0);
    if (leaf) out.push({ seq: action.preSeq, use: { action, argPath: leaf.path, kinds: sensitivity(action) } });
  }
  return out.sort((a, b) => a.seq - b.seq || Number(Boolean(a.use)) - Number(Boolean(b.use)));
}
function runsContrail(a) {
  const command = a.tool === "Bash" ? stringLeaves(a.input).find((l) => l.path === "$.command")?.value ?? "" : "";
  return /(^|[\s;&|(/])(bin\/contrail|contrail)\s+(why|blame|find|trace|risks|sessions|report|review|export|doctor|statusline)\b/.test(command);
}

// src/engine/tree.ts
function headlineTrace(e) {
  const found = (t) => t.links.some((l) => l.grade !== "UNKNOWN");
  return e.traces.find((t) => t.token.role === "target" && found(t)) ?? e.traces.find(found);
}
function trailForest(g, explanations) {
  const inputs = new Map(g.inputs.map((i) => [i.id, i]));
  const nodes = /* @__PURE__ */ new Map();
  const roots = /* @__PURE__ */ new Map();
  const rootFor = (key, make) => roots.get(key) ?? roots.set(key, make()).get(key);
  for (const action of [...g.actions].sort((a, b) => a.preSeq - b.preSeq)) {
    const e = explanations.get(action.id);
    if (!e) continue;
    const head = headlineTrace(e);
    const link = head?.links.find((l) => l.grade !== "UNKNOWN") ?? null;
    const source = link?.to ? inputs.get(link.to) : void 0;
    const node = { action, token: head?.token.text ?? null, link, source: source ?? null, children: [] };
    nodes.set(action.id, node);
    const parent = source?.producedBy && source.producedBy !== action.id ? nodes.get(source.producedBy) : void 0;
    if (parent) parent.children.push(node);
    else if (source) rootFor(source.id, () => ({ kind: "source", source, children: [] })).children.push(node);
    else if (e.traces.length) rootFor("unknown", () => ({ kind: "unknown", source: null, children: [] })).children.push(node);
    else rootFor("nothing", () => ({ kind: "nothing", source: null, children: [] })).children.push(node);
  }
  const order = (r) => r.kind === "source" ? r.source?.availableAt ?? 0 : r.kind === "unknown" ? 1e12 : 1e12 + 1;
  return [...roots.values()].sort((a, b) => order(a) - order(b));
}

// src/errors.ts
var ContrailError = class extends Error {
  name = "ContrailError";
};

// src/graph/build.ts
var DEPENDENCY_DIR = /(^|\/)(node_modules|vendor|\.venv|venv|site-packages)(\/|$)/;
var WRITE_TOOLS = /* @__PURE__ */ new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
var NO_OUTPUT_TOOLS = /* @__PURE__ */ new Set([...WRITE_TOOLS, "TodoWrite", "ExitPlanMode"]);
function buildGraph(rows, who, hashToken) {
  const cwd = rows.find((r) => r.cwd)?.cwd ?? "";
  const env = { cwd, home: who.home, user: who.user };
  const mainScope = { sessionId: rows[0]?.session_id ?? "", agentId: null };
  const actions = /* @__PURE__ */ new Map();
  const inputs = [];
  const prompts = [];
  const compactSeqs = {};
  const agentSaid = { byPrompt: {}, byAgent: {} };
  const modelSaw = /* @__PURE__ */ new Map();
  const expansions = /* @__PURE__ */ new Map();
  const subagentStarts = /* @__PURE__ */ new Map();
  const instructions = [];
  const skillBodies = /* @__PURE__ */ new Map();
  const notifications = [];
  rows.forEach((row, index) => {
    if (row.hook_event !== "PostToolBatch") return;
    for (const call of arr(parsePayload(row.payload).tool_calls)) {
      const useId = str(call, "tool_use_id");
      if (useId) modelSaw.set(useId, { seq: index + 1, text: toText(field(call, "tool_response")) });
    }
  });
  rows.forEach((row, index) => {
    const seq = index + 1;
    const id = row.tool_use_id;
    const known = id ? actions.get(id) : void 0;
    const large = row.hook_event === "PostToolUse" && (row.payloadLater || row.payload.length > DEFER_OVER);
    if (large && known && onlyTextUsed(known.tool) && modelSaw.get(known.id)?.text) {
      known.postSeq = seq;
      known.status = "ok";
      deferResponse(known, row);
      return;
    }
    if (row.hook_event === "PostToolBatch") return;
    const p = parsePayload(row.payload);
    const scope = { sessionId: row.session_id ?? "", agentId: row.agent_id };
    switch (row.hook_event) {
      case "UserPromptSubmit": {
        const promptId = row.prompt_id ?? `seq-${seq}`;
        const text = str(p, "prompt") ?? "";
        const task = taskNotification(text);
        if (task) {
          prompts.push({ promptId, seq, label: `p${prompts.length + 1}`, text: task.summary, from: "task" });
          notifications.push({ seq, promptId, text, toolUseId: task.toolUseId, taskId: task.taskId });
        } else {
          prompts.push({ promptId, seq, label: `p${prompts.length + 1}`, text, from: "you" });
        }
        break;
      }
      case "UserPromptExpansion":
        if (row.prompt_id) {
          const command = `/${str(p, "command_name") ?? ""} ${str(p, "command_args") ?? ""}`.trim();
          expansions.set(row.prompt_id, { command, source: str(p, "command_source") ?? "" });
        }
        break;
      case "InstructionsLoaded":
        instructions.push({ seq, scope, p, promptId: row.prompt_id });
        break;
      case "PreToolUse":
        if (id && !actions.has(id)) actions.set(id, newAction(id, scope, row, p, seq));
        break;
      case "PostToolUse":
      case "PostToolUseFailure": {
        if (!id) break;
        const a = actions.get(id) ?? newAction(id, scope, row, p, seq);
        actions.set(id, a);
        a.postSeq = seq;
        if (row.hook_event === "PostToolUse") {
          a.status = "ok";
          a.response = p.tool_response ?? null;
          const body = obj(p, "_contrail");
          const text = str(body, "text");
          if (a.tool === "Skill" && text) skillBodies.set(id, { text, path: str(body, "path") ?? "" });
        } else {
          a.status = p.is_interrupt === true ? "interrupted" : "failed";
          a.response = { error: str(p, "error") ?? "" };
        }
        break;
      }
      case "PostCompact":
        (compactSeqs[scopeKey(scope)] ??= []).push(seq);
        inputs.push({
          id: `compact:${seq}`,
          scope,
          origin: "compaction",
          trust: "agent",
          ref: `compact:${seq}`,
          label: "compaction summary",
          text: str(p, "compact_summary") ?? "",
          truncated: false,
          fidelity: "as-seen",
          availableAt: seq,
          producedBy: null,
          promptId: row.prompt_id
        });
        break;
      case "SubagentStart": {
        const agentId = str(p, "agent_id");
        if (agentId) subagentStarts.set(agentId, seq);
        break;
      }
      case "SubagentStop": {
        const agentId = str(p, "agent_id");
        if (agentId) agentSaid.byAgent[agentId] = str(p, "last_assistant_message") ?? "";
        break;
      }
      case "Stop":
        if (row.prompt_id) agentSaid.byPrompt[row.prompt_id] = str(p, "last_assistant_message") ?? "";
        break;
    }
  });
  for (const prompt of prompts) {
    if (prompt.from === "task") continue;
    const expansion = expansions.get(prompt.promptId);
    const expanded = expansion && prompt.text.trim() !== expansion.command.trim();
    if (expansion) prompt.command = { text: expansion.command, bodyObserved: Boolean(expanded) };
    if (expansion && expanded) {
      inputs.push({
        id: `template:${prompt.promptId}`,
        scope: mainScope,
        origin: "template",
        trust: templateTrust(expansion.source),
        ref: `template:${prompt.promptId}`,
        label: `${expansion.command.split(" ")[0]} template`,
        text: prompt.text,
        truncated: false,
        fidelity: "as-seen",
        availableAt: prompt.seq,
        producedBy: null,
        promptId: prompt.promptId
      });
      prompt.text = expansion.command;
    }
    inputs.push({
      id: `prompt:${prompt.promptId}`,
      scope: mainScope,
      origin: "prompt",
      trust: "principal",
      ref: `prompt:${prompt.promptId}`,
      label: `your prompt ${prompt.label}`,
      text: prompt.text,
      truncated: false,
      fidelity: "as-seen",
      availableAt: prompt.seq,
      producedBy: null,
      promptId: prompt.promptId
    });
  }
  const actionList = [...actions.values()].sort((a, b) => a.preSeq - b.preSeq);
  const effects = [];
  for (const a of actionList) {
    const output = outputInput(a, modelSaw.get(a.id), env);
    if (output) inputs.push(output);
    effects.push(...effectsOf(a, env));
    const body = skillBodies.get(a.id);
    if (body) {
      const name = str(a.input, "skill") ?? "";
      const yours = Boolean(env.home) && body.path.startsWith(`${env.home}/.claude/`);
      inputs.push({
        // ref is the file, so a Read of the same SKILL.md is the same source, not a second one.
        id: `skillbody:${a.id}`,
        scope: a.scope,
        origin: "skill",
        trust: yours ? "config" : "local",
        ref: displayPath(body.path, env.cwd, env.home),
        label: `skill ${name} (${displayPath(body.path, env.cwd, env.home)})`,
        text: body.text,
        truncated: body.text.includes("[contrail: truncated"),
        fidelity: "read-at-ingest",
        availableAt: modelSaw.get(a.id)?.seq ?? a.postSeq ?? a.preSeq,
        producedBy: a.id,
        promptId: a.promptId
      });
    }
    const agentId = (a.tool === "Agent" || a.tool === "Task") && a.status === "ok" ? str(a.response, "agentId") : void 0;
    if (agentId && output) output.relays = { sessionId: a.scope.sessionId, agentId };
    if (agentId) {
      inputs.push({
        id: `subprompt:${agentId}`,
        scope: { sessionId: a.scope.sessionId, agentId },
        origin: "subagent_prompt",
        trust: "agent",
        ref: `subprompt:${agentId}`,
        label: `subagent instructions written in ${callId(a.id)}`,
        text: str(a.input, "prompt") ?? "",
        truncated: false,
        fidelity: "reported",
        availableAt: subagentStarts.get(agentId) ?? a.preSeq,
        producedBy: a.id,
        promptId: a.promptId
      });
    }
  }
  for (const n of notifications) inputs.push(notificationInput(n, actionList, mainScope, env));
  for (const ins of instructions) {
    const path = str(ins.p, "file_path") ?? "";
    const extra = obj(ins.p, "_contrail");
    const trigger = str(ins.p, "trigger_file_path");
    const read = trigger ? actionList.find((a) => a.tool === "Read" && str(a.input, "file_path") === trigger && a.preSeq < ins.seq && sameScope(a.scope, ins.scope)) : void 0;
    const readAt = read ? modelSaw.get(read.id)?.seq ?? read.postSeq : null;
    const shown = displayPath(path, cwd, who.home);
    inputs.push({
      id: `instr:${ins.seq}`,
      scope: ins.scope,
      origin: "instructions",
      trust: str(ins.p, "memory_type") === "Project" ? "local" : "config",
      ref: shown,
      label: extra?.changedSinceLoad === true ? `${shown} (changed after it loaded; its text is not used)` : shown,
      text: str(extra, "text") ?? "",
      truncated: (str(extra, "text") ?? "").includes("[contrail: truncated"),
      fidelity: "read-at-ingest",
      availableAt: readAt ?? ins.seq,
      producedBy: null,
      promptId: ins.promptId
    });
  }
  for (const i of inputs) if (i.text.includes(HASHED)) i.hashed = true;
  inputs.sort((a, b) => a.availableAt - b.availableAt || a.id.localeCompare(b.id));
  return {
    sessionId: mainScope.sessionId,
    actions: actionList,
    inputs,
    effects,
    prompts,
    compactSeqs,
    agentSaid,
    env,
    firstEvent: rows[0]?.hook_event ?? null,
    timeUs: rows.map((r) => r.captured_us),
    ...hashToken ? { hashToken } : {}
  };
}
var TEXT_RESULT_TOOLS = ["Read", "NotebookRead", "Grep", "Glob", "LS", "WebFetch", "WebSearch"];
var onlyTextUsed = (tool) => TEXT_RESULT_TOOLS.includes(tool) || tool.startsWith("mcp__");
var DEFER_OVER = 16 * 1024;
function deferResponse(a, row) {
  const settle = (value) => {
    Object.defineProperty(a, "response", { value, writable: true, enumerable: true, configurable: true });
    return value;
  };
  Object.defineProperty(a, "response", {
    enumerable: true,
    configurable: true,
    get: () => settle(parsePayload(row.payload).tool_response ?? null),
    set: settle
  });
}
function parsePayload(payload) {
  try {
    const v = JSON.parse(payload);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function newAction(id, scope, row, p, seq) {
  const mcp = obj(p, "mcp_server");
  return {
    id,
    scope,
    promptId: row.prompt_id,
    // Tool names are identifiers; anything else in one is not printed as-is.
    tool: (row.tool_name ?? str(p, "tool_name") ?? "unknown").replace(/[^\w.:-]/g, "?").slice(0, 128),
    input: obj(p, "tool_input") ?? {},
    response: null,
    preSeq: seq,
    postSeq: null,
    status: "pending",
    mcpServer: mcp ? { name: str(mcp, "name") ?? "", source: str(mcp, "source") ?? "" } : null
  };
}
var TASK_NOTIFICATION = /^\s*<task-notification>/;
var tag = (text, name) => new RegExp(`<${name}>([^<]{1,200})</${name}>`).exec(text)?.[1]?.trim() ?? null;
function taskNotification(text) {
  if (!TASK_NOTIFICATION.test(text)) return null;
  const head = text.slice(0, 4e3);
  return {
    summary: tag(head, "summary") ?? "a background task finished",
    toolUseId: tag(head, "tool-use-id"),
    taskId: tag(head, "task-id")
  };
}
function notificationInput(n, actionList, mainScope, env) {
  const started = actionList.find((a) => a.id === n.toolUseId);
  const base = { id: `task:${n.seq}`, scope: mainScope, text: n.text, truncated: n.text.includes("[contrail: truncated"), fidelity: "as-seen", availableAt: n.seq, producedBy: started?.id ?? null, promptId: n.promptId };
  if (started && (started.tool === "Agent" || started.tool === "Task")) {
    const agentId = str(started.response, "agentId") ?? n.taskId;
    return {
      ...base,
      origin: "subagent_result",
      trust: "agent",
      ref: `agent:${started.id}`,
      label: `background subagent report from ${callId(started.id)}`,
      relays: agentId ? { sessionId: started.scope.sessionId, agentId } : null
    };
  }
  if (started) {
    const c = classify(started, env);
    return { ...base, ...c, label: `background ${c.label.replace(/^the /, "")}` };
  }
  return { ...base, origin: "tool_output", trust: "local", ref: `task:${n.taskId ?? n.seq}`, label: "a background task report" };
}
function templateTrust(source) {
  if (source === "user") return "config";
  if (source === "project") return "local";
  return "external";
}
function outputInput(a, saw, env) {
  if (NO_OUTPUT_TOOLS.has(a.tool) || a.postSeq === null) return null;
  const text = saw?.text || toText(a.response);
  return {
    id: `out:${a.id}`,
    scope: a.scope,
    ...classify(a, env),
    text,
    truncated: text.includes("[contrail: truncated"),
    fidelity: saw?.text ? "as-seen" : "reported",
    availableAt: saw?.seq ?? a.postSeq,
    producedBy: a.id,
    promptId: a.promptId
  };
}
function classify(a, env) {
  const tool = a.tool;
  if (tool === "Read" || tool === "NotebookRead") {
    const path = str(a.input, "file_path") ?? str(a.input, "notebook_path") ?? "";
    const ref = displayPath(path, env.cwd, env.home);
    if (DEPENDENCY_DIR.test(path)) {
      return { origin: "dependency_file", trust: "external", ref, label: ref };
    }
    if (env.home && path.startsWith(`${env.home}/.claude/`)) return { origin: "file", trust: "config", ref, label: ref };
    return { origin: "file", trust: "local", ref, label: ref };
  }
  if (tool === "Grep" || tool === "Glob" || tool === "LS") {
    const what = str(a.input, "pattern") ?? str(a.input, "path") ?? "";
    return { origin: "search", trust: "local", ref: `search:${a.id}`, label: `the output of ${tool} ${JSON.stringify(what)}` };
  }
  if (tool === "Bash") {
    const command = str(a.input, "command") ?? "";
    const network = /^\s*(curl|wget|gh)\b|\bgit\s+(clone|fetch|pull)\b/.test(command);
    const dependency = shellSegments(command).some((seg) => [...seg.words, ...seg.redirects].some((w) => DEPENDENCY_DIR.test(w)));
    return { origin: "shell", trust: network || dependency ? "external" : "local", ref: `shell:${a.id}`, label: `the output of \`${clip(command, 50)}\`` };
  }
  if (tool === "WebFetch") {
    const where2 = hostPath(str(a.input, "url") ?? "");
    return { origin: "web", trust: "external", ref: where2, label: `WebFetch of ${where2}` };
  }
  if (tool === "WebSearch") {
    return { origin: "web_search", trust: "external", ref: `search:${a.id}`, label: `WebSearch ${JSON.stringify(str(a.input, "query") ?? "")}` };
  }
  if (tool.startsWith("mcp__")) {
    return { origin: "mcp", trust: "external", ref: `mcp:${a.id}`, label: `MCP ${tool.slice(5).replace("__", "/")} result` };
  }
  if (tool === "Skill") {
    const name = str(a.input, "skill") ?? "";
    return { origin: "skill", trust: name.includes(":") ? "external" : "local", ref: `skill:${name}`, label: `skill ${name}` };
  }
  if (tool === "Agent" || tool === "Task") {
    return { origin: "subagent_result", trust: "agent", ref: `agent:${a.id}`, label: `subagent report from ${callId(a.id)}` };
  }
  return { origin: "tool_output", trust: "local", ref: `tool:${a.id}`, label: `${tool} output` };
}
function effectsOf(a, env) {
  if (a.status !== "ok") return [];
  const fx = (i, e) => ({ id: `fx:${a.id}:${i}`, actionId: a.id, ...e });
  if (WRITE_TOOLS.has(a.tool)) {
    const path = str(a.response, "filePath") ?? str(a.input, "file_path") ?? str(a.input, "notebook_path");
    if (!path) return [];
    const hunk = arr(field(a.response, "structuredPatch"))[0];
    const patch = arr(field(hunk, "lines")).filter((l) => typeof l === "string").slice(0, 10);
    return [fx(0, { kind: "file", target: displayPath(path, env.cwd, env.home), path, evidence: "filePath", patch })];
  }
  if (a.tool === "Bash") {
    const command = str(a.input, "command") ?? "";
    const out = [];
    const commit = parseCommitSha(command, str(a.response, "stdout") ?? toText(a.response));
    if (commit) {
      out.push(fx(out.length, { kind: "commit", target: `${commit.sha} on ${commit.branch}`, path: null, evidence: "commit_stdout", patch: [], commit }));
    }
    if (field(a.response, "bashEditDiff") !== void 0) {
      for (const path of changedFiles(a.response, env.cwd)) {
        out.push(fx(out.length, { kind: "file", target: displayPath(path, env.cwd, env.home), path, evidence: "bashEditDiff", patch: [] }));
      }
    } else {
      for (const e of expectedShellEffects(command, env.cwd)) {
        const path = e.kind === "file" ? e.target : null;
        const target = path ? displayPath(path, env.cwd, env.home) : e.target;
        out.push(fx(out.length, { kind: e.kind, target, path, evidence: "expected", patch: [] }));
      }
    }
    return out;
  }
  if (a.tool === "WebFetch") {
    return [fx(0, { kind: "network", target: hostPath(str(a.input, "url") ?? ""), path: null, evidence: "response", patch: [] })];
  }
  if (a.tool.startsWith("mcp__")) {
    const server = a.mcpServer?.name ?? a.tool.split("__")[1] ?? a.tool;
    return [fx(0, { kind: "network", target: `MCP server ${server}`, path: null, evidence: "response", patch: [] })];
  }
  return [];
}

// src/ingest/content.ts
import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
var STRUCTURE = /* @__PURE__ */ new Set(["filePath", "agentId", "status", "isAsync", "success", "commandName", "code", "url", "interrupted", "isImage", "noOutputExpected", "type", "bashEditDiff", "resolvedModel", "description"]);
var COMMIT_LINE2 = /^\[[^\]\n]{1,200}\] [^\n]{0,300}$/m;
var TASK_HEAD = /^\s*<task-notification>[\s\S]{0,4000}?<\/summary>/;
function contentHmac(dataDir, create) {
  const path = join2(dataDir, "content.key");
  let key;
  try {
    key = readFileSync(path);
  } catch {
    if (!create) return void 0;
    key = randomBytes(32);
    writeFileSync(path, key, { mode: 384, flag: "wx" });
    chmodSync(path, 384);
    key = readFileSync(path);
  }
  return (span) => createHmac("sha256", key).update(span).digest("hex").slice(0, 12);
}
function hashContent(p, hookEvent, hmac) {
  const hash = (s) => s ? hashText(s, hmac) : s;
  const extra = p._contrail;
  if (extra && typeof extra === "object" && typeof extra.text === "string") {
    const e = extra;
    e.text = hash(e.text);
    e.sha256 = null;
  }
  switch (hookEvent) {
    case "UserPromptSubmit": {
      const prompt = typeof p.prompt === "string" ? p.prompt : "";
      const head = TASK_HEAD.exec(prompt)?.[0];
      if (head) p.prompt = `${head}
${hash(prompt.slice(head.length))}`;
      break;
    }
    case "PostToolUse":
      p.tool_response = hashResponse(p.tool_response, hash);
      break;
    case "PostToolUseFailure":
      if (typeof p.error === "string") p.error = hash(p.error);
      break;
    case "PostToolBatch":
      if (Array.isArray(p.tool_calls)) {
        p.tool_calls = p.tool_calls.map((c) => c && typeof c === "object" ? { ...c, tool_response: hashResponse(c.tool_response, hash) } : c);
      }
      break;
    case "PostCompact":
      if (typeof p.compact_summary === "string") p.compact_summary = hash(p.compact_summary);
      break;
    case "Stop":
    case "SubagentStop":
      if (typeof p.last_assistant_message === "string") p.last_assistant_message = "";
      break;
  }
}
function hashResponse(value, hash, key = "") {
  if (typeof value === "string") {
    if (STRUCTURE.has(key)) return value;
    const commit = key === "stdout" || key === "" ? COMMIT_LINE2.exec(value)?.[0] : void 0;
    return commit ? `${commit}
${hash(value)}` : hash(value);
  }
  if (key === "bashEditDiff") return value;
  if (key === "structuredPatch") return [];
  if (Array.isArray(value)) return value.map((v) => hashResponse(v, hash));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hashResponse(v, hash, k)]));
  }
  return value;
}

// src/ingest/redact.ts
var tag2 = (id) => `[REDACTED:${id}]`;
var isTag = (v) => v.startsWith("[REDACTED");
var PLACEHOLDER = /^(?:\$\{?[A-Za-z_]\w{0,127}\}?|\$\(.{0,512}|\$?\{\{.{0,256}\}\}|%[A-Za-z_]\w{0,127}%|<[^<>\n]{0,128}>|x{3,64}|\*{3,64}|\.{3}|…|change[-_]?me|your[-_a-z]{0,64}|redacted|placeholder)$/i;
var KEYWORD = /^(?:true|false|yes|no|on|off|null|nil|none|undefined|empty|required|optional|enabled|disabled|include|omit|same-origin|string|str|number|int|bool|boolean|bytes|any|unknown|object|SecretStr|await|new|yield|typeof|lambda|function|async|not|infer|keyof)$/i;
var TYPE_NAME = /^(?:[A-Z][a-z]{2,31}(?:8|16|32|64)?){1,8}(?:<[\w$<>, |[\].]{0,128}>)?(?:\[\])?$/;
var ID = String.raw`[A-Za-z_$][\w$]{0,63}`;
var ARG = String.raw`(?:"[^"\n]{0,128}"|'[^'\n]{0,128}'|${ID}(?:\.${ID}){0,8}|\d{1,10})`;
var CALL_START = /^(?:[A-Za-z_$][\w$]{1,63}|[A-Za-z_$](?=\??\.))(?:\??\.[A-Za-z_$][\w$]{0,63}){0,12}[([]/;
var CODE_CHARS = /^[\w$.?,'"\s()[\]:=/+*-]{0,1024}$/;
var AFTER_BRACKET = /[)\]][\w$]/;
var MEMBER = new RegExp(
  String.raw`^(?:process|import\.meta|os|env|Deno|Bun|System|config|cfg|conf|settings|options|opts|props|args|argv|params|parameters|inputs|secrets|vars|variables|credentials|creds|ctx|context|req|request|app|window|globalThis|global|module|exports|this|self|cls|data|values|form|state|store|environment|vault|session|user|account|client|locals|kwargs|payload|body|headers|query|github|steps|needs|matrix|Rails)(?:\??\.${ID}|\[${ARG}\]){1,12}$`,
  "i"
);
var CHAIN = new RegExp(String.raw`^${ID}(?:\.${ID}){0,12}$`);
var EXPRESSION = /^\{[\w$.?()[\] ,]{1,256}\}$/;
function namesSecret(value, name = "", literal = false) {
  if (value === "" || isTag(value) || PLACEHOLDER.test(value) || KEYWORD.test(value)) return true;
  if (literal) return false;
  if (CALL_START.test(value) && CODE_CHARS.test(value) && !AFTER_BRACKET.test(value)) return true;
  if (MEMBER.test(value) || EXPRESSION.test(value)) return true;
  if (CHAIN.test(value)) {
    const parts = value.split(".");
    const tail = name.slice(name.lastIndexOf(".") + 1);
    if (flat(parts[parts.length - 1]) === flat(tail)) return true;
    if (/[_.]|[a-z][A-Z]/.test(value) && parts.some(isSecretName)) return true;
  }
  return false;
}
var flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function segments2(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[^a-z0-9]{1,64}/).filter(Boolean);
}
var STRONG = /secret|passw(?:or)?d|passphrase|credential|authori[sz]ation|cookie|^pass$|^pw$|pwd$|^creds?$|(?:api|access|private|signing|master|encryption|auth|app)key|token(?!s$|iz)/;
var WEAK = /* @__PURE__ */ new Set(["key", "auth", "private", "master", "signing", "encryption", "crypt"]);
var KEY_QUALIFIER = /* @__PURE__ */ new Set([
  "api",
  "app",
  "access",
  "secret",
  "private",
  "master",
  "signing",
  "sign",
  "encryption",
  "encrypt",
  "crypto",
  "cipher",
  "hmac",
  "jwt",
  "auth",
  "client",
  "license",
  "licence",
  "service",
  "account",
  "shared",
  "webhook",
  "deploy",
  "ssh",
  "gpg",
  "pgp",
  "aes",
  "rsa",
  "consumer",
  "subscription",
  "session",
  "csrf",
  "admin",
  "root",
  "write",
  "storage"
]);
var ABOUT = /* @__PURE__ */ new Set([
  "file",
  "files",
  "path",
  "dir",
  "directory",
  "filename",
  "fd",
  "stdin",
  "url",
  "uri",
  "endpoint",
  "host",
  "hostname",
  "port",
  "name",
  "names",
  "id",
  "ids",
  "type",
  "types",
  "kind",
  "length",
  "len",
  "size",
  "count",
  "limit",
  "max",
  "min",
  "budget",
  "usage",
  "used",
  "ttl",
  "timeout",
  "expiry",
  "expires",
  "expiration",
  "lifetime",
  "prefix",
  "suffix",
  "field",
  "env",
  "mode",
  "method",
  "provider",
  "policy",
  "algorithm",
  "alg",
  "version",
  "format",
  "encoding",
  "strategy",
  "scheme",
  "helper",
  "enabled",
  "disabled",
  "required",
  "rotation",
  "hint",
  "prompt",
  "label",
  "placeholder",
  "description",
  "title",
  "message",
  "error",
  "user",
  "username",
  "email",
  "ip",
  "address",
  "domain",
  "issuer",
  "audience",
  "scope",
  "scopes",
  "callback",
  "redirect",
  "store",
  "backend",
  "driver",
  "manager",
  "command",
  "cmd"
]);
var WHOLE = /* @__PURE__ */ new Set(["auth", "identitytoken", "clientcertificatedata"]);
function isSecretName(name) {
  if (/^(?:old)?pwd$/i.test(name)) return false;
  const segs = segments2(name);
  if (segs.length === 0 || ABOUT.has(segs[segs.length - 1])) return false;
  if (WHOLE.has(segs.join(""))) return true;
  const envStyle = !/[a-z]/.test(name);
  return segs.some((s, i) => {
    if (STRONG.test(s)) return true;
    if (s === "key") return envStyle || i > 0 && KEY_QUALIFIER.has(segs[i - 1]);
    return WEAK.has(s) && (envStyle || segs.length > 1 && i === segs.length - 1);
  });
}
var BASE64ISH = /^[A-Za-z0-9+/=_-]{8,8192}$/;
var credentialBlob = (v) => BASE64ISH.test(v) && (/[0-9+/=]/.test(v) || /[a-z]/.test(v) && /[A-Z]/.test(v));
function secretValue(name, value, literal = false) {
  if (!isSecretName(name) || namesSecret(value, name, literal)) return false;
  return flat(name) === "auth" ? credentialBlob(value) : true;
}
function splitTrailing(value) {
  let end = value.length;
  while (end > 0) {
    const c = value[end - 1];
    const opener = c === ")" ? "(" : c === "]" ? "[" : c === "}" ? "{" : "";
    if (c === "," || c === ".") end--;
    else if (opener && count(value.slice(0, end), c) > count(value.slice(0, end), opener)) end--;
    else break;
  }
  return [value.slice(0, end), value.slice(end)];
}
var count = (s, c) => s.split(c).length - 1;
var PEM_BEGIN = /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----/g;
var PEM_END = /-----END [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----/g;
var PEM_BODY = /(?:(?:\r?\n|\\r\\n|\\n)[A-Za-z0-9+/=]{1,1024}(?=\r?\n|\\[rn]|["']|$)){0,1024}/y;
var PEM_SPAN = 65536;
function redactPrivateKeys(s) {
  if (!s.includes("PRIVATE KEY")) return s;
  const ends = [];
  for (const m of s.matchAll(PEM_END)) ends.push([m.index, m.index + m[0].length]);
  let out = "";
  let last = 0;
  let e = 0;
  PEM_BEGIN.lastIndex = 0;
  for (let m = PEM_BEGIN.exec(s); m; m = PEM_BEGIN.exec(s)) {
    const headerEnd = m.index + m[0].length;
    while (e < ends.length && ends[e][0] < headerEnd) e++;
    let stop;
    if (e < ends.length && ends[e][0] - headerEnd <= PEM_SPAN) {
      stop = ends[e][1];
    } else {
      PEM_BODY.lastIndex = headerEnd;
      PEM_BODY.exec(s);
      stop = PEM_BODY.lastIndex;
    }
    out += s.slice(last, m.index) + tag2("private-key");
    last = stop;
    PEM_BEGIN.lastIndex = stop;
  }
  return out + s.slice(last);
}
var NAME = String.raw`(?<![A-Za-z0-9_.])(?<![A-Za-z0-9_.]-)(?=[A-Za-z_])([A-Za-z0-9_.-]{0,128}(?:secret|token|pass|pwd|pw|key|auth|credential|cred|private|master|signing|encryption|crypt|cookie|certificate)[A-Za-z0-9_.-]{0,64})`;
var SEP = String.raw`(["']?[ \t]{0,4}(?::[ \t]{0,4}[A-Za-z_][\w.[\]|]{0,40}[ \t]{1,4}=(?![=>~])|:=|=>|:(?!:)|=(?![=>~]))[ \t]{0,4})`;
var BARE = String.raw`((?:[^\s"'\`;&,]|[&,](?![ \t]{0,4}["']?[A-Za-z_][\w.-]{0,64}["']?[ \t]{0,4}[:=])){1,16384})`;
var QUOTED = String.raw`"((?:[^"\\\n]|\\.){1,16384})"|'([^'\n]{1,16384})'`;
var RULES = [
  { id: "aws-access-key", re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { id: "github-token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { id: "gitlab-token", re: /\bgl(?:pat|dt|ptt|rt|cbt|imt|agent|soat|ffct|oas)-[A-Za-z0-9_.-]{20,128}/g },
  { id: "npm-token", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: "pypi-token", re: /\bpypi-AgE[A-Za-z0-9_-]{50,1024}/g },
  { id: "rubygems-token", re: /\brubygems_[a-f0-9]{48}\b/g },
  { id: "huggingface-token", re: /\bhf_[A-Za-z0-9]{30,64}\b/g },
  { id: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,256}/g },
  {
    id: "openai-key",
    re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,256}/g,
    // A project, service or admin key is always one; a bare sk- key mixes digits and capitals, and a kebab-case CSS class does not.
    replace: (m) => /^sk-(?:proj|svcacct|admin)-/.test(m) || /\d/.test(m) && /[A-Z]/.test(m) ? tag2("openai-key") : m
  },
  { id: "xai-key", re: /\bxai-[A-Za-z0-9]{40,128}\b/g },
  { id: "groq-key", re: /\bgsk_[A-Za-z0-9]{48,64}\b/g },
  { id: "perplexity-key", re: /\bpplx-[A-Za-z0-9]{40,64}\b/g },
  { id: "replicate-token", re: /\br8_[A-Za-z0-9]{30,64}\b/g },
  { id: "slack-token", re: /\b(?:xox(?:[abposre]|e\.xox[bp])-|xapp-\d-)[A-Za-z0-9-]{10,256}/g },
  {
    id: "webhook-url",
    re: /https:\/\/(?:hooks\.slack\.com\/services|(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks)\/[A-Za-z0-9/_-]{8,256}/g
  },
  { id: "stripe-key", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,256}/g },
  { id: "stripe-webhook-secret", re: /\bwhsec_[A-Za-z0-9]{24,256}/g },
  { id: "sendgrid-key", re: /\bSG\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{16,128}/g },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}/g },
  { id: "google-oauth-token", re: /\bya29\.[A-Za-z0-9_-]{20,4096}/g },
  { id: "google-oauth-secret", re: /\bGOCSPX-[A-Za-z0-9_-]{20,64}/g },
  {
    id: "vault-token",
    re: /\bhv[sbr]\.[A-Za-z0-9_-]{20,1024}/g,
    replace: (m) => /\d/.test(m) && /[A-Z]/.test(m) ? tag2("vault-token") : m
  },
  { id: "digitalocean-token", re: /\bdo[opr]_v1_[a-f0-9]{64}\b/g },
  { id: "shopify-token", re: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/g },
  { id: "linear-key", re: /\blin_api_[A-Za-z0-9]{40}\b/g },
  { id: "postman-key", re: /\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b/g },
  { id: "sentry-token", re: /\bsntry[su]_[A-Za-z0-9+/=_-]{40,1024}/g },
  { id: "databricks-token", re: /\bdapi[a-f0-9]{32}(?:-\d)?\b/g },
  { id: "doppler-token", re: /\bdp\.(?:st|sa|ct|pt|scim|audit)\.[A-Za-z0-9_.-]{40,128}/g },
  { id: "supabase-key", re: /\b(?:sbp_[a-f0-9]{40}\b|sb_secret_[A-Za-z0-9_-]{20,128})/g },
  { id: "tailscale-key", re: /\btskey-[a-z]{1,16}-[A-Za-z0-9]{8,64}-[A-Za-z0-9]{16,128}/g },
  { id: "age-secret-key", re: /\bAGE-SECRET-KEY-1[0-9A-Z]{58}\b/g },
  { id: "terraform-token", re: /\b[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9_=-]{60,128}/g },
  { id: "onepassword-token", re: /\bops_eyJ[A-Za-z0-9+/=_-]{50,8192}/g },
  { id: "azure-client-secret", re: /(?<![A-Za-z0-9_~.-])[A-Za-z0-9_~.-]{3}\dQ~[A-Za-z0-9_~.-]{31,34}(?![A-Za-z0-9_~.-])/g },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,8192}\.eyJ[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{8,8192}/g },
  { id: "azure-sas", re: /([?&]sig=)[A-Za-z0-9%+/=]{16,512}/g, replace: (_m, prefix) => `${prefix}${tag2("azure-sas")}` },
  {
    id: "auth-header",
    re: /\b((?:proxy-)?authorization|x-api-key)(["']?\s{0,4}[:=]\s{0,4}["']?)((?:bearer|basic|token)\s{1,4})?([^\s"',;]{1,4096})/gi,
    replace: (m, name, sep, scheme, value) => PLACEHOLDER.test(value) || isTag(value) ? m : `${name}${sep}${scheme ?? ""}${tag2("auth-header")}`
  },
  {
    id: "cookie",
    re: /\b((?:set-)?cookie)(\s{0,4}:\s{0,4})[^\r\n]{1,4096}/gi,
    replace: (_m, name, sep) => `${name}${sep}${tag2("cookie")}`
  },
  {
    id: "url-password",
    // A password may hold a / (then no @), or an @ (then no /): greedy up to the last @ so it is removed whole.
    // A port (host:443/path/@scope) is not a password, and container digests are not credentials.
    re: /\b([a-z][a-z0-9+.-]{0,31}:\/\/[^\s:@/]{0,256}:)([^\s/@]{1,256}(?:\/[^\s/@]{0,256}){1,8}|[^\s/]{1,256})@(?!sha256:)/gi,
    replace: (m, prefix, password) => PLACEHOLDER.test(password) || /^\d{1,5}(?:\/|$)/.test(password) ? m : `${prefix}${tag2("url-password")}@`
  },
  {
    id: "netrc",
    when: /\bmachine[ \t]{1,16}\S{1,256}\s{1,16}(?:login|password|account|port)\b|\bdefault[ \t]{1,16}login\b/,
    re: /(\bpassword[ \t]{1,16})(\S{1,1024})/g,
    replace: (m, prefix, value) => namesSecret(value) ? m : `${prefix}${tag2("netrc")}`
  },
  {
    // ~/.pgpass: host:port:database:user:password, one per line.
    id: "pgpass",
    re: /^([^\s:/#][^\s:/]{0,255}:(?:\d{1,5}|\*):[^\s:]{1,256}:[^\s:]{1,256}:)(\S{1,1024})(?=\r?$)/gm,
    replace: (m, prefix, value) => namesSecret(value) ? m : `${prefix}${tag2("pgpass")}`
  },
  {
    id: "cli-password",
    re: /((?:^|\s)(?:-u|--user|--auth)(?:=|\s{1,4})["']?[^\s:"']{1,128}:)([^\s"']{1,256})/g,
    replace: (_m, prefix) => `${prefix}${tag2("cli-password")}`
  },
  {
    // A password glued to its flag: mysql -pSECRET, 7z -pSECRET.
    id: "cli-password",
    re: /(\b(?:mysql(?:dump|admin|import|check|sh)?|mariadb(?:-dump|-admin)?|7z[az]?)\b[^\n]{0,200}?\s-p)([^\s-][^\s]{2,255})/g,
    replace: (_m, prefix) => `${prefix}${tag2("cli-password")}`
  },
  {
    // The short flags that take a password in these commands: sshpass -p, docker login -p, twine -p, redis-cli -a, ldapsearch -w, zip -P.
    id: "cli-password",
    re: /(\b(?:(?:sshpass|twine|mongo(?:sh|dump|restore|export|import|stat|top|files)?)\b[^\n;|&]{0,256}?[ \t]-p|(?:docker|podman|nerdctl|buildah|skopeo|oras|finch|helm[ \t]{1,4}registry)[ \t]{1,4}login\b[^\n;|&]{0,256}?[ \t]-p|redis-cli\b[^\n;|&]{0,256}?[ \t]-a|ldap(?:search|add|modify|delete|whoami|passwd|compare|modrdn)\b[^\n;|&]{0,256}?[ \t]-w|(?:zip|unzip)\b[^\n;|&]{0,256}?[ \t]-P)(?:=|[ \t]{0,4}))(["']?)([^\s"'-][^\s"']{0,4095})/g,
    replace: (m, prefix, quote2, value) => namesSecret(value) ? m : `${prefix}${quote2}${tag2("cli-password")}`
  },
  {
    // aws configure set aws_secret_access_key X, npm config set //registry/:_authToken X.
    id: "cli-password",
    re: /(\bconfig(?:ure)?[ \t]{1,4}set[ \t]{1,4}(?:--?[\w-]{1,32}[ \t]{1,4}){0,3}([^\s="']{1,256})(?:=|[ \t]{1,4}))(["']?)([^\s"']{1,4096})/g,
    replace: (m, prefix, name, quote2, value) => secretValue(name, value, quote2 !== "") ? `${prefix}${quote2}${tag2("cli-password")}` : m
  },
  {
    // --password X, --token=X, --api-key X, -storepass X. A value starting with - is the next flag, unless it came after =.
    id: "cli-password",
    re: /((?:^|[\s(])--?([A-Za-z][A-Za-z0-9_-]{1,63})(?:=(["']?)([^\s"']{1,4096})|[ \t]{1,4}(["']?)([^\s"'-][^\s"']{0,4095})))/g,
    replace: (m, _all, flag, q1, v1, q2, v2) => {
      const value = v1 ?? v2 ?? "";
      if (!secretFlag(flag) || namesSecret(value, flag, Boolean(q1 || q2))) return m;
      return m.slice(0, m.length - value.length) + tag2("cli-password");
    }
  },
  {
    // {"Name": "DB_PASSWORD", "Value": "…"} as text: ECS task definitions, CloudFormation parameters.
    id: "secret-pair",
    re: /("(?:name|key|parametername|parameterkey)"[ \t\r\n]{0,64}:[ \t\r\n]{0,64}"([A-Za-z0-9_./:-]{1,128})"[ \t\r\n]{0,64},[ \t\r\n]{0,64}"(?:value|parametervalue)"[ \t\r\n]{0,64}:[ \t\r\n]{0,64}")((?:[^"\\\n]|\\.){1,16384})"/gi,
    replace: (m, prefix, name, value) => secretValue(name, value, true) ? `${prefix}${tag2("secret-pair")}"` : m
  },
  {
    id: "secret-pair",
    re: /("(?:value|parametervalue)"[ \t\r\n]{0,64}:[ \t\r\n]{0,64}")((?:[^"\\\n]|\\.){1,16384})("[ \t\r\n]{0,64},[ \t\r\n]{0,64}"(?:name|key|parametername|parameterkey)"[ \t\r\n]{0,64}:[ \t\r\n]{0,64}"([A-Za-z0-9_./:-]{1,128})")/gi,
    replace: (m, prefix, value, suffix, name) => secretValue(name, value, true) ? `${prefix}${tag2("secret-pair")}${suffix}` : m
  },
  {
    // - name: DB_PASSWORD
    //   value: hunter2        (Kubernetes env, GitHub Actions inputs)
    id: "secret-pair",
    re: /(\bname:[ \t]{1,4}["']?([A-Za-z0-9_.-]{1,128})["']?[ \t]{0,4}\r?\n[ \t]{0,64}value:[ \t]{1,4})(?:"((?:[^"\\\n]|\\.){1,16384})"|'([^'\n]{1,16384})'|([^\s#'"][^\r\n]{0,16383}))/g,
    replace: (m, prefix, name, dq, sq, bare) => {
      const value = dq ?? sq ?? bare?.trimEnd() ?? "";
      const quote2 = dq !== void 0 ? '"' : sq !== void 0 ? "'" : "";
      if (!secretValue(name, value, quote2 !== "")) return m;
      return `${prefix}${quote2}${tag2("secret-pair")}${quote2}`;
    }
  },
  {
    // define('DB_PASSWORD', 'x'), os.environ.setdefault("SECRET_KEY", "x"), headers.set("Authorization", "x").
    id: "secret-pair",
    re: /(\b(?:define|setdefault|setenv|putenv|set|env|getenv|get|fetch|header|setHeader|append|add|put)\([ \t]{0,4}(["'])([A-Za-z0-9_.-]{1,128})\2[ \t]{0,4},[ \t]{0,4})(["'])((?:(?!\4)[^\n\\]|\\.){1,4096})\4/g,
    replace: (m, prefix, _q, name, vq, value) => secretValue(name, value, true) ? `${prefix}${vq}${tag2("secret-pair")}${vq}` : m
  },
  {
    id: "env-secret",
    re: new RegExp(`${NAME}${SEP}((?:bearer|basic|token)[ \\t]{1,4})?(?:${QUOTED}|${BARE})`, "gi"),
    replace: (m, name, sep, scheme, dq, sq, bare) => {
      if (dq !== void 0 || sq !== void 0) {
        const value2 = dq ?? sq ?? "";
        if (!secretValue(name, value2, true)) return m;
        const quote2 = dq !== void 0 ? '"' : "'";
        return `${name}${sep}${scheme ?? ""}${quote2}${tag2("env-secret")}${quote2}`;
      }
      const [value, trailing] = splitTrailing(bare ?? "");
      if (value.length < 4 || !secretValue(name, value)) return m;
      if (/^["']?[ \t]*:[ \t]*$/.test(sep) && TYPE_NAME.test(value)) return m;
      return `${name}${sep}${scheme ?? ""}${tag2("env-secret")}${trailing}`;
    }
  }
];
function secretFlag(flag) {
  if (FLAG_SWITCH.test(flag)) return false;
  return isSecretName(flag) || /^(?:(?:store|key|src|dest|new|old|srcstore|deststore)pass|pass(?:in|out))$/i.test(flag);
}
var FLAG_SWITCH = /^(?:no|ask|prompt|use|with|without|skip|show|print|reset|rotate|generate|gen|allow|enable|disable|require|ignore|keep|save|read|refresh|revoke|check|verify)-/i;
function redactString(s) {
  let out = redactPrivateKeys(s);
  for (const rule of RULES) {
    if (rule.when && !rule.when.test(out)) continue;
    const replace = rule.replace ?? (() => tag2(rule.id));
    out = out.replace(rule.re, replace);
  }
  return out;
}
var CAP_OVERSCAN = 8 * 1024;
var TOKEN_CHAR = /[A-Za-z0-9_+/=.~-]/;
function redactCapped(s, cap) {
  if (s.length <= cap) return redactString(s);
  const clean = redactString(s.slice(0, cap + CAP_OVERSCAN));
  let cut = Math.min(cap, clean.length);
  const open = clean.lastIndexOf("[REDACTED:", cut);
  const close = open === -1 ? -1 : clean.indexOf("]", open);
  if (open !== -1 && close >= cut) {
    cut = close + 1;
  } else if (cut < clean.length && TOKEN_CHAR.test(clean[cut])) {
    const floor = Math.max(0, cut - 4096);
    while (cut > floor && TOKEN_CHAR.test(clean[cut - 1])) cut--;
  }
  return `${clean.slice(0, cut)}
\u2026[contrail: truncated ${s.length - cap} bytes]`;
}
var MAX_DEPTH2 = 64;
function jsonText(root) {
  const parts = [];
  const stack = [{ value: root }];
  while (stack.length > 0) {
    const item = stack.pop();
    if ("raw" in item) {
      parts.push(item.raw);
      continue;
    }
    const v = item.value;
    if (Array.isArray(v)) {
      stack.push({ raw: "]" });
      for (let i = v.length - 1; i >= 0; i--) {
        stack.push({ value: v[i] ?? null });
        if (i > 0) stack.push({ raw: "," });
      }
      stack.push({ raw: "[" });
    } else if (v && typeof v === "object") {
      const entries = Object.entries(v).filter(([, x]) => x !== void 0);
      stack.push({ raw: "}" });
      for (let i = entries.length - 1; i >= 0; i--) {
        const [k, x] = entries[i];
        stack.push({ value: x });
        stack.push({ raw: `${i > 0 ? "," : ""}${JSON.stringify(k)}:` });
      }
      stack.push({ raw: "{" });
    } else {
      parts.push(JSON.stringify(v) ?? "null");
    }
  }
  return parts.join("");
}
var PAIR_NAME = /* @__PURE__ */ new Set(["key", "name", "parameterkey", "parametername"]);
var PAIR_VALUE = /* @__PURE__ */ new Set(["value", "parametervalue"]);
function redactValue(value, options = {}) {
  const text = (s) => options.cap === void 0 ? redactString(s) : redactCapped(s, options.cap);
  const walk = (v, depth, key) => {
    if (typeof v === "string") return key && secretValue(key, v, true) ? tag2("secret-field") : text(v);
    if (!v || typeof v !== "object") return v;
    if (depth >= MAX_DEPTH2) return text(jsonText(v));
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1, ""));
    const entries = Object.entries(v);
    const pair = entries.find(([k, x]) => PAIR_NAME.has(k.toLowerCase()) && typeof x === "string");
    const pairName = pair && isSecretName(pair[1]) ? pair[1] : "";
    const keyOf = (k) => PAIR_NAME.has(k.toLowerCase()) ? "" : pairName && PAIR_VALUE.has(k.toLowerCase()) ? pairName : k;
    return Object.fromEntries(entries.map(([k, x]) => [k, walk(x, depth + 1, keyOf(k))]));
  };
  return walk(value, 0, "");
}
var PATTERNS = [
  ...RULES.flatMap((r) => r.when ? [r.re, r.when] : [r.re]),
  PLACEHOLDER,
  KEYWORD,
  TYPE_NAME,
  CALL_START,
  CODE_CHARS,
  AFTER_BRACKET,
  MEMBER,
  CHAIN,
  EXPRESSION,
  STRONG,
  BASE64ISH,
  FLAG_SWITCH,
  PEM_BEGIN,
  PEM_END,
  PEM_BODY,
  TOKEN_CHAR
];

// src/ingest/ingest.ts
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readdirSync, readFileSync as readFileSync2, rmSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join as join3 } from "node:path";
var STRING_CAP = 256 * 1024;
var STALE_TMP_MS = 60 * 60 * 1e3;
var WRITE_TOOLS2 = /* @__PURE__ */ new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
var READ_TOOLS = /* @__PURE__ */ new Set(["Read", "NotebookRead"]);
function ingest(db, spoolDir, repoKeyOf, now = Date.now(), hmac) {
  const report2 = { ingested: 0, duplicates: 0, parseErrors: 0, staleTmpRemoved: 0 };
  let names;
  try {
    names = readdirSync(spoolDir).sort();
  } catch {
    return report2;
  }
  for (const name of names) {
    const file = join3(spoolDir, name);
    if (name.startsWith(".tmp.")) {
      if (removeIfStale(file, now)) report2.staleTmpRemoved++;
      continue;
    }
    if (!name.endsWith(".json")) continue;
    let raw;
    let mtimeNs;
    try {
      const read = readSpoolFile(file);
      if (!read) {
        rmSync(file, { force: true });
        continue;
      }
      ({ raw, mtimeNs } = read);
    } catch (e) {
      if (e.code === "ELOOP") rmSync(file, { force: true });
      continue;
    }
    const capturedUs = Number(mtimeNs / 1000n);
    let row;
    try {
      row = toRow(name, raw, capturedUs, repoKeyOf, hmac);
    } catch (e) {
      row = failedRow(capturedUs, errorText(name, e));
    }
    if (row.parseError) report2.parseErrors++;
    db.exec("BEGIN IMMEDIATE");
    try {
      const inserted = db.run(
        `INSERT OR IGNORE INTO events
           (spool_name, captured_us, session_id, prompt_id, agent_id, hook_event, tool_name, tool_use_id, cwd, repo_key, payload, parse_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        name,
        row.capturedUs,
        row.sessionId,
        row.promptId,
        row.agentId,
        row.hookEvent,
        row.toolName,
        row.toolUseId,
        row.cwd,
        row.repoKey,
        row.payload,
        row.parseError
      );
      if (inserted) {
        const id = db.get("SELECT id FROM events WHERE spool_name = ?", name).id;
        for (const t of row.touches) db.run("INSERT INTO touches (event_id, path, kind) VALUES (?, ?, ?)", id, t.path, t.kind);
        report2.ingested++;
      } else {
        report2.duplicates++;
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    try {
      unlinkSync(file);
    } catch {
    }
  }
  return report2;
}
function toRow(name, raw, capturedUs, repoKeyOf, hmac) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ...failedRow(capturedUs, errorText(name, e)), payload: JSON.stringify({ raw: redactCapped(raw, STRING_CAP) }) };
  }
  const p = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed };
  const hookEvent = str(p, "hook_event_name") ?? "unknown";
  const cwd = str(p, "cwd") ?? null;
  const meta = {
    capturedUs,
    sessionId: str(p, "session_id") ?? null,
    promptId: str(p, "prompt_id") ?? null,
    agentId: str(p, "agent_id") ?? null,
    hookEvent,
    toolName: str(p, "tool_name") ?? null,
    toolUseId: str(p, "tool_use_id") ?? null,
    cwd,
    repoKey: cwd ? repoKeyOf(cwd) : null
  };
  try {
    if (hookEvent === "InstructionsLoaded") attachInstructionText(p, capturedUs);
    if (hookEvent === "PostToolUse" && str(p, "tool_name") === "Skill") attachSkillText(p, capturedUs);
    return {
      ...meta,
      payload: JSON.stringify(stored(p, hookEvent, hmac)),
      parseError: null,
      touches: hookEvent === "PostToolUse" ? touchesOf(p, cwd ?? "") : []
    };
  } catch (e) {
    return { ...meta, payload: "{}", parseError: errorText(name, e), touches: [] };
  }
}
function stored(p, hookEvent, hmac) {
  const clean = redactValue(dropBulky(p), { cap: STRING_CAP });
  if (!hmac) return clean;
  hashContent(clean, hookEvent, hmac);
  return capValue(clean);
}
function failedRow(capturedUs, parseError) {
  return {
    capturedUs,
    sessionId: null,
    promptId: null,
    agentId: null,
    hookEvent: "unparsed",
    toolName: null,
    toolUseId: null,
    cwd: null,
    repoKey: null,
    touches: [],
    payload: "{}",
    parseError
  };
}
var QUOTED_INPUT = /(?:\.{3})?"[\s\S]{0,1024}"(?:\.{3})?(?= is not valid JSON$)/;
function errorText(name, e) {
  const message = e instanceof Error ? e.message : String(e);
  return redactString(`${name}: ${message.replace(QUOTED_INPUT, '"\u2026"')}`);
}
var INSTRUCTION_FILE = /(^|\/)CLAUDE(\.local)?\.md$|\/\.claude\/rules\/.+\.md$/i;
function attachInstructionText(p, capturedUs) {
  const path = str(p, "file_path");
  if (!path || !INSTRUCTION_FILE.test(path)) return;
  attachFileText(p, path, capturedUs);
}
var SKILL_NAME = /^[A-Za-z0-9][\w.-]{0,63}$/;
function attachSkillText(p, capturedUs) {
  const name = str(obj(p, "tool_input"), "skill");
  const cwd = str(p, "cwd");
  if (!name || !SKILL_NAME.test(name) || name.includes("..")) return;
  const candidates = [join3(homedir(), ".claude", "skills", name, "SKILL.md"), ...cwd ? [join3(cwd, ".claude", "skills", name, "SKILL.md")] : []];
  const found = [...new Set(candidates)].filter((path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  });
  if (found.length !== 1) return;
  attachFileText(p, found[0], capturedUs);
  p._contrail.path = found[0];
}
function attachFileText(p, path, capturedUs) {
  try {
    const st = statSync(path, { bigint: true });
    if (!st.isFile() || Number(st.size) > STRING_CAP) {
      p._contrail = { skipped: st.isFile() ? "larger than the storage cap" : "not a regular file" };
      return;
    }
    const changedSinceLoad = Number(st.mtimeNs / 1000n) > capturedUs;
    const text = changedSinceLoad ? "" : readFileSync2(path, "utf8");
    p._contrail = { text, sha256: text ? sha256(text) : null, changedSinceLoad };
  } catch {
    p._contrail ??= { missing: true };
  }
}
function touchesOf(p, cwd) {
  const tool = str(p, "tool_name") ?? "";
  const input = obj(p, "tool_input");
  const response = p.tool_response;
  if (WRITE_TOOLS2.has(tool)) {
    const path = str(response, "filePath") ?? str(input, "file_path") ?? str(input, "notebook_path");
    return path ? [{ path, kind: "write" }] : [];
  }
  if (READ_TOOLS.has(tool)) {
    const path = str(input, "file_path") ?? str(input, "notebook_path");
    return path ? [{ path, kind: "read" }] : [];
  }
  if (tool === "Bash") {
    if (obj(response, "bashEditDiff")) return changedFiles(response, cwd).map((path) => ({ path, kind: "write" }));
    return expectedShellEffects(str(input, "command") ?? "", cwd).filter((e) => e.kind === "file").map((e) => ({ path: e.target, kind: "expected" }));
  }
  return [];
}
function dropBulky(value, key = "", depth = 0) {
  if (typeof value === "string") {
    if (key === "originalFile" || key === "base64") {
      return `[contrail: dropped ${key}, ${value.length} bytes, sha256 ${sha256(value).slice(0, 16)}]`;
    }
    return value;
  }
  if (!value || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH2) return jsonText(value);
  if (Array.isArray(value)) return value.map((v) => dropBulky(v, "", depth + 1));
  const isBase64Block = value.type === "base64";
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, dropBulky(v, isBase64Block && k === "data" ? "base64" : k, depth + 1)])
  );
}
function capValue(value) {
  if (typeof value === "string") return capString(value);
  if (Array.isArray(value)) return value.map(capValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, capValue(v)]));
  }
  return value;
}
function capString(s) {
  return s.length <= STRING_CAP ? s : `${s.slice(0, STRING_CAP)}
\u2026[contrail: truncated ${s.length - STRING_CAP} bytes]`;
}
function removeIfStale(file, now) {
  try {
    if (now - statSync(file).mtimeMs < STALE_TMP_MS) return false;
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}
function readSpoolFile(file) {
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const st = fstatSync(fd, { bigint: true });
    if (!st.isFile()) return null;
    return { raw: readFileSync2(fd, "utf8"), mtimeNs: st.mtimeNs };
  } finally {
    closeSync(fd);
  }
}

// src/ingest/repo.ts
import { execFileSync } from "node:child_process";
import { realpathSync as realpathSync2 } from "node:fs";
function makeRepoKeyOf() {
  const cache = /* @__PURE__ */ new Map();
  return (cwd) => {
    let key = cache.get(cwd);
    if (key === void 0) {
      key = gitCommonDir(cwd) ?? cwd;
      cache.set(cwd, key);
    }
    return key;
  };
}
function gitCommonDir(cwd) {
  try {
    const out = execFileSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
      timeout: 2e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out ? realpathSync2(out) : null;
  } catch {
    return null;
  }
}

// src/paths.ts
import { existsSync, readdirSync as readdirSync2 } from "node:fs";
import { join as join4 } from "node:path";
function resolveDataDir(flag, env, home, pluginData) {
  if (flag) return flag;
  if (env.CONTRAIL_HOME) return env.CONTRAIL_HOME;
  if (pluginData) return pluginData;
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;
  const base = join4(env.CLAUDE_CONFIG_DIR || join4(home, ".claude"), "plugins", "data");
  const hits = existsSync(base) ? readdirSync2(base).filter((n) => n === "contrail" || n.startsWith("contrail-")) : [];
  if (hits.length === 1) return join4(base, hits[0]);
  if (hits.length === 0) {
    throw new ContrailError(
      `No Contrail data directory in ${base} yet. Install the plugin in Claude Code (/plugin install contrail@contrail) and start a session, or set CONTRAIL_HOME to a data directory.`
    );
  }
  const list = hits.map((h) => `  ${join4(base, h)}`).join("\n");
  throw new ContrailError(`Found ${hits.length} Contrail data directories:
${list}
Set CONTRAIL_HOME to pick one.`);
}

// src/query/blame.ts
import { readFileSync as readFileSync3, statSync as statSync2 } from "node:fs";
import { basename as basename6 } from "node:path";

// src/engine/blame.ts
import { basename as basename4, isAbsolute as isAbsolute4, resolve as resolve4 } from "node:path";
var STRUCTURE_WORDS = /* @__PURE__ */ new Set(["", "end", "else", "fi", "done", "esac", "then", "do", "try", "finally", "return", "break", "continue", "default", "pass", "endif", "begin"]);
function splitLines(text) {
  const lines = text.split("\n").map((l) => l.endsWith("\r") ? l.slice(0, -1) : l);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function lineKey(raw, notebook = false) {
  let line = raw.trim();
  if (notebook && line.startsWith('"')) {
    const literal = line.endsWith(",") ? line.slice(0, -1) : line;
    try {
      const decoded = JSON.parse(literal);
      if (typeof decoded === "string") line = decoded.trim();
    } catch {
    }
  }
  return line;
}
function isTrivial(key) {
  if (!key) return true;
  if (key.length > 24) return false;
  return STRUCTURE_WORDS.has(key.replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase());
}
function untruncated(text) {
  const cut = text.lastIndexOf("\n\u2026[contrail: truncated");
  if (cut < 0) return text;
  const kept = text.slice(0, cut);
  const lastBreak = kept.lastIndexOf("\n");
  return lastBreak < 0 ? "" : kept.slice(0, lastBreak);
}
function keysOf(text, notebook) {
  return splitLines(untruncated(text)).map((l) => lineKey(l, notebook));
}
function addText(into, prev, next, notebook) {
  const before = /* @__PURE__ */ new Map();
  for (const k of keysOf(prev, notebook)) before.set(k, (before.get(k) ?? 0) + 1);
  for (const k of keysOf(next, notebook)) {
    into.all.add(k);
    if (isTrivial(k)) continue;
    const carried = before.get(k) ?? 0;
    if (carried > 0) before.set(k, carried - 1);
    else into.added.set(k, (into.added.get(k) ?? 0) + 1);
  }
}
function writtenText(tool, input, isThisFile, cwd, notebook = false) {
  const out = { added: /* @__PURE__ */ new Map(), all: /* @__PURE__ */ new Set() };
  if (tool === "Edit") {
    addText(out, str(input, "old_string") ?? "", str(input, "new_string") ?? "", notebook);
  } else if (tool === "MultiEdit") {
    for (const e of arr(input.edits)) addText(out, str(e, "old_string") ?? "", str(e, "new_string") ?? "", notebook);
  } else if (tool === "Write") {
    addText(out, "", str(input, "content") ?? "", notebook);
  } else if (tool === "NotebookEdit") {
    if (str(input, "edit_mode") === "delete") return null;
    addText(out, "", str(input, "new_source") ?? "", false);
  } else if (tool === "Bash") {
    const bodies = heredocWrites(str(input, "command") ?? "", cwd).filter((h) => isThisFile(h.path));
    if (!bodies.length) return null;
    for (const h of bodies) addText(out, "", h.body, notebook);
  } else {
    return null;
  }
  return out.all.size ? out : null;
}
var HEREDOC = /<<(-?)[ \t]{0,8}(['"]?)([A-Za-z_][\w-]{0,63})\2/;
function heredocWrites(command, cwd) {
  const out = [];
  const lines = command.split("\n");
  let moved = false;
  for (let i = 0; i < lines.length; i++) {
    const m = HEREDOC.exec(lines[i]);
    const targets = [];
    for (const seg of shellSegments(lines[i])) {
      const words2 = unwrapCommand(seg.words);
      const prog = basename4(words2[0] ?? "");
      if (prog === "cd" || prog === "pushd" || prog === "popd") moved = true;
      if (!m) continue;
      const found = prog === "cat" ? seg.redirects : prog === "tee" ? words2.slice(1).filter((w) => !w.startsWith("-") && w !== m[3]) : [];
      for (const t of found) {
        if (t === "/dev/null" || t.startsWith("&")) continue;
        if (isAbsolute4(t)) targets.push(t);
        else if (!moved && cwd) targets.push(resolve4(cwd, t));
      }
    }
    if (!m) continue;
    const [, dash, quote2, delimiter] = m;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const candidate = dash ? lines[j].replace(/^\t{1,64}/, "") : lines[j];
      if (candidate === delimiter) break;
      body.push(candidate);
    }
    const literal = Boolean(quote2) || !body.some((l) => /[$`\\]/.test(l));
    if (j < lines.length && literal) for (const path of targets) out.push({ path, body: body.join("\n") });
    i = j;
  }
  return out;
}
function blameLines(lines, writes, notebook = false) {
  const latestFirst = [...writes].sort((a, b) => b.at - a.at || (a.tiebreak < b.tiebreak ? 1 : a.tiebreak > b.tiebreak ? -1 : 0));
  const keys = lines.map((l) => lineKey(l, notebook));
  const inFile = /* @__PURE__ */ new Map();
  for (const k of keys) inFile.set(k, (inFile.get(k) ?? 0) + 1);
  const byId = new Map(writes.map((w) => [w.id, w]));
  const out = keys.map((key, i) => {
    const base = { line: i + 1, text: lines[i], trivial: isTrivial(key), inFile: inFile.get(key) ?? 0 };
    const writers = base.trivial ? [] : latestFirst.filter((w2) => w2.text.added.has(key));
    const w = writers[0];
    if (!w) return { ...base, call: null, grade: null, match: null, writers: 0, byCall: 0, unambiguous: false };
    const byCall = w.text.added.get(key);
    const unambiguous = w.observed && byCall >= base.inFile;
    return { ...base, call: w.id, grade: unambiguous ? "LIKELY" : "POSSIBLE", match: "text", writers: writers.length, byCall, unambiguous };
  });
  const neighbour = (from, step) => {
    for (let j = from + step; j >= 0 && j < out.length; j += step) if (!out[j].trivial) return out[j];
    return "edge";
  };
  for (let i = 0; i < out.length; i++) {
    const l = out[i];
    if (!l.trivial) continue;
    const above = neighbour(i, -1);
    const below = neighbour(i, 1);
    if (above === "edge" && below === "edge") continue;
    const call = above !== "edge" ? above.call : below.call;
    if (!call || above !== "edge" && above.call !== call || below !== "edge" && below.call !== call) continue;
    const w = byId.get(call);
    if (!w.text.all.has(keys[i])) continue;
    const weakest = [above, below].some((n) => n !== "edge" && n.grade === "POSSIBLE") ? "POSSIBLE" : "LIKELY";
    out[i] = { ...l, call, grade: weakest, match: "block", writers: 0, byCall: 0, unambiguous: weakest === "LIKELY" };
  }
  return out;
}
function blameBlocks(lines) {
  const out = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (last && last.call === l.call && last.grade === l.grade) last.end = l.line;
    else out.push({ start: l.line, end: l.line, call: l.call, grade: l.grade });
  }
  return out;
}

// src/query/sessions.ts
import { basename as basename5 } from "node:path";
function recentSessions(db, repoKey, limit, all = false) {
  const query = (where2, ...params) => db.all(
    `SELECT session_id AS id, MAX(captured_us) AS lastUs, MAX(cwd) AS cwd FROM events
        WHERE session_id IS NOT NULL ${where2}
        GROUP BY session_id ORDER BY lastUs DESC LIMIT ?`,
    ...params,
    limit
  );
  if (all) return query("");
  const here = query("AND session_id IN (SELECT DISTINCT session_id FROM events WHERE repo_key = ?)", repoKey);
  return here.length ? here : query("");
}
function pickSession(db, prefix, repoKey) {
  if (!prefix || prefix === "last") {
    const [latest] = recentSessions(db, repoKey, 1);
    if (!latest) throw new ContrailError("No sessions recorded yet. Use Claude Code with the plugin enabled, then try again.");
    return latest.id;
  }
  const matches = db.all(
    "SELECT DISTINCT session_id AS id FROM events WHERE session_id LIKE ? || '%' LIMIT 5",
    prefix
  );
  if (matches.length === 1) return matches[0].id;
  if (!matches.length) throw new ContrailError(`No session starts with "${clip(prefix, 60)}". Run contrail sessions to list them.`);
  throw new ContrailError(`"${clip(prefix, 60)}" matches several sessions:
${matches.map((m) => `  ${clip(m.id, 80)}`).join("\n")}
Use more characters.`);
}
var TEXT_RESULTS = `IFNULL(hook_event = 'PostToolUse' AND (tool_name IN (${TEXT_RESULT_TOOLS.map((t) => `'${t}'`).join(", ")}) OR substr(tool_name, 1, 5) = 'mcp__'), 0)`;
function loadRows(db, sessionId, { later = false } = {}) {
  if (!later) return db.all("SELECT * FROM events WHERE session_id = ? ORDER BY captured_us, spool_name", sessionId);
  const rows = db.all(
    `SELECT * FROM events WHERE session_id = ? AND NOT ${TEXT_RESULTS}
     UNION ALL
     SELECT id, spool_name, captured_us, session_id, prompt_id, agent_id, hook_event, tool_name, tool_use_id, cwd, repo_key, NULL, parse_error
       FROM events WHERE session_id = ?1 AND ${TEXT_RESULTS}
     ORDER BY captured_us, spool_name`,
    sessionId
  );
  return rows.map((r) => {
    const row = r;
    if (r.payload === null) readLater(db, row);
    return row;
  });
}
function readLater(db, row) {
  const settle = (payload) => {
    Object.defineProperty(row, "payload", { value: payload, writable: true, enumerable: true, configurable: true });
    return payload;
  };
  Object.defineProperty(row, "payload", {
    enumerable: true,
    configurable: true,
    get: () => {
      const stored2 = db.get("SELECT payload FROM events WHERE id = ?", row.id);
      if (!stored2) throw new ContrailError("This session changed while it was being read. Run the command again.");
      return settle(stored2.payload);
    },
    set: settle
  });
  row.payloadLater = true;
}
function loadGraph(db, sessionId, home, hashToken) {
  return buildGraph(loadRows(db, sessionId, { later: true }), { home, user: basename5(home) }, hashToken);
}

// src/query/blame.ts
var MAX_WRITES = 500;
var MAX_TRAILS = 60;
var MAX_FILE_BYTES = 4 * 1024 * 1024;
function readCurrent(path, shown) {
  let size;
  try {
    const st = statSync2(path);
    if (!st.isFile()) throw new ContrailError(`${shown} is not a regular file.`);
    size = st.size;
  } catch (e) {
    if (e instanceof ContrailError) throw e;
    throw new ContrailError(`No file ${shown}. Blame reads the file as it is now on disk.`);
  }
  if (size > MAX_FILE_BYTES) throw new ContrailError(`${shown} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB; blame reads text files up to that size.`);
  const text = readFileSync3(path, "utf8");
  if (text.includes("\0")) throw new ContrailError(`${shown} looks binary; blame matches lines of text.`);
  return text;
}
function blameFile(db, path, shown, session = null) {
  const real = realPath(path);
  const text = readCurrent(real, shown);
  const rows = writesTo(db, path, real, session);
  if (!rows.length) {
    const where2 = session ? ` in session ${session.slice(0, 8)}` : "";
    throw new ContrailError(
      `No recorded agent write to ${shown}${where2}. Contrail sees Edit, Write, MultiEdit and NotebookEdit calls, and shell heredocs, in sessions recorded since it was installed.`
    );
  }
  const notebook = real.endsWith(".ipynb");
  const isThisFile = (p) => realPath(p) === real;
  const writes = [];
  const byId = /* @__PURE__ */ new Map();
  const textless = [];
  for (const row of rows.slice(0, MAX_WRITES)) {
    const payload = db.get("SELECT payload FROM events WHERE id = ?", row.eventId)?.payload ?? "{}";
    let input = {};
    try {
      input = obj(JSON.parse(payload), "tool_input") ?? {};
    } catch {
      continue;
    }
    const written = writtenText(row.tool, input, isThisFile, row.cwd ?? "", notebook);
    if (!written) {
      textless.push(row);
      continue;
    }
    writes.push({ id: row.toolUseId, at: row.us, tiebreak: row.spool, text: written, observed: row.kind === "write" });
    byId.set(row.toolUseId, row);
  }
  const lines = blameLines(splitLines(text), writes, notebook);
  const credited = new Set(lines.map((l) => l.call).filter((c) => c !== null));
  const calls = [...credited].map((id) => byId.get(id)).sort((a, b) => b.us - a.us).map((r) => ({ id: r.toolUseId, sessionId: r.sessionId, us: r.us, tool: r.tool, observed: r.kind === "write" }));
  const latest = textless[0];
  return {
    path: real,
    lines,
    calls,
    writes: rows.length,
    read: Math.min(rows.length, MAX_WRITES),
    textless: textless.length,
    latestTextless: latest ? { id: latest.toolUseId, tool: latest.tool } : null,
    session
  };
}
function writesTo(db, path, real, session) {
  const tails = [.../* @__PURE__ */ new Set([`/${basename6(real)}`, `/${basename6(path)}`])];
  const rows = db.all(
    `SELECT e.id AS eventId, e.session_id AS sessionId, e.tool_use_id AS toolUseId, e.tool_name AS tool,
            e.captured_us AS us, e.spool_name AS spool, e.cwd AS cwd, t.path AS path, t.kind AS kind
       FROM touches t JOIN events e ON e.id = t.event_id
      WHERE t.kind IN ('write', 'expected') AND e.tool_use_id IS NOT NULL AND e.session_id IS NOT NULL
        AND (t.path IN (?, ?) ${tails.map(() => "OR substr(t.path, -?) = ?").join(" ")})
        ${session ? "AND e.session_id = ?" : ""}
      ORDER BY e.captured_us DESC, e.spool_name DESC`,
    path,
    real,
    ...tails.flatMap((t) => [t.length, t]),
    ...session ? [session] : []
  );
  const reals = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  return rows.filter((r) => {
    if (seen.has(r.toolUseId)) return false;
    const rp = reals.get(r.path) ?? reals.set(r.path, realPath(r.path)).get(r.path);
    if (rp !== real) return false;
    seen.add(r.toolUseId);
    return true;
  });
}
function explainCalls(db, blame2, home, hashToken) {
  const graphs = /* @__PURE__ */ new Map();
  let explained = 0;
  for (const call of blame2.calls) {
    if (explained >= MAX_TRAILS) break;
    const graph = graphs.get(call.sessionId) ?? graphs.set(call.sessionId, loadGraph(db, call.sessionId, home, hashToken)).get(call.sessionId);
    const action = graph.actions.find((a) => a.id === call.id);
    if (!action) continue;
    call.action = action;
    call.graph = graph;
    call.explanation = explain(action.id, graph);
    explained++;
  }
}

// src/query/commit.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { resolve as resolve5 } from "node:path";
function findCommit(db, sha, cwd, repoKey) {
  const wanted = sha.toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(wanted)) throw new ContrailError(`"${sha}" is not a commit sha (7 to 40 hex characters).`);
  const rows = db.all(
    `SELECT session_id AS sessionId, tool_use_id AS toolUseId, cwd, payload FROM events
      WHERE hook_event = 'PostToolUse' AND tool_name = 'Bash' AND instr(payload, ?) > 0
      ORDER BY captured_us DESC`,
    wanted.slice(0, 7)
  );
  const info = cwd ? commitInfo(cwd, wanted) : null;
  for (const row of rows) {
    const p = JSON.parse(row.payload);
    const commit = parseCommitSha(str(p.tool_input, "command") ?? "", str(p.tool_response, "stdout") ?? toText(p.tool_response));
    if (!commit || !(wanted.startsWith(commit.sha) || commit.sha.startsWith(wanted))) continue;
    if (info && !ranAt(db, row.toolUseId, info.sec)) continue;
    return { sessionId: row.sessionId, toolUseId: row.toolUseId, cwd: row.cwd, commit, via: "stdout" };
  }
  if (info) {
    const { match, candidates } = commitByTime(info.sec, bashCallsBetween(db, info.sec * 1e6 - WINDOW_US, info.sec * 1e6 + WINDOW_US, repoKey));
    if (match) return { sessionId: match.sessionId, toolUseId: match.toolUseId, cwd: match.cwd, commit: info.commit, via: "time", commitSec: info.sec };
    if (candidates > 1) {
      throw new ContrailError(`${candidates} recorded git commits were running when git dated commit ${sha}, and git printed no commit line, so Contrail cannot tell which one made it.`);
    }
  }
  throw new ContrailError(`No recorded agent action made commit ${sha}. Contrail sees commits made by Claude Code through its shell tool.`);
}
function ranAt(db, toolUseId, sec) {
  const span = db.get(
    `SELECT MIN(captured_us) AS first, MAX(captured_us) AS last FROM events
      WHERE tool_use_id = ? AND hook_event IN ('PreToolUse', 'PostToolUse', 'PostToolUseFailure')`,
    toolUseId
  );
  if (!span?.first || !span.last) return false;
  return sec * 1e6 >= span.first - 1e6 && sec * 1e6 <= span.last + 1e6;
}
var WINDOW_US = 3600 * 1e6;
var MIGHT_COMMIT = `(command LIKE '%commit%' OR command LIKE '%merge%' OR command LIKE '%cherry-pick%' OR command LIKE '%revert%')`;
function bashCallsBetween(db, fromUs, toUs, repoKey, mightCommit = false) {
  const rows = db.all(
    `SELECT * FROM (
       SELECT session_id AS sessionId, tool_use_id AS toolUseId, cwd, hook_event AS hook, captured_us AS us,
              json_extract(payload, '$.tool_input.command') AS command
         FROM events
        WHERE tool_name = 'Bash' AND hook_event IN ('PreToolUse', 'PostToolUse', 'PostToolUseFailure')
          AND captured_us BETWEEN ? AND ? ${repoKey ? "AND repo_key = ?" : ""}
     ) ${mightCommit ? `WHERE ${MIGHT_COMMIT}` : ""}`,
    fromUs,
    toUs,
    ...repoKey ? [repoKey] : []
  );
  const byId = /* @__PURE__ */ new Map();
  for (const e of rows) {
    const c = byId.get(e.toolUseId) ?? { sessionId: e.sessionId, toolUseId: e.toolUseId, cwd: e.cwd, command: "", preUs: 0, postUs: 0 };
    if (e.hook === "PreToolUse") c.preUs = e.us;
    else c.postUs = e.us;
    c.command ||= e.command ?? "";
    byId.set(e.toolUseId, c);
  }
  return [...byId.values()].filter((c) => c.preUs && c.postUs);
}
function joinCommits(db, commits, repoKey, sinceSec) {
  const joins = /* @__PURE__ */ new Map();
  if (!commits.length) return joins;
  const fromUs = Math.min(sinceSec ?? Infinity, ...commits.map((c) => c.sec)) * 1e6 - WINDOW_US;
  const toUs = Math.max(...commits.map((c) => c.sec)) * 1e6 + WINDOW_US;
  const printed = db.all(
    `SELECT * FROM (
       SELECT session_id AS sessionId, tool_use_id AS toolUseId, json_extract(payload, '$.tool_input.command') AS command,
              payload, captured_us AS us
         FROM events
        WHERE hook_event = 'PostToolUse' AND tool_name = 'Bash' AND repo_key = ? AND captured_us BETWEEN ? AND ?
     ) WHERE ${MIGHT_COMMIT} ORDER BY us DESC`,
    repoKey,
    fromUs,
    toUs
  );
  const byPrefix = /* @__PURE__ */ new Map();
  for (const row of printed) {
    const p = JSON.parse(row.payload);
    const made = parseCommitSha(row.command ?? "", str(p.tool_response, "stdout") ?? toText(p.tool_response));
    if (!made) continue;
    const key = made.sha.slice(0, 7).toLowerCase();
    byPrefix.set(key, [...byPrefix.get(key) ?? [], { sha: made.sha.toLowerCase(), sessionId: row.sessionId, toolUseId: row.toolUseId }]);
  }
  let calls = null;
  for (const c of commits) {
    const sha = c.sha.toLowerCase();
    const hit = byPrefix.get(sha.slice(0, 7))?.find((h) => sha.startsWith(h.sha) && ranAt(db, h.toolUseId, c.sec));
    if (hit) {
      joins.set(c.sha, { kind: "joined", sessionId: hit.sessionId, toolUseId: hit.toolUseId, via: "stdout" });
      continue;
    }
    calls ??= bashCallsBetween(db, fromUs, toUs, repoKey, true);
    const { match, candidates } = commitByTime(c.sec, calls);
    joins.set(
      c.sha,
      match ? { kind: "joined", sessionId: match.sessionId, toolUseId: match.toolUseId, via: "time" } : candidates > 1 ? { kind: "ambiguous", candidates } : { kind: "none" }
    );
  }
  return joins;
}
function commitInfo(cwd, sha) {
  try {
    const run = (args) => execFileSync2("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const [full, sec, ...subject] = run(["show", "-s", "--format=%H%n%ct%n%s", `${sha}^{commit}`]).split("\n");
    if (!full || !sec) return null;
    const branch = run(["for-each-ref", "--contains", full, "--format=%(refname:short)", "refs/heads"]).split("\n")[0] || "(no branch)";
    return { commit: { branch, sha: full.slice(0, 7), subject: subject.join(" ") }, sec: Number(sec) };
  } catch {
    return null;
  }
}
function isCommit(cwd, text) {
  if (!/^[0-9a-f]{7,40}$/i.test(text)) return false;
  try {
    execFileSync2("git", ["-C", cwd, "rev-parse", "--verify", "--quiet", `${text}^{commit}`], { timeout: 5e3, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function commitFiles(cwd, sha) {
  try {
    const run = (args) => execFileSync2("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const top = run(["rev-parse", "--show-toplevel"]);
    return run(["show", "--name-only", "--format=", "--no-renames", sha]).split("\n").filter(Boolean).map((f) => resolve5(top, f));
  } catch {
    return null;
  }
}

// src/query/review.ts
import { execFileSync as execFileSync3 } from "node:child_process";
import { join as join5 } from "node:path";

// src/engine/review.ts
function branchFloor(mergeBaseSec, authorSecs) {
  return Math.min(mergeBaseSec, ...authorSecs);
}
function joinFileWrites(file, writes) {
  const until = file.uncommitted || file.lastCommitSec === null ? Infinity : (file.lastCommitSec + 1) * 1e6;
  const held = writes.filter((w) => w.us <= until).sort((a, b) => b.us - a.us);
  const grade = held.some((w) => !w.expected) ? "LIKELY" : held.length ? "POSSIBLE" : "UNKNOWN";
  return { grade, writes: held };
}
function externalTrails(e, g) {
  const inputs = new Map(g.inputs.map((i) => [i.id, i]));
  const out = [];
  for (const top of bestPerGroup(e.traces)) {
    const steps = [];
    for (let t = top; t; t = t.upstream?.trace) {
      const found = t.links.filter((l) => l.grade !== "UNKNOWN" && l.to && inputs.has(l.to));
      const best = found.find((l) => l.grade === "LIKELY") ?? found.find((l) => l.firstSeen);
      if (!best) break;
      const input = inputs.get(best.to);
      steps.push({ link: best, input });
      if (input.trust !== "external") continue;
      const sameLine = out.some((x) => x.steps.at(-1).input.id === input.id && x.steps.at(-1).link.quote?.line === best.quote?.line);
      if (!sameLine || top.token.role !== "hint") out.push({ token: top.token, steps });
      break;
    }
  }
  return out;
}

// src/query/review.ts
var LIMITS = { commits: 500, files: 1e3, sessions: 30, writersPerFile: 3, explained: 300, touches: 5e4 };
var DEFAULT_BASES = ["origin/HEAD", "origin/main", "origin/master", "main", "master"];
var GIT_BUFFER_MB = 32;
function gitIn(cwd) {
  return (args) => {
    try {
      return execFileSync3("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        timeout: 15e3,
        maxBuffer: GIT_BUFFER_MB * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }
      });
    } catch (e) {
      const code = e.code;
      if (code === "ENOENT") throw new ContrailError("git is not installed or not on PATH; contrail review reads the branch from git.");
      if (code === "ENOBUFS") throw new ContrailError(`git's output for this range is larger than the ${GIT_BUFFER_MB} MB Contrail reads. Name a closer base: contrail review <base>.`);
      if (code === "ETIMEDOUT") throw new ContrailError("git did not answer within 15 seconds.");
      return null;
    }
  };
}
var zList = (out) => (out ?? "").split("\0").filter(Boolean);
var REVISION = /^[^\s\x00-\x1f\x7f-][^\s\x00-\x1f\x7f]{0,255}$/;
function branchRange(cwd, base) {
  const top = gitIn(cwd)(["rev-parse", "--show-toplevel"])?.trim();
  if (!top) throw new ContrailError(`${clip(cwd, 200)} is not inside a git repository. contrail review lists the changes on the current branch, so run it inside one.`);
  const git = gitIn(top);
  const head = git(["rev-parse", "--verify", "-q", "HEAD^{commit}"])?.trim();
  if (!head) throw new ContrailError("This repository has no commits yet, so there is no branch to review.");
  const branch = git(["symbolic-ref", "-q", "--short", "HEAD"])?.trim() || null;
  const resolve8 = (rev) => git(["rev-parse", "--verify", "-q", `${rev}^{commit}`])?.trim() || null;
  let name;
  let baseSha;
  if (base !== void 0) {
    if (!REVISION.test(base)) throw new ContrailError(`"${clip(base, 80)}" is not a revision contrail review accepts. Name a branch, tag or commit, for example origin/main.`);
    name = base;
    baseSha = resolve8(base);
    if (!baseSha) throw new ContrailError(`Unknown base "${clip(base, 80)}": git has no commit by that name here. Name a branch, tag or commit, for example origin/main.`);
  } else {
    const found = DEFAULT_BASES.map((rev) => ({ rev, sha: resolve8(rev) })).find((c) => c.sha);
    if (!found) throw new ContrailError(`No base to compare with: none of ${DEFAULT_BASES.join(", ")} exists here. Name one: contrail review <base>.`);
    name = found.rev === "origin/HEAD" ? git(["rev-parse", "--abbrev-ref", "origin/HEAD"])?.trim() || found.rev : found.rev;
    baseSha = found.sha;
  }
  const mergeBase = git(["merge-base", baseSha, head])?.trim();
  if (!mergeBase) throw new ContrailError(`${clip(name, 80)} and HEAD share no history, so there is no range between them to review.`);
  const mergeBaseSec = Number(git(["show", "-s", "--format=%ct", mergeBase])?.trim() ?? 0);
  const range = `${mergeBase}..${head}`;
  const totalCommits = Number(git(["rev-list", "--count", range])?.trim() ?? 0);
  const commits = [];
  const meta = (git(["log", "-z", `--max-count=${LIMITS.commits}`, "--format=%H%x00%ct%x00%at%x00%P%x00%s", range]) ?? "").split("\0");
  for (let i = 0; i + 5 <= meta.length; i += 5) {
    const [sha, sec, authorSec, parents, subject] = meta.slice(i, i + 5);
    commits.push({ sha, sec: Number(sec), authorSec: Number(authorSec), merge: parents.split(" ").length > 1, subject, files: [] });
  }
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  let current;
  for (const raw of (git(["log", "-z", "--no-renames", "--name-only", `--max-count=${LIMITS.commits}`, "--format=%x01%H", range]) ?? "").split("\0")) {
    const part = raw.replace(/^\n/, "");
    if (part.startsWith("")) current = bySha.get(part.slice(1));
    else if (part && current) current.files.push(part);
  }
  const committed = zList(git(["diff", "-z", "--no-renames", "--name-only", mergeBase, head]));
  const dirty = /* @__PURE__ */ new Set([...zList(git(["diff", "-z", "--no-renames", "--name-only", "HEAD"])), ...zList(git(["ls-files", "-z", "--others", "--exclude-standard"]))]);
  const all = [.../* @__PURE__ */ new Set([...committed, ...dirty])].sort();
  const commitsOf = /* @__PURE__ */ new Map();
  for (const c of commits) for (const f of c.files) commitsOf.set(f, [...commitsOf.get(f) ?? [], c.sha]);
  const files = all.slice(0, LIMITS.files).map((path) => ({ path, commits: commitsOf.get(path) ?? [], uncommitted: dirty.has(path) }));
  return { top, head, branch, base: { name, given: base !== void 0, tried: base !== void 0 ? [base] : DEFAULT_BASES, mergeBase, mergeBaseSec }, commits, totalCommits, files, totalFiles: all.length };
}
function reviewBranch(db, o) {
  const range = branchRange(o.cwd, o.base);
  const floorSec = branchFloor(range.base.mergeBaseSec, range.commits.map((c) => c.authorSec));
  const joins = joinCommits(db, range.commits, o.repoKey, floorSec);
  const top = realPath(range.top);
  const wanted = new Map(range.files.map((f) => [join5(top, f.path), f.path]));
  const writesTo2 = /* @__PURE__ */ new Map();
  const real = /* @__PURE__ */ new Map();
  for (const t of recordedWrites(db, floorSec * 1e6, o.repoKey)) {
    const path = wanted.get(real.get(t.path) ?? real.set(t.path, realPath(t.path)).get(t.path));
    if (!path) continue;
    writesTo2.set(path, [...writesTo2.get(path) ?? [], { sessionId: t.sessionId, actionId: t.toolUseId, us: t.us, expected: t.kind === "expected" }]);
  }
  const secOf = new Map(range.commits.map((c) => [c.sha, c.sec]));
  const headSec = range.commits[0]?.sec ?? null;
  const joined = range.files.map((f) => {
    const lastCommitSec = f.commits.length ? secOf.get(f.commits[0]) : headSec;
    return { file: f, ...joinFileWrites({ lastCommitSec, uncommitted: f.uncommitted }, writesTo2.get(f.path) ?? []) };
  });
  const latest = /* @__PURE__ */ new Map();
  const seen = (id, us) => latest.set(id, Math.max(latest.get(id) ?? 0, us));
  for (const j of joined) for (const w of j.writes) seen(w.sessionId, w.us);
  for (const c of range.commits) {
    const join8 = joins.get(c.sha);
    if (join8?.kind === "joined") seen(join8.sessionId, c.sec * 1e6);
  }
  const ids = [...latest.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const graphs = new Map(ids.slice(0, LIMITS.sessions).map((id) => [id, loadGraph(db, id, o.home, o.hashToken)]));
  const explained = /* @__PURE__ */ new Map();
  let budget = LIMITS.explained;
  let unexplained = 0;
  const explainOnce = (sessionId, actionId, capped = true) => {
    const g = graphs.get(sessionId);
    const action = g?.actions.find((a) => a.id === actionId) ?? null;
    if (!g || !action) return { action, explanation: null };
    const key = `${sessionId}\0${actionId}`;
    let e = explained.get(key);
    if (!e && capped && budget <= 0) {
      unexplained++;
      return { action, explanation: null };
    }
    if (!e) {
      e = explain(actionId, g);
      explained.set(key, e);
      if (capped) budget--;
    }
    return { action, explanation: e };
  };
  const files = joined.map(({ file, grade, writes }) => {
    const calls2 = [...new Map(writes.map((w) => [`${w.sessionId}\0${w.actionId}`, w])).values()];
    const firstPerSession = calls2.filter((w, i) => calls2.findIndex((x) => x.sessionId === w.sessionId) === i);
    const picked = [.../* @__PURE__ */ new Set([...firstPerSession, ...calls2])].slice(0, LIMITS.writersPerFile);
    const writers = picked.map((w) => ({ ...w, ...explainOnce(w.sessionId, w.actionId) }));
    return { ...file, grade, writers, moreWriters: calls2.length - picked.length };
  });
  const commits = range.commits.map((c) => {
    const join8 = joins.get(c.sha) ?? { kind: "none" };
    const found = join8.kind === "joined" ? explainOnce(join8.sessionId, join8.toolUseId) : { action: null, explanation: null };
    return { ...c, join: join8, ...found };
  });
  const external = [];
  const calls = [
    ...files.flatMap((f) => f.writers.map((w) => ({ sessionId: w.sessionId, e: w.explanation }))),
    ...commits.map((c) => ({ sessionId: c.join.kind === "joined" ? c.join.sessionId : "", e: c.explanation }))
  ];
  const done = /* @__PURE__ */ new Set();
  for (const { sessionId, e } of calls) {
    if (!e || done.has(`${sessionId}\0${e.action.id}`)) continue;
    done.add(`${sessionId}\0${e.action.id}`);
    const wrote = files.filter((f) => f.writers.some((w) => w.actionId === e.action.id && w.sessionId === sessionId)).map((f) => f.path);
    for (const trail of externalTrails(e, graphs.get(sessionId))) external.push({ sessionId, action: e.action, files: wrote, trail });
  }
  const findings = [];
  let actionsScanned = 0;
  for (const [id, g] of graphs) {
    actionsScanned += g.actions.length;
    findings.push(...findingsFor(g, (actionId) => explainOnce(id, actionId, false).explanation));
  }
  const notNamed = files.filter((f) => {
    const verdicts = f.writers.flatMap((w) => w.explanation ? [w.explanation.requested.verdict] : []);
    return verdicts.length > 0 && !verdicts.includes("NAMED");
  });
  return {
    range,
    floorSec,
    commits,
    files,
    graphs,
    sessionsOmitted: ids.length - graphs.size,
    external,
    findings: rankFindings(findings),
    actionsScanned,
    notNamed,
    unexplained
  };
}
function recordedWrites(db, sinceUs, repoKey) {
  return db.all(
    `SELECT t.path AS path, t.kind AS kind, e.session_id AS sessionId, e.tool_use_id AS toolUseId, e.captured_us AS us
       FROM touches t JOIN events e ON e.id = t.event_id
      WHERE t.kind IN ('write', 'expected') AND e.tool_use_id IS NOT NULL
        AND e.session_id IN (SELECT DISTINCT session_id FROM events WHERE repo_key = ? AND captured_us >= ?)
      ORDER BY e.captured_us DESC
      LIMIT ?`,
    repoKey,
    sinceUs,
    LIMITS.touches
  );
}

// src/query/target.ts
import { existsSync as existsSync2, realpathSync as realpathSync3 } from "node:fs";
import { resolve as resolve6 } from "node:path";
var SHORT_CALL = /^([A-Za-z0-9_-]{1,40})(?:…|\.\.\.)([A-Za-z0-9_-]{1,40})$/;
var FULL_CALL = /^toolu_[A-Za-z0-9_-]{8,200}$/;
var LINE_SUFFIX = /^(\S{1,4096}):(\d{1,9})(?:-(\d{1,9}))?$/;
var PATH_LIKE = /\/|\.[A-Za-z0-9]{1,8}$/;
function parseTarget(args, cwd) {
  const text = unquote(args.join(" ").trim());
  if (!text || text === "last") return { kind: "last" };
  const abs = resolve6(cwd, text);
  const short2 = SHORT_CALL.exec(text);
  if (short2 && !existsSync2(abs)) return { kind: "call", prefix: short2[1], suffix: short2[2], shown: text };
  if (FULL_CALL.test(text) && !existsSync2(abs)) return { kind: "call", prefix: text, suffix: "", shown: text };
  if (/^[a-z][a-z0-9+.-]{0,20}:\/\//i.test(text)) return { kind: "command", text };
  const line = LINE_SUFFIX.exec(text);
  if (line && !existsSync2(abs) && (existsSync2(resolve6(cwd, line[1])) || PATH_LIKE.test(line[1]))) {
    const start = Number(line[2]);
    const end = line[3] ? Number(line[3]) : start;
    if (start < 1 || end < start) throw new ContrailError(`"${text}" is not a line range: lines start at 1, and a range runs low to high.`);
    return { kind: "line", path: resolve6(cwd, line[1]), shown: line[1], start, end };
  }
  if (!/\s/.test(text) && (existsSync2(abs) || PATH_LIKE.test(text))) return { kind: "path", path: abs, shown: text };
  return { kind: "command", text };
}
function unquote(s) {
  const m = /^(["'])(.*)\1$/s.exec(s);
  return m ? m[2].trim() : s;
}
var WRITE_OR_EXTERNAL = `(tool_name IN ('Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Bash', 'WebFetch') OR tool_name LIKE 'mcp%')`;
var COMMAND = `COALESCE(json_extract(payload, '$.tool_input.command'), '')`;
var NOT_CONTRAIL = `NOT (${COMMAND} LIKE '%bin/contrail%' OR ${COMMAND} LIKE 'contrail %')`;
function findTarget(db, target, repoKey) {
  let rows;
  if (target.kind === "path") {
    const real = existsSync2(target.path) ? realpathSync3(target.path) : target.path;
    rows = db.all(
      `SELECT e.session_id AS sessionId, e.tool_use_id AS toolUseId
         FROM touches t JOIN events e ON e.id = t.event_id
        WHERE t.kind IN ('write', 'expected') AND t.path IN (?, ?) AND e.tool_use_id IS NOT NULL
        ORDER BY e.captured_us DESC, e.spool_name DESC`,
      target.path,
      real
    );
    if (!rows.length) {
      throw new ContrailError(`No recorded agent change to ${target.shown}. Contrail only sees sessions recorded since it was installed.`);
    }
  } else if (target.kind === "command") {
    rows = db.all(
      `SELECT session_id AS sessionId, tool_use_id AS toolUseId FROM events
        WHERE hook_event = 'PreToolUse' AND tool_name = 'Bash'
          AND instr(${COMMAND}, ?) > 0 AND ${NOT_CONTRAIL}
        ORDER BY captured_us DESC, spool_name DESC`,
      target.text
    );
    if (!rows.length) throw new ContrailError(`No recorded shell command contains "${target.text}".`);
  } else if (target.kind === "call") {
    rows = db.all(
      `SELECT session_id AS sessionId, tool_use_id AS toolUseId FROM events
        WHERE hook_event = 'PreToolUse' AND substr(tool_use_id, 1, ?) = ? AND length(tool_use_id) >= ?
          AND (? = '' OR substr(tool_use_id, -?) = ?)
        ORDER BY captured_us DESC, spool_name DESC`,
      target.prefix.length,
      target.prefix,
      target.prefix.length + target.suffix.length,
      target.suffix,
      target.suffix.length,
      target.suffix
    );
    if (!rows.length) throw new ContrailError(`No recorded tool call ${target.shown}.`);
  } else {
    rows = db.all(
      `SELECT session_id AS sessionId, tool_use_id AS toolUseId FROM events
        WHERE hook_event = 'PreToolUse' AND repo_key = ? AND ${WRITE_OR_EXTERNAL} AND ${NOT_CONTRAIL}
        ORDER BY captured_us DESC, spool_name DESC LIMIT 1`,
      repoKey
    );
    if (!rows.length) {
      throw new ContrailError(
        "No recorded edit, command or commit in this repository yet. Contrail records from the moment the plugin is enabled: use Claude Code here, then try again."
      );
    }
  }
  return { ...rows[0], total: rows.length };
}

// src/render/style.ts
var sgr = (code) => (s) => s ? `\x1B[${code}m${s}\x1B[0m` : s;
var GRADE_COLOR = {
  DIRECT: sgr("1;32"),
  LIKELY: sgr("1;36"),
  POSSIBLE: sgr("33"),
  UNKNOWN: sgr("90")
};
var pad = (g, width) => " ".repeat(Math.max(1, width - g.length));
var PLAIN = {
  on: false,
  grade: (g, width = 9) => g + pad(g, width),
  bold: (s) => s,
  dim: (s) => s,
  flag: (s) => s,
  accent: (s) => s
};
var COLOR = {
  on: true,
  grade: (g, width = 9) => (GRADE_COLOR[g]?.(g) ?? g) + pad(g, width),
  bold: sgr("1"),
  dim: sgr("2"),
  flag: sgr("1;35"),
  accent: sgr("1;36")
};
function styleFor(env, isTTY) {
  if (env.NO_COLOR) return PLAIN;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return COLOR;
  return isTTY ? COLOR : PLAIN;
}

// src/render/why.ts
var HEADING = "Where the values came from (data provenance, not the agent's reasons)";
var FOOTER = [
  `LIKELY means "this value first appeared in the agent's context from this source", not "this source made the agent act".`,
  "Not observable: the agent's reasons for this action."
];
function renderWhy(e, g, note, s = PLAIN) {
  const out = [];
  const a = e.action;
  const inputs = new Map(g.inputs.map((i) => [i.id, i]));
  const prompt = g.prompts.find((p) => p.promptId === a.promptId);
  out.push(`${s.bold(clip(a.tool, 60))}  ${s.bold(describe(a, g))}`);
  out.push(
    s.dim(
      `  session ${a.scope.sessionId.slice(0, 8)} \xB7 ${prompt ? `turn ${prompt.label}` : "turn not recorded"} \xB7 ${callId(a.id)} \xB7 seq ${a.preSeq} \xB7 ${a.scope.agentId ? `subagent ${callId(a.scope.agentId)}` : "main agent"}` + (a.status === "ok" ? "" : a.status === "pending" ? " \xB7 no result recorded (denied, stopped, or still running)" : ` \xB7 ${a.status.toUpperCase()}`)
    )
  );
  if (note) out.push(s.dim(`  ${note}`));
  out.push("");
  const best = bestPerGroup(e.traces);
  const credited = new Set(best.filter((t) => t.token.role !== "hint").flatMap((t) => t.links.filter((l) => l.grade !== "UNKNOWN").map((l) => l.to)));
  const shown = best.filter((t) => t.token.role !== "hint" || t.links.some((l) => l.grade !== "UNKNOWN" && !credited.has(l.to)));
  const found = shown.filter((t) => t.links.some((l) => l.grade !== "UNKNOWN"));
  const unfound = shown.filter((t) => !found.includes(t));
  out.push(...inShort(e, found, unfound, inputs, s), "");
  out.push(...requestedLines(e, s));
  out.push(
    !prompt ? `Turn        ${s.grade("UNKNOWN")}no prompt was recorded for this action` : prompt.from === "task" ? `Turn        ${s.grade("DIRECT")}ran while handling ${prompt.label}, a background task report, not your words: "${clip(prompt.text, 60)}"  ${s.dim("[R1]")}` : `Turn        ${s.grade("DIRECT")}ran while answering ${prompt.label}: "${clip(prompt.text, 70)}"  ${s.dim("[R1]")}`
  );
  out.push("", s.bold(HEADING));
  for (const t of found) trace(t, 1, out, inputs, s);
  if (unfound.length) {
    out.push(`  ${s.grade("UNKNOWN")}no observed source for: ${unfound.map((t) => clip(t.token.text, 80)).join(", ")}  ${s.dim("[R4]")}`);
  }
  if (!e.traces.length) out.push(s.dim("  nothing distinctive in this action to trace"));
  const searched = e.traces[0]?.searched;
  if (searched) {
    out.push(s.dim(`  (searched ${searched.count} input${searched.count === 1 ? "" : "s"} in this agent's context before seq ${searched.beforeSeq})`));
  }
  out.push("");
  const effects = e.effects.map((l) => ({ l, fx: g.effects.find((x) => x.id === l.to) })).filter((x) => !!x.fx);
  if (effects.length) {
    out.push(s.bold("Effects"));
    const target = (fx) => clip(fx.target, 100);
    const width = Math.max(...effects.map((x) => target(x.fx).length));
    for (const { l, fx } of effects) {
      out.push(`  ${s.grade(l.grade)}${target(fx).padEnd(width)}  ${effectWording(fx)}  ${s.dim(`[${l.rule} ${clip(fx.evidence, 40)}]`)}`);
      for (const line of fx.patch.slice(0, 6)) out.push(s.dim(`      ${clip(line, 100)}`));
    }
    out.push("");
  }
  out.push(`${s.bold("Weakest link on this trail:")} ${s.grade(e.chainGrade, 0).trim()}`);
  for (const line of FOOTER) out.push(s.dim(line));
  const said = a.scope.agentId ? g.agentSaid.byAgent[a.scope.agentId] : a.promptId ? g.agentSaid.byPrompt[a.promptId] : void 0;
  if (said) out.push(s.dim(`Agent said (shown for context, never used as evidence): "${clip(said, 220)}"`));
  out.push(s.dim(`Blind spots: ${e.blindSpots.join("; ")}. No observed source is not the same as no source.`));
  return `${out.join("\n")}
`;
}
function inShort(e, found, unfound, inputs, s) {
  const groups = /* @__PURE__ */ new Map();
  for (const t of found) {
    const chain = [];
    let cur = t;
    let next;
    while (cur) {
      const link = cur.links.find((l) => l.grade === "LIKELY") ?? cur.links.find((l) => l.firstSeen) ?? cur.links.find((l) => l.grade !== "UNKNOWN");
      const src = link?.to ? inputs.get(link.to) : void 0;
      if (!link || !src) break;
      chain.push({ link, src, value: cur.token.text });
      if (!cur.upstream && cur.truncated) next = cur.truncated.next;
      cur = cur.upstream?.trace;
    }
    if (!chain.length) continue;
    const key = chain.map((c) => `${c.src.id}:${c.link.quote?.line ?? ""}`).join(">");
    const group = groups.get(key) ?? { values: [], chain, next };
    group.values.push(clip(t.token.text, 60));
    groups.set(key, group);
  }
  const external = [...groups.values()].some((g) => g.chain.some((c) => c.src.trust === "external"));
  const facts = [
    ASKED[e.requested.verdict](s),
    ...sensitivity(e.action).map((k) => s.flag(k)),
    ...external ? [s.flag("values from external content")] : []
  ];
  const out = [s.bold("In short"), `  ${facts.join(s.dim(" \xB7 "))}`];
  const listed = [...groups.values()].slice(0, 3);
  for (const g of listed) {
    out.push(`  ${s.accent(clip(g.values.join(", "), 110))}`);
    g.chain.forEach(({ link, src, value }, i) => {
      const where2 = link.quote?.line != null ? `${clip(src.label, 90)}:${link.quote.line}` : clip(src.label, 90);
      const trust2 = src.trust === "external" ? s.flag(`(${src.trust})`) : s.dim(`(${src.trust})`);
      const via = i > 0 && value !== g.chain[i - 1].value ? s.dim(`  for ${clip(value, 60)}`) : "";
      out.push(`    ${s.dim("\u2190")} ${s.grade(link.grade)}${where2}  ${trust2}${via}`);
    });
    if (g.next !== void 0) out.push(`    ${s.dim(`\u2190 \u2026 further back${g.next ? `: contrail why ${callId(g.next)}` : ""}`)}`);
  }
  if (groups.size > listed.length) out.push(s.dim(`  (${groups.size - listed.length} more below)`));
  if (unfound.length) out.push(`  ${s.dim("no observed source for:")} ${clip(unfound.map((t) => t.token.text).join(", "), 100)}`);
  if (!found.length && !unfound.length) out.push(s.dim("  nothing distinctive in this action to trace"));
  return out;
}
var ASKED = {
  NAMED: () => "named in your words",
  NAMED_NEGATED: (s) => s.flag("named, but your latest mention is negated"),
  PARTLY_NAMED: () => "partly named in your words",
  NOT_NAMED: (s) => s.flag("not named in your words"),
  NOTHING_TO_MATCH: () => "nothing in it to match against your words"
};
function trace(t, depth, out, inputs, s) {
  const pad3 = "  ".repeat(depth);
  const firstUse2 = t.firstUse ? `, first used in ${callId(t.firstUse.actionId)} at seq ${t.firstUse.preSeq}` : "";
  out.push(`${pad3}${s.accent(clip(t.token.text, 80))}  ${s.dim(`(${t.token.argPath}${firstUse2})`)}`);
  for (const l of t.links) {
    if (!l.to) {
      out.push(`${pad3}  ${s.grade(l.grade)}${l.note}  ${s.dim(`[${l.rule}]`)}`);
      continue;
    }
    const src = inputs.get(l.to);
    if (!src) continue;
    const where2 = l.quote?.line != null ? `${clip(src.label, 100)}:${l.quote.line}` : clip(src.label, 100);
    out.push(`${pad3}  ${s.grade(l.grade)}${sourceWording(l, where2)}  ${s.dim(`[${l.rule}]`)}`);
    if (l.quote?.text) out.push(`${pad3}           ${s.dim(l.quote.line != null ? `${l.quote.line}\u2502` : "\u2502")} ${clip(l.quote.text, 100)}`);
    else if (l.quote && src.hashed) out.push(`${pad3}           ${s.dim(`${l.quote.line ?? ""}\u2502 (text not stored)`)}`);
    const origin = originWording(src);
    out.push(`${pad3}           ${src.trust === "external" ? s.flag(origin) : s.dim(origin)}${s.dim(src.producedBy ? ` \xB7 returned by ${callId(src.producedBy)} (seq ${src.availableAt})` : "")}`);
  }
  if (t.links.every((l) => l.grade === "UNKNOWN") && depth > 1) out.push(s.dim(`${pad3}  the trail starts here: the reason is not observable`));
  if (t.upstream) {
    const u = t.upstream;
    const heading = u.kind === "call" ? `how the agent came to call ${u.via?.tool} ${callId(u.via?.id ?? "")}:` : u.kind === "conduit" ? `that text was written by the agent (${u.via?.tool} ${callId(u.via?.id ?? "")}); following the same value back:` : "a compaction summary is agent-written; the same value before the compaction:";
    out.push(s.dim(`${pad3}  ${heading}`));
    trace(u.trace, depth + 2, out, inputs, s);
  }
  if (t.truncated) {
    const next = t.truncated.next ? `; contrail why ${callId(t.truncated.next)} picks it up from there` : "";
    out.push(s.dim(`${pad3}  the trail goes further back, past the ${MAX_DEPTH}-step limit of one report${next}`));
  }
}
function sourceWording(l, where2) {
  if (l.note === "you supplied it") return `you supplied it: ${where2}`;
  if (l.note === "also in") return `also in ${where2}`;
  if (l.grade === "LIKELY") return `only observed in ${where2}`;
  if (l.firstSeen) return `could be from ${where2} (seen first)`;
  if (l.note) return `${where2} (${l.note})`;
  return `could be from ${where2}`;
}
var ORIGIN_WORDING = {
  prompt: "your words",
  template: "slash-command template",
  instructions: "instructions file",
  file: "repo file",
  dependency_file: "dependency file, written by a third party",
  search: "search output",
  shell: "shell output",
  web: "web page, as a model's extraction of it, not the page itself",
  web_search: "web search results",
  mcp: "MCP server result",
  skill: "skill",
  subagent_prompt: "agent-written instructions to a subagent",
  subagent_result: "agent-written subagent report",
  compaction: "agent-written compaction summary",
  tool_output: "tool output"
};
function originWording(i) {
  if (i.origin === "instructions") {
    return i.trust === "local" ? "repo instructions (repo content, not you)" : "your instructions (user-level)";
  }
  return `${ORIGIN_WORDING[i.origin]} (${i.trust})`;
}
function requestedLines(e, s) {
  const r = e.requested;
  const quoted = r.sentence ? `"${clip(r.sentence.text, 80)}"` : "";
  const tag3 = (t) => s.dim(`[${t}]`);
  switch (r.verdict) {
    case "NAMED":
      return [
        `Requested?  ${s.bold("NAMED")}  ${quoted}  ${tag3(`R8 ${r.grade}`)}`,
        s.dim('            "Named" means your words contain it. It is not a judgment of intent or permission.')
      ];
    case "NAMED_NEGATED":
      return [`Requested?  ${s.flag("NAMED, BUT YOUR LATEST MENTION IS NEGATED:")} ${quoted}  ${tag3(`R8 ${r.grade}`)}`];
    case "PARTLY_NAMED":
      return [`Requested?  ${s.bold("PARTLY NAMED")}  ${quoted} names ${clip(r.matched ?? "", 80)}, not everything this action targets  ${tag3(`R8 ${r.grade}`)}`];
    case "NOT_NAMED": {
      const yours = r.searched === 1 ? "Your 1 sentence this session does not" : `None of your ${r.searched} sentences this session`;
      return [`Requested?  ${s.flag("NOT NAMED")}. ${yours} name it.  ${tag3("R8")}`];
    }
    case "NOTHING_TO_MATCH":
      return [`Requested?  nothing specific in this action to match against your words  ${tag3("R8")}`];
  }
}
function describe(a, g) {
  const path = str(a.input, "file_path") ?? str(a.input, "notebook_path");
  if (path) return clip(displayPath(path, g.env.cwd, g.env.home), 120);
  if (a.tool === "Bash") return clip(str(a.input, "command") ?? "", 90);
  if (a.tool === "WebFetch") return clip(str(a.input, "url") ?? "", 90);
  if (a.tool === "Agent" || a.tool === "Task") return clip(str(a.input, "description") ?? str(a.input, "prompt") ?? "", 90);
  if (a.tool === "Grep" || a.tool === "Glob") {
    const where2 = str(a.input, "path");
    return clip(`${JSON.stringify(str(a.input, "pattern") ?? "")}${where2 ? ` in ${displayPath(where2, g.env.cwd, g.env.home)}` : ""}`, 90);
  }
  if (a.tool === "WebSearch") return clip(JSON.stringify(str(a.input, "query") ?? ""), 90);
  if (a.tool === "Skill") return clip(str(a.input, "skill") ?? "", 90);
  if (a.tool.startsWith("mcp__")) return clip(`${a.tool.slice(5).replace("__", "/")} ${JSON.stringify(a.input)}`, 90);
  return clip(JSON.stringify(a.input), 90);
}
function effectWording(fx) {
  if (fx.evidence === "filePath") return "written by this call";
  if (fx.evidence === "bashEditDiff") return "changed while this command ran";
  if (fx.evidence === "commit_stdout") return "commit made by this command";
  if (fx.evidence === "expected") return fx.kind === "network" ? "the command names this host; the request itself was not observed" : "expected for this kind of command, not observed";
  return "request made and answered";
}

// src/render/session.ts
var KIND = {
  Read: "READ",
  Grep: "SEARCH",
  Glob: "SEARCH",
  LS: "SEARCH",
  Edit: "EDIT",
  MultiEdit: "EDIT",
  Write: "WRITE",
  NotebookEdit: "EDIT",
  Bash: "SHELL",
  WebFetch: "WEB",
  WebSearch: "WEB",
  Agent: "AGENT",
  Task: "AGENT",
  Skill: "SKILL"
};
var kindOf = (a) => a.tool.startsWith("mcp__") ? "MCP" : KIND[a.tool] ?? "TOOL";
var summary = (a, g) => kindOf(a) === "TOOL" ? `${a.tool} ${describe(a, g)}` : describe(a, g);
var EXPLAINED = /* @__PURE__ */ new Set(["EDIT", "WRITE", "SHELL", "WEB", "MCP", "AGENT"]);
function matchesFilter(a, g, filter) {
  if (!filter) return true;
  const kind = kindOf(a);
  if (filter === "writes") return g.effects.some((e) => e.actionId === a.id && e.kind === "file");
  if (filter === "shell") return kind === "SHELL";
  if (filter === "network") return kind === "WEB" || kind === "MCP" || g.effects.some((e) => e.actionId === a.id && e.kind === "network");
  if (filter === "mcp") return kind === "MCP";
  if (filter === "subagents") return kind === "AGENT" || a.scope.agentId !== null;
  return false;
}
function renderTrace(g, explanations, filter, s = PLAIN) {
  const out = [];
  const sessionId = g.sessionId;
  const inputs = new Map(g.inputs.map((i) => [i.id, i]));
  out.push(`${s.bold("Session")} ${sessionId.slice(0, 8)}  ${s.dim(clip(g.env.cwd, 120))}`);
  out.push(
    s.dim(
      `${counted(g.prompts.length, "turn")} \xB7 ${counted(g.actions.length, "tool call")} \xB7 ${counted(g.effects.filter((e) => e.kind === "file").length, "file effect")}` + (filter ? ` \xB7 showing --${filter}` : "")
    )
  );
  const items = [];
  if (!filter) {
    for (const p of g.prompts) {
      const head = p.from === "task" ? `${s.dim("background task report, not your words:")} "${clip(p.text, 80)}"` : s.bold(`"${clip(p.text, 100)}"`);
      items.push({ seq: p.seq, line: () => ["", `${s.bold(p.label)}  ${head}`] });
    }
  }
  if (!filter || filter === "instructions") {
    for (const i of g.inputs.filter((x) => x.origin === "instructions")) {
      items.push({ seq: i.availableAt, line: () => [`  ${s.dim(pad2(`${i.availableAt}`, 4))} ${pad2("LOADED", 7)} ${clip(i.label, 100)}  ${s.dim(originWording(i))}`] });
    }
  }
  if (!filter) {
    for (const i of g.inputs.filter((x) => x.origin === "compaction")) {
      items.push({ seq: i.availableAt, line: () => [`  ${s.dim(pad2(`${i.availableAt}`, 4))} ${s.dim("COMPACTED  earlier context now visible only through the summary")}`] });
    }
  }
  for (const a of g.actions) {
    if (filter === "instructions" || !matchesFilter(a, g, filter)) continue;
    items.push({ seq: a.preSeq, line: () => actionLines(a, g, explanations.get(a.id), inputs, s) });
  }
  items.sort((a, b) => a.seq - b.seq);
  for (const item of items) out.push(...item.line());
  if (!items.length) out.push("", s.dim("  nothing matches this filter"));
  out.push("", s.dim(`Run ${s.bold('contrail why <path | "command">')} for the full trail behind any line.`));
  return `${out.join("\n")}
`;
}
function actionLines(a, g, e, inputs, s) {
  const kind = kindOf(a);
  const who = a.scope.agentId ? s.dim(` [subagent ${callId(a.scope.agentId)}]`) : "";
  const failed = a.status === "failed" || a.status === "interrupted" ? s.flag(` ${a.status.toUpperCase()}`) : "";
  const lines = [`  ${s.dim(pad2(`${a.preSeq}`, 4))} ${pad2(kind, 7)} ${summary(a, g)}${who}${failed}`];
  if (!e) return lines;
  const detail = trailDetail(e, inputs, s);
  if (detail) lines.push(`         ${s.dim("\u21B3")} ${detail}`);
  const effects = g.effects.filter((x) => x.actionId === a.id && x.kind !== "network");
  if (effects.length && kind === "SHELL") {
    const shown = effects.slice(0, 4).map((x) => clip(x.target, 80)).join(", ") + (effects.length > 4 ? `, +${effects.length - 4} more` : "");
    const how = effects.every((x) => x.evidence === "expected") ? s.dim(" (expected, not observed)") : "";
    lines.push(`         ${s.dim("\u2192")} ${shown}${how}`);
  }
  return lines;
}
function trailDetail(e, inputs, s) {
  const head = headlineTrace(e);
  const from = head ? traceSource(head, inputs, s) : "";
  const found = from || (e.traces.length ? `${s.grade("UNKNOWN", 0).trim()} ${s.dim("no observed source")}` : "");
  const asked = e.requested.verdict === "NAMED" ? s.dim("named by you") : e.requested.verdict === "NOT_NAMED" ? s.flag("not named by you") : "";
  return [found, asked].filter(Boolean).join("   ");
}
function traceSource(t, inputs, s) {
  const link = t.links.find((l) => l.grade !== "UNKNOWN");
  const src = link?.to ? inputs.get(link.to) : void 0;
  if (!src || !link) return "";
  const trust2 = src.trust === "external" ? s.flag(`(${src.trust})`) : s.dim(`(${src.trust})`);
  return `${s.grade(link.grade, 0).trim()} ${clip(t.token.text, 80)} \u2190 ${clip(src.label, 100)}${link.quote?.line != null ? `:${link.quote.line}` : ""} ${trust2}`;
}
function renderTree(g, forest, omitted, s = PLAIN) {
  const out = [];
  const sessionId = g.sessionId;
  out.push(`${s.bold("Session")} ${sessionId.slice(0, 8)}  ${s.dim(clip(g.env.cwd, 120))}`);
  out.push(s.dim("Each action sits under the call whose output first held its headline value. Data flow, not the agent's reasons."));
  for (const root of forest) {
    out.push("", rootLine(root, g, s));
    root.children.forEach((child, i) => nodeLines(child, "", i === root.children.length - 1, g, s, out));
  }
  if (omitted) out.push("", s.dim(`${omitted} later actions are not shown; run contrail trace for the full timeline.`));
  out.push("", s.dim(`Run ${s.bold('contrail why <path | "command">')} for the full trail behind any line.`));
  return `${out.join("\n")}
`;
}
function rootLine(root, g, s) {
  if (root.kind === "unknown") return s.bold("no observed source");
  if (root.kind === "nothing") return s.bold("nothing to trace") + s.dim(" (no values in these calls to follow)");
  const src = root.source;
  const prompt = src.origin === "prompt" ? g.prompts.find((p) => `prompt:${p.promptId}` === src.id) : void 0;
  const what = prompt ? `${clip(src.label, 100)}  "${clip(prompt.text, 70)}"` : clip(src.label, 100);
  return `${s.bold(what)}  ${src.trust === "external" ? s.flag(`(${src.trust})`) : s.dim(`(${src.trust})`)}`;
}
function nodeLines(node, prefix, last, g, s, out) {
  const a = node.action;
  const who = a.scope.agentId ? s.dim(` [subagent ${callId(a.scope.agentId)}]`) : "";
  const failed = a.status === "failed" || a.status === "interrupted" ? s.flag(` ${a.status.toUpperCase()}`) : "";
  const line = node.link?.quote?.line != null ? s.dim(` (line ${node.link.quote.line})`) : "";
  const external = node.source?.trust === "external" ? ` ${s.flag("(external)")}` : "";
  const via = node.link && node.token ? `  ${s.dim("\u2190")} ${s.grade(node.link.grade, 0).trim()} ${clip(node.token, 80)}${line}${external}` : "";
  out.push(`${s.dim(prefix + (last ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 "))}${s.dim(pad2(`${a.preSeq}`, 4))} ${pad2(kindOf(a), 7)} ${clip(summary(a, g), 60)}${who}${failed}${via}`);
  const next = prefix + (last ? "    " : "\u2502   ");
  node.children.forEach((child, i) => nodeLines(child, next, i === node.children.length - 1, g, s, out));
}
function renderStatusline(g, findings, s = PLAIN) {
  const name = s.dim("contrail");
  if (!g) return `${name} ${s.dim("recording")}`;
  const external = findings.filter((f) => f.externalUpstream).length;
  const unnamed = findings.filter((f) => !f.externalUpstream && f.requested === "NOT_NAMED").length;
  const parts = [
    external ? s.flag(`\u25B2 ${external} from external content`) : "",
    unnamed ? s.bold(`\u25B3 ${unnamed} not named by you`) : "",
    s.dim(`${g.actions.length} call${g.actions.length === 1 ? "" : "s"}`)
  ].filter(Boolean);
  return `${name} ${parts.join(s.dim(" \xB7 "))}`;
}
function renderFind(value, hits, scanned, s = PLAIN) {
  const found = hits.filter((h) => h.sightings.length);
  const out = [`${s.bold(`"${clip(value, 80)}"`)} ${s.dim(`in ${found.length} of ${scanned} session${scanned === 1 ? "" : "s"}`)}`];
  if (!found.length) {
    out.push("", `  ${s.dim("No recorded input or call contains it. Matching is whole-token and literal; no observed source is not the same as no source.")}`);
    return `${out.join("\n")}
`;
  }
  for (const { graph: g, sightings } of found) {
    const sessionId = g.sessionId;
    const first = g.prompts.find((p) => p.from === "you");
    out.push("", `${s.bold("Session")} ${sessionId.slice(0, 8)}  ${s.dim(first ? `"${clip(first.text, 70)}"` : "")}`);
    let seenSource = false;
    for (const hit of sightings) {
      if (hit.source) {
        const src = hit.source.input;
        const where2 = `${clip(src.label, 90)}${hit.source.line != null ? `:${hit.source.line}` : ""}`;
        const trust2 = src.trust === "external" ? s.flag(`(${src.trust})`) : s.dim(`(${src.trust})`);
        out.push(`  ${s.dim(pad2(`${hit.seq}`, 4))} ${pad2("HELD", 6)} ${where2}  ${trust2}${seenSource ? "" : `  ${s.accent("first seen")}`}`);
        seenSource = true;
        if (hit.source.text) out.push(`              ${s.dim(hit.source.line != null ? `${hit.source.line}\u2502` : "\u2502")} ${clip(hit.source.text, 96)}`);
        else if (src.hashed) out.push(`              ${s.dim(`${hit.source.line ?? ""}\u2502 (text not stored)`)}`);
      } else if (hit.use) {
        const a = hit.use.action;
        const who = a.scope.agentId ? s.dim(` [subagent ${callId(a.scope.agentId)}]`) : "";
        const kinds = hit.use.kinds.length ? `  ${s.flag(hit.use.kinds.join(" \xB7 "))}` : "";
        out.push(`  ${s.dim(pad2(`${hit.seq}`, 4))} ${pad2("USED", 6)} ${kindOf(a)} ${clip(summary(a, g), 80)} ${s.dim(`(${hit.use.argPath})`)}${who}${kinds}`);
      }
    }
  }
  out.push("", s.dim(`HELD: an input that held the value. USED: a call whose arguments contain it. Run ${s.bold("contrail why")} on a call for its graded trail.`));
  return `${out.join("\n")}
`;
}
function renderSessions(sessions2, s = PLAIN) {
  if (!sessions2.length) return "No sessions recorded yet. Use Claude Code with the plugin enabled, then try again.\n";
  const head = ["SESSION", "LAST ACTIVE", "TURNS", "READS", "WRITES", "SHELL", "WEB/MCP", "SUBAGENTS", "FLAGGED", "FIRST PROMPT"];
  const rows = sessions2.map((x) => {
    const g = x.graph;
    const count2 = (kinds) => g.actions.filter((a) => kinds.includes(kindOf(a))).length;
    const subagents = new Set(g.actions.map((a) => a.scope.agentId).filter(Boolean)).size;
    return [
      x.id.slice(0, 8),
      localTime(x.lastUs),
      `${g.prompts.length}`,
      `${count2(["READ", "SEARCH"])}`,
      `${new Set(g.effects.filter((e) => e.kind === "file").map((e) => e.target)).size}`,
      `${count2(["SHELL"])}`,
      `${count2(["WEB", "MCP"])}`,
      `${subagents}`,
      `${x.flagged}`,
      clip(g.prompts.find((p) => p.from === "you")?.text ?? "", 60)
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => i === cells.length - 1 ? c : c.padEnd(widths[i])).join("  ");
  const body = rows.map(line);
  const flaggedCol = head.indexOf("FLAGGED");
  return [s.bold(line(head)), ...body.map((b, i) => rows[i][flaggedCol] !== "0" ? highlightFlag(b, s) : b)].join("\n") + `

${s.dim("FLAGGED = sensitive actions whose values trace to external content. See: contrail risks --session <id>")}
`;
}
function highlightFlag(row, s) {
  return s.on ? row.replace(/^(\S+)/, (m) => s.flag(m)) : row;
}
function renderRisks(findings, scanned, g, s = PLAIN) {
  const out = [];
  out.push(
    `${s.bold("Sensitive actions")} ${s.dim(`(${findings.length} of ${counted(scanned.actions, "tool call")} in ${counted(scanned.sessions, "session")})`)}`
  );
  if (!scanned.actions) {
    out.push("", "  No tool calls recorded yet. Contrail records from the moment the plugin is enabled: use Claude Code, then try again.");
    return `${out.join("\n")}
`;
  }
  if (!findings.length) out.push("", "  None found.");
  for (const f of findings) {
    const graph = g.get(f.action.scope.sessionId);
    const mark = f.externalUpstream ? s.flag("\u25B2") : f.requested === "NOT_NAMED" ? s.bold("\u25B3") : s.dim("\xB7");
    out.push("", `${mark} ${s.bold(describe(f.action, graph))}`);
    const asked = f.requested === "NAMED" ? "named by you" : f.requested === "NOT_NAMED" ? s.flag("not named by you") : f.requested.toLowerCase().replace(/_/g, " ");
    const prompt = graph.prompts.find((p) => p.promptId === f.action.promptId);
    out.push(`  ${s.accent(f.kinds.join(" \xB7 "))}   ${asked}   ${s.dim(`session ${f.action.scope.sessionId.slice(0, 8)} \xB7 ${prompt?.label ?? "no turn"} \xB7 ${callId(f.action.id)}`)}`);
    const external = f.sources.filter((x) => x.input.trust === "external");
    const shown = (external.length ? external : f.sources).slice(0, 3);
    if (!shown.length) {
      out.push(`  ${s.dim("values trace to: no observed source")}`);
      continue;
    }
    out.push(`  ${external.length ? s.flag("values trace to external content:") : s.dim("values trace to:")}`);
    for (const { link, input } of shown) {
      const where2 = `${clip(input.label, 100)}${link.quote?.line != null ? `:${link.quote.line}` : ""}`;
      out.push(`    ${s.grade(link.grade)}${clip(link.token ?? "", 80)}  \u2190 ${where2}  ${input.trust === "external" ? s.flag(`(${input.trust})`) : s.dim(`(${input.trust})`)}`);
      if (link.quote?.text) out.push(`             ${s.dim(link.quote.line != null ? `${link.quote.line}\u2502` : "\u2502")} ${clip(link.quote.text, 96)}`);
      else if (link.quote && input.hashed) out.push(`             ${s.dim(`${link.quote.line ?? ""}\u2502 (text not stored)`)}`);
    }
  }
  out.push(
    "",
    s.dim("\u25B2 values trace to web, MCP or dependency content   \u25B3 not named by you   \xB7 named by you"),
    s.dim("Contrail explains; it does not judge or block. A flagged action is not proof of an attack, and an unflagged one is not proof of safety.")
  );
  return `${out.join("\n")}
`;
}
function renderCommit(r, g, s = PLAIN) {
  const out = [];
  const { commit, action, explanation: e } = r;
  const prompt = g.prompts.find((p) => p.promptId === action.promptId);
  out.push(`${s.bold("Commit")} ${s.accent(commit.sha)} on ${clip(commit.branch, 60)}  ${s.bold(`"${clip(commit.subject, 80)}"`)}`);
  if (r.via === "time") {
    const at = r.commitSec ? new Date(r.commitSec * 1e3).toISOString().slice(11, 19) : "that second";
    out.push(
      `  ${s.grade("LIKELY")}made by ${action.tool} ${callId(action.id)} (seq ${action.preSeq}): the only recorded git commit running when git dated this commit (${at} UTC)  ${s.dim("[R9]")}`,
      `           ${s.dim("git printed no commit line for this command, so the join is on time, not on git's output")}`
    );
  } else {
    out.push(`  ${s.grade("DIRECT")}made by ${action.tool} ${callId(action.id)} (seq ${action.preSeq}): [${clip(commit.branch, 60)} ${commit.sha}] ${clip(commit.subject, 60)}  ${s.dim("[R1]")}`);
  }
  const verdict = e.requested.verdict;
  const said = e.requested.sentence ? ` "${clip(e.requested.sentence.text, 70)}"` : "";
  out.push(`Requested?  ${verdict === "NOT_NAMED" ? s.flag("NOT NAMED") : s.bold(verdict.replace(/_/g, " "))}${said}  ${s.dim(`[R8 ${e.requested.grade}]`)}`);
  if (prompt) out.push(`Turn        ${s.grade("DIRECT")}ran while answering ${prompt.label}: "${clip(prompt.text, 70)}"  ${s.dim("[R1]")}`);
  out.push("");
  if (!r.files) {
    out.push(s.dim("Commit contents unavailable: git could not show this commit here (run from inside the repository)."));
    return `${out.join("\n")}
`;
  }
  out.push(s.bold("What the commit contains") + s.dim(" (file list from git now, joined to the agent's changes by path)"));
  const width = Math.max(...r.files.map((f) => displayPath(f.file, g.env.cwd, g.env.home).length));
  const order = { LIKELY: 0, POSSIBLE: 1, UNKNOWN: 2 };
  for (const f of [...r.files].sort((a, b) => order[a.grade] - order[b.grade])) {
    const shown = displayPath(f.file, g.env.cwd, g.env.home).padEnd(width);
    if (!f.writer) {
      out.push(`  ${s.grade("UNKNOWN")}${shown}  ${s.dim("no agent change recorded in this session (you, another process, or an earlier session)")}`);
      continue;
    }
    const w = f.writer;
    out.push(
      `  ${s.grade(f.grade)}${shown}  \u2190 ${w.action.tool} ${callId(w.action.id)} ${clip(describe(w.action, g), 44)}  ${w.named ? s.dim("named by you") : s.flag("not named by you")}  ${s.dim("[R7]")}`
    );
  }
  const unnamed = r.files.filter((f) => f.writer && !f.writer.named).length;
  out.push(
    "",
    s.dim("LIKELY, not DIRECT: git lists the file and the agent changed it earlier; whether that exact change is what was committed is not observed."),
    `${unnamed} of ${r.files.length} files hold agent changes you did not name. ${s.dim("Run contrail why <file> for the trail behind each one.")}`
  );
  return `${out.join("\n")}
`;
}
var pad2 = (text, width) => text.padEnd(width);
var counted = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;
function localTime(us) {
  const d = new Date(Math.floor(us / 1e3));
  const two = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
var TRIPWIRE_ASKED = {
  NAMED: "named in your words",
  NAMED_NEGATED: "named, but your latest mention is negated",
  PARTLY_NAMED: "partly named in your words",
  NOT_NAMED: "not named in your words",
  NOTHING_TO_MATCH: "nothing in it to match against your words"
};
function renderTripwire(f, e) {
  const external = f.sources.find((x) => x.input.trust === "external");
  const values = [...new Set(f.sources.filter((x) => x.input.id === external.input.id).map((x) => x.link.token).filter((v) => !!v))];
  const where2 = external.link.quote?.line != null ? `${clip(external.input.label, 80)}:${external.link.quote.line}` : clip(external.input.label, 80);
  const shown = values.length ? clip(values.map((v) => clip(v, 60)).join(", "), 120) : "a value in it";
  return `Contrail \u25B2 ${f.kinds.join(" \xB7 ")} \xB7 ${TRIPWIRE_ASKED[f.requested]}: ${shown} first appeared in ${where2} (external, ${external.link.grade}). Trail: /contrail:why ${callId(e.action.id)}`;
}

// src/render/blame.ts
var BLAME_FOOTER = [
  "LIKELY: this call wrote this text to this file, and no later recorded write did [R10]. A text match, so never DIRECT.",
  "POSSIBLE: the file holds the text more often than this call wrote it, or the shell write was expected, not reported.",
  "UNKNOWN: no recorded agent write holds the text. Blank and bracket-only lines join a block only if both sides agree.",
  "Which call last wrote a line is data provenance, not the agent's reasons."
];
var BLIND_SPOTS = [
  "Blind spots: edits outside Claude Code's tools or before Contrail was installed; text redacted or cut when stored.",
  "A Write counts every line it wrote, even unchanged ones. No match is not the same as not written by the agent."
];
var CODE_WIDTH = 104;
function renderBlame(b, shown, s = PLAIN) {
  const out = [];
  const total = b.lines.length;
  const attributed = b.lines.filter((l) => l.call).length;
  const sessions2 = new Set(b.calls.map((c) => c.sessionId)).size;
  out.push(`${s.bold("Blame")} ${s.bold(clip(shown, 110))}  ${s.dim("(the file as it is now)")}`);
  out.push(
    s.dim(
      `${attributed} of ${total} line${total === 1 ? "" : "s"} attributed to ${plural(b.calls.length, "recorded agent call")} in ${plural(sessions2, "session")} \xB7 ${plural(b.writes, "recorded write")} to this file${b.read < b.writes ? ` (the newest ${b.read} read)` : ""}` + (b.session ? ` \xB7 only session ${b.session.slice(0, 8)}` : "")
    )
  );
  if (b.latestTextless) {
    const which = b.textless === 1 ? `1 of them (${b.latestTextless.tool} ${callId(b.latestTextless.id)})` : `${b.textless} of them`;
    out.push(s.dim(`${which} recorded no text to match (a shell write other than a literal heredoc).`));
    out.push(s.dim(`contrail why ${clip(shown, 80)} shows the latest write to the file.`));
  }
  const calls = new Map(b.calls.map((c) => [c.id, c]));
  const shownCalls = /* @__PURE__ */ new Set();
  const gutter = Math.max(4, String(total).length);
  for (const block of blameBlocks(b.lines)) {
    out.push("");
    const call = block.call ? calls.get(block.call) : void 0;
    if (!call) {
      out.push(`${s.grade("UNKNOWN")}${s.dim("no recorded agent write holds these lines (they may be yours, pre-existing, or changed since)")}`);
    } else if (shownCalls.has(call.id)) {
      out.push(`${s.grade(block.grade)}${call.tool} ${callId(call.id)} ${s.dim("(shown above)")}`);
    } else {
      shownCalls.add(call.id);
      out.push(...callHeader(call, block.grade, s));
    }
    const text = b.lines.slice(block.start - 1, block.end).map((l) => l.text).join("\n");
    const value = call?.explanation ? blockValue(call, text) : void 0;
    if (value && call?.graph) {
      const from = traceSource(value, new Map(call.graph.inputs.map((i) => [i.id, i])), s);
      if (from) out.push(`         ${s.dim("\u21B3 in these lines:")} ${from}`);
    }
    for (const l of b.lines.slice(block.start - 1, block.end)) {
      const code = codeLine(l.text, CODE_WIDTH);
      out.push(`${s.dim(`${String(l.line).padStart(gutter)} \u2502`)} ${call ? code : s.dim(code)}`.trimEnd());
    }
  }
  out.push("");
  const example = b.calls[0] ? `, as in ${s.bold(`contrail why ${callId(b.calls[0].id)}`)}` : "";
  out.push(s.dim(`Run contrail why <call id>${example}, or contrail why <file>:<line>, for the full trail behind a call.`));
  for (const line of BLAME_FOOTER) out.push(s.dim(line));
  for (const line of BLIND_SPOTS) out.push(s.dim(line));
  return `${out.join("\n")}
`;
}
function callHeader(call, grade, s) {
  const a = call.action;
  const g = call.graph;
  const prompt = a && g ? g.prompts.find((p) => p.promptId === a.promptId) : void 0;
  const who = a?.scope.agentId ? s.dim(` \xB7 subagent ${callId(a.scope.agentId)}`) : "";
  const tool = call.tool === "Bash" ? "Bash heredoc" : call.tool;
  const lines = [`${s.grade(grade)}${s.bold(`${tool} ${callId(call.id)}`)}${s.dim(` \xB7 session ${call.sessionId.slice(0, 8)} \xB7 ${localTime(call.us)}`)}${who}`];
  if (a) {
    lines.push(
      `         ${!prompt ? s.dim("turn not recorded") : prompt.from === "task" ? `${prompt.label} ${s.dim("a background task report, not your words:")} "${clip(prompt.text, 70)}"` : `${prompt.label} ${s.dim("your words:")} "${clip(prompt.text, 90)}"`}`
    );
  }
  if (!call.observed) lines.push(`         ${s.dim("the write was expected from the command, not reported by Claude Code")}`);
  if (call.explanation && g) {
    const detail = trailDetail(call.explanation, new Map(g.inputs.map((i) => [i.id, i])), s);
    if (detail) lines.push(`         ${s.dim("\u21B3")} ${detail}`);
  } else {
    lines.push(`         ${s.dim(`trail not loaded here (too many calls); run contrail why ${callId(call.id)}`)}`);
  }
  return lines;
}
function blockValue(call, text) {
  const e = call.explanation;
  const head = headlineTrace(e);
  return bestPerGroup(e.traces).find(
    (t) => t !== head && t.token.argPath !== "$.file_path" && t.links.some((l) => l.grade !== "UNKNOWN") && findMention(text, t.token.text) >= 0
  );
}
function codeLine(raw, max) {
  const safe = raw.replace(/\t/g, "    ").replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, "\uFFFD").replace(/`/g, "\u02CB").trimEnd();
  const chars = [...safe];
  return chars.length <= max ? safe : `${chars.slice(0, max - 1).join("")}\u2026`;
}
var plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;
var lineRef = (t) => `${clip(t.shown, 100)}:${t.start}${t.end === t.start ? "" : `-${t.end}`}`;
function renderLineNote(t, line, call, s = PLAIN) {
  const which = t.end === t.start ? lineRef(t) : `${lineRef(t)}: line ${line.line}`;
  const how = line.match === "block" ? "a blank or bracket-only line between lines this call wrote" : !call.observed ? "matched by the line's text; the shell write was expected, not reported" : line.unambiguous ? "matched by the line's text" : `matched by the line's text, which occurs ${line.inFile} times in the file; this call wrote it ${line.byCall === 1 ? "once" : `${line.byCall} times`}`;
  return `${s.bold(which)} was last written by ${s.bold(callId(call.id))} ${s.dim(`(session ${call.sessionId.slice(0, 8)}, ${localTime(call.us)})`)}; ${s.grade(line.grade, 0).trim()} \u2014 ${how} ${s.dim("[R10]")}`;
}
function noLineWriter(t) {
  const what = t.end === t.start ? `line ${lineRef(t)}` : `any of lines ${lineRef(t)}`;
  return `No recorded agent write holds ${what} as it is now (it may be yours, pre-existing, or changed since). Run contrail blame ${clip(t.shown, 100)} to see which lines are attributed.`;
}
function blameJson(b) {
  return {
    file: b.path,
    lines: b.lines.length,
    attributed: b.lines.filter((l) => l.call).length,
    calls: b.calls.length,
    sessions: new Set(b.calls.map((c) => c.sessionId)).size,
    writes: { recorded: b.writes, read: b.read },
    session: b.session,
    blocks: blameBlocks(b.lines).map((x) => ({ ...x, rule: x.call ? "R10" : null })),
    lineDetail: b.lines.map((l) => ({
      line: l.line,
      call: l.call,
      grade: l.grade,
      rule: l.call ? "R10" : null,
      match: l.match,
      trivial: l.trivial,
      unambiguous: l.unambiguous,
      writers: l.writers,
      inFile: l.inFile,
      byCall: l.byCall
    })),
    writers: b.calls.map((c) => {
      const inputs = new Map(c.graph?.inputs.map((i) => [i.id, i]) ?? []);
      const prompt = c.action && c.graph ? c.graph.prompts.find((p) => p.promptId === c.action.promptId) : void 0;
      const head = c.explanation ? headlineTrace(c.explanation) : void 0;
      const link = head?.links.find((l) => l.grade !== "UNKNOWN");
      const src = link?.to ? inputs.get(link.to) : void 0;
      return {
        call: c.id,
        session: c.sessionId,
        tool: c.tool,
        at: new Date(Math.floor(c.us / 1e3)).toISOString(),
        file: c.observed ? { grade: "DIRECT", rule: "R1" } : { grade: "POSSIBLE", rule: "R6" },
        agent: c.action?.scope.agentId ?? null,
        turn: prompt ? { label: prompt.label, from: prompt.from, text: prompt.text } : null,
        requested: c.explanation?.requested.verdict ?? null,
        trail: head && link && src ? { token: head.token.text, grade: link.grade, rule: link.rule, source: src.label, trust: src.trust, origin: src.origin, line: link.quote?.line ?? null } : null,
        chainGrade: c.explanation?.chainGrade ?? null
      };
    })
  };
}

// src/render/ansi.ts
var MAX_COLS = 120;
var COLORS = {
  32: "#3fb950",
  33: "#d29922",
  35: "#d2a8ff",
  36: "#56d4dd",
  90: "#6e7681"
};
var PLAIN_PEN = { bold: false, dim: false, color: null };
function applySgr(pen, params) {
  const next = { ...pen };
  for (const code of (params || "0").split(";").map(Number)) {
    if (code === 0) Object.assign(next, PLAIN_PEN);
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 22) next.bold = next.dim = false;
    else if (code === 39) next.color = null;
    else if (COLORS[code]) next.color = COLORS[code];
  }
  return next;
}
function parseAnsi(ansi, cols = MAX_COLS) {
  const lines = [];
  let pen = PLAIN_PEN;
  for (const raw of ansi.replace(/\r/g, "").replace(/\n$/, "").split("\n")) {
    let cells = [];
    const line = raw.replace(/\x1b\][^\x07\x1b]{0,2048}(?:\x07|\x1b\\)?/g, "");
    for (const part of line.split(/(\x1b\[[0-9;?]{0,32}[@-~])/)) {
      const sgr2 = /^\x1b\[([0-9;]{0,32})m$/.exec(part);
      if (sgr2) pen = applySgr(pen, sgr2[1]);
      else if (!part.startsWith("\x1B[")) for (const ch of part.replace(/\x1b[@-_]?|[\x00-\x08\x0b-\x1f\x7f]/g, "")) cells.push({ ch, pen });
    }
    while (cells.length > cols) {
      const space = cells.slice(0, cols + 1).findLastIndex((c) => c.ch === " ");
      const cut = space > cols / 2 ? space : cols;
      lines.push(toRuns(cells.slice(0, cut)));
      cells = cells.slice(cut === space ? cut + 1 : cut);
    }
    lines.push(toRuns(cells));
  }
  return lines;
}
function toRuns(cells) {
  const runs = [];
  cells.forEach(({ ch, pen }, col) => {
    const last = runs.at(-1);
    if (last && last.bold === pen.bold && last.dim === pen.dim && last.color === pen.color) last.text += ch;
    else runs.push({ ...pen, col, text: ch });
  });
  return runs;
}

// src/render/html.ts
var escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
var CLASS_OF_COLOR = {
  "#3fb950": "direct",
  "#56d4dd": "likely",
  "#d29922": "possible",
  "#6e7681": "unknown",
  "#d2a8ff": "flag"
};
function ansiToHtml(ansi) {
  return parseAnsi(ansi, Number.MAX_SAFE_INTEGER).map(
    (line) => line.map((run) => {
      const classes = [run.color ? CLASS_OF_COLOR[run.color] : "", run.bold ? "b" : "", run.dim ? "d" : ""].filter(Boolean);
      const text = escapeHtml(run.text);
      return classes.length ? `<span class="${classes.join(" ")}">${text}</span>` : text;
    }).join("")
  ).join("\n");
}
var gradeClass = (g) => g.toLowerCase();
var time = (us) => us ? new Date(Math.floor(us / 1e3)).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "";
function renderReport(r) {
  const g = r.graph;
  const sessionId = g.sessionId;
  const anchor = (id) => `a-${id.replace(/[^\w-]/g, "_")}`;
  const byAction = new Map(r.findings.map((f) => [f.action.id, f]));
  const external = r.findings.filter((f) => f.externalUpstream).length;
  const fileEffects = g.effects.filter((e) => e.kind === "file").length;
  const first = g.timeUs.length ? Math.min(...g.timeUs) : 0;
  const last = g.timeUs.length ? Math.max(...g.timeUs) : 0;
  const card = (value, label, tone = "") => `<div class="card ${tone}"><div class="num">${value}</div><div class="label">${label}</div></div>`;
  const risks2 = r.findings.length ? r.findings.map((f) => {
    const mark = f.externalUpstream ? "\u25B2" : f.requested === "NOT_NAMED" ? "\u25B3" : "\xB7";
    const asked = f.requested === "NAMED" ? "named by you" : f.requested === "NOT_NAMED" ? "not named by you" : f.requested.toLowerCase().replace(/_/g, " ");
    return `<a class="finding${f.externalUpstream ? " ext" : ""}" href="#${anchor(f.action.id)}"><span class="mark">${mark}</span><code>${escapeHtml(clip(summary(f.action, g), 140))}</code><span class="kinds">${escapeHtml(f.kinds.join(" \xB7 "))}</span><span class="pill${f.requested === "NOT_NAMED" ? " flag" : ""}">${asked}</span>${f.externalUpstream ? '<span class="pill ext">traces to external content</span>' : ""}</a>`;
  }).join("\n") : '<p class="muted">None found in this session.</p>';
  const items = [];
  for (const p of g.prompts) {
    const who = p.from === "task" ? '<span class="pill">background task report, not your words</span>' : '<span class="pill you">your prompt</span>';
    items.push({ seq: p.seq, html: `<h3 class="turn"><span class="label">${escapeHtml(p.label)}</span>${who}<span class="prompt">${escapeHtml(clip(p.text, 240))}</span></h3>` });
  }
  for (const i of g.inputs.filter((x) => x.origin === "instructions")) {
    items.push({ seq: i.availableAt, html: `<div class="row loaded"><span class="seq">${i.availableAt}</span><span class="kind">LOADED</span><code>${escapeHtml(clip(i.label, 140))}</code><span class="muted">${escapeHtml(originWording(i))}</span></div>` });
  }
  for (const a of g.actions) {
    const e = r.explanations.get(a.id);
    const f = byAction.get(a.id);
    const tone = [f ? "sensitive" : "", f?.externalUpstream ? "ext" : "", a.status === "failed" || a.status === "interrupted" ? "failed" : ""].filter(Boolean).join(" ");
    const pills = [
      e ? `<span class="grade ${gradeClass(e.chainGrade)}">${e.chainGrade}</span>` : "",
      e?.requested.verdict === "NOT_NAMED" ? '<span class="pill flag">not named by you</span>' : e?.requested.verdict === "NAMED" ? '<span class="pill">named by you</span>' : "",
      f ? `<span class="pill ${f.externalUpstream ? "ext" : "flag"}">${escapeHtml(f.kinds.join(" \xB7 "))}</span>` : "",
      a.scope.agentId ? `<span class="pill">subagent ${escapeHtml(callId(a.scope.agentId))}</span>` : "",
      a.status === "failed" || a.status === "interrupted" ? `<span class="pill flag">${a.status}</span>` : ""
    ].join("");
    const head = `<span class="seq">${a.preSeq}</span><span class="kind">${escapeHtml(kindOf(a))}</span><code>${escapeHtml(clip(summary(a, g), 140))}</code>${pills}`;
    items.push({
      seq: a.preSeq,
      html: e ? `<details class="${["row", tone].filter(Boolean).join(" ")}" id="${anchor(a.id)}"><summary>${head}</summary><pre class="term">${ansiToHtml(renderWhy(e, g, void 0, COLOR))}</pre></details>` : `<div class="${["row", tone].filter(Boolean).join(" ")}" id="${anchor(a.id)}">${head}</div>`
    });
  }
  items.sort((x, y) => x.seq - y.seq);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Contrail ${escapeHtml(r.version)}">
<title>Contrail report \xB7 session ${escapeHtml(sessionId.slice(0, 8))}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <div class="brand">${LOGO_MARK}<span>contrail</span></div>
  <h1>Session ${escapeHtml(sessionId.slice(0, 8))}</h1>
  <p class="meta"><code>${escapeHtml(clip(g.env.cwd, 160))}</code> \xB7 ${escapeHtml(time(first))} to ${escapeHtml(time(last))}</p>
  <nav><a href="#risks">Sensitive actions</a><a href="#timeline">Timeline</a><a href="#trails">Trails</a></nav>
</header>
<main>
<section class="cards">
  ${card(g.prompts.length, "turns")}
  ${card(g.actions.length, "tool calls")}
  ${card(fileEffects, "file changes")}
  ${card(r.findings.length, "sensitive actions", r.findings.length ? "warn" : "")}
  ${card(external, "trace to external content", external ? "alert" : "")}
</section>

<section id="risks">
  <h2>Sensitive actions</h2>
  <div class="findings">${risks2}</div>
  <details class="full"><summary>Full risks report</summary><pre class="term">${ansiToHtml(renderRisks(r.findings, { actions: g.actions.length, sessions: 1 }, /* @__PURE__ */ new Map([[sessionId, g]]), COLOR))}</pre></details>
</section>

<section id="timeline">
  <h2>Timeline</h2>
  <p class="muted">Open any call for its full trail: where each value in it first appeared, who wrote that source, and how strong each link is.</p>
  ${items.map((i) => i.html).join("\n  ")}
</section>

<section id="trails">
  <h2>Trails</h2>
  <p class="muted">Each call sits under the call whose output first held its headline value.</p>
  <pre class="term">${ansiToHtml(renderTree(g, r.forest, r.omitted, COLOR))}</pre>
</section>
</main>
<footer>
  <p><b>Data provenance, not the agent's reasons.</b> A grade says where a value first appeared in the agent's context, not what the agent intended. Every report lists what Contrail could not see.</p>
  <p>Generated by Contrail ${escapeHtml(r.version)} on ${escapeHtml(r.generatedAt.toISOString().slice(0, 10))} from local data. This file loads nothing and makes no network requests.</p>
</footer>
</body>
</html>
`;
}
var LOGO_MARK = `<svg width="64" height="22" viewBox="0 0 64 22" aria-hidden="true"><g stroke-linecap="round" fill="none"><line x1="2" y1="17" x2="11" y2="15.5" stroke="#6e7681" stroke-width="2.5"/><line x1="15" y1="14.8" x2="24" y2="13.3" stroke="#d29922" stroke-width="3"/><line x1="28" y1="12.6" x2="37" y2="11.1" stroke="#56d4dd" stroke-width="3.5"/><line x1="41" y1="10.4" x2="49" y2="9" stroke="#3fb950" stroke-width="4"/></g><circle cx="56" cy="7.8" r="4.5" fill="#3fb950"/></svg>`;
var CSS = `
:root { --bg: #ffffff; --panel: #f6f8fa; --border: #d0d7de; --fg: #1f2328; --muted: #59636e; --term-bg: #0d1117; --term-fg: #c9d1d9;
  --direct: #1a7f37; --likely: #0a7d86; --possible: #9a6700; --unknown: #6e7781; --flag: #8250df; --alert: #cf222e; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --panel: #161b22; --border: #30363d; --fg: #e6edf3; --muted: #8d96a0;
  --direct: #3fb950; --likely: #56d4dd; --possible: #d29922; --unknown: #8b949e; --flag: #d2a8ff; --alert: #f85149; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
header, main, footer { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
header { padding-top: 28px; }
.brand { display: flex; align-items: center; gap: 10px; font: 700 20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
h1 { margin: 14px 0 2px; font-size: 26px; }
h2 { margin: 36px 0 12px; font-size: 20px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.meta, .muted { color: var(--muted); }
nav { display: flex; gap: 18px; margin: 10px 0 0; }
nav a, a { color: var(--likely); text-decoration: none; }
code, .kind, .seq, .grade { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 22px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.card .num { font-size: 28px; font-weight: 700; }
.card .label { color: var(--muted); font-size: 13px; }
.card.warn .num { color: var(--possible); }
.card.alert .num { color: var(--alert); }
.findings { display: grid; gap: 8px; }
.finding { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; color: var(--fg); background: var(--panel); }
.finding.ext { border-color: var(--flag); }
.finding .mark { color: var(--flag); font-weight: 700; }
.finding .kinds { color: var(--likely); font-weight: 600; font-size: 13px; }
.pill { display: inline-block; font-size: 12px; padding: 1px 8px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); white-space: nowrap; }
.pill.flag { color: var(--flag); border-color: var(--flag); }
.pill.ext { color: var(--alert); border-color: var(--alert); }
.pill.you { color: var(--direct); border-color: var(--direct); }
.grade { font-weight: 700; padding: 0 6px; border-radius: 4px; }
.grade.direct { color: var(--direct); } .grade.likely { color: var(--likely); } .grade.possible { color: var(--possible); } .grade.unknown { color: var(--unknown); }
.turn { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin: 26px 0 8px; font-size: 16px; }
.turn .label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.turn .prompt { font-weight: 600; }
.row { border: 1px solid var(--border); border-radius: 8px; margin: 6px 0; background: var(--bg); }
.row > summary, div.row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; list-style: none; }
div.row { cursor: default; }
.row > summary::-webkit-details-marker { display: none; }
.row > summary::before { content: '\u25B8'; color: var(--muted); }
.row[open] > summary::before { content: '\u25BE'; }
.row.loaded { opacity: 0.8; }
.row.sensitive { border-left: 3px solid var(--possible); }
.row.ext { border-left: 3px solid var(--alert); }
.row.failed code { text-decoration: line-through; opacity: 0.7; }
.row:target { outline: 2px solid var(--likely); }
.seq { color: var(--muted); min-width: 2.5em; }
.kind { font-weight: 700; min-width: 5.5em; }
.row code { word-break: break-all; }
pre.term { margin: 0; padding: 14px 16px; background: var(--term-bg); color: var(--term-fg); border-radius: 0 0 8px 8px; overflow-x: auto; font: 12.5px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; }
#trails pre.term, details.full pre.term { border-radius: 8px; }
details.full { margin-top: 12px; }
details.full > summary { cursor: pointer; color: var(--muted); }
.term .b { font-weight: 700; } .term .d { opacity: 0.65; }
.term .direct { color: #3fb950; } .term .likely { color: #56d4dd; } .term .possible { color: #d29922; } .term .unknown { color: #6e7681; } .term .flag { color: #d2a8ff; }
footer { margin: 48px auto 40px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
`;

// src/render/otel.ts
import { createHash as createHash2 } from "node:crypto";
var SPAN_KIND_INTERNAL = 1;
var STATUS_ERROR = 2;
function attrs(o) {
  const out = [];
  for (const [key, v] of Object.entries(o)) {
    if (v === null || v === void 0 || v === "") continue;
    if (typeof v === "boolean") out.push({ key, value: { boolValue: v } });
    else if (typeof v === "number") out.push({ key, value: { intValue: String(Math.trunc(v)) } });
    else out.push({ key, value: { stringValue: v } });
  }
  return out;
}
var hexId = (kind, value, length) => {
  const hex = createHash2("sha256").update(`${kind}:${value}`).digest("hex").slice(0, length);
  return /^0+$/.test(hex) ? `1${hex.slice(1)}` : hex;
};
var nanos = (us) => (BigInt(Math.round(us)) * 1000n).toString();
function toOtlp(g, explanations, findings, version) {
  const sessionId = g.sessionId || "unknown";
  const traceId = hexId("trace", sessionId, 32);
  const rootId = hexId("session", sessionId, 16);
  const actionSpan = (id) => hexId("action", `${sessionId}:${id}`, 16);
  const turnSpan = (promptId) => hexId("turn", `${sessionId}:${promptId}`, 16);
  const at = (seq) => g.timeUs[Math.max(0, Math.min(g.timeUs.length - 1, seq - 1))] ?? 0;
  const first = g.timeUs.length ? Math.min(...g.timeUs) : 0;
  const last = g.timeUs.length ? Math.max(...g.timeUs) : 0;
  const inputs = new Map(g.inputs.map((i) => [i.id, i]));
  const actionIds = new Set(g.actions.map((a) => a.id));
  const byAction = new Map(findings.map((f) => [f.action.id, f]));
  const spans = [
    {
      traceId,
      spanId: rootId,
      name: `claude-code session ${sessionId.slice(0, 8)}`,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: nanos(first),
      endTimeUnixNano: nanos(last),
      attributes: attrs({ "session.id": sessionId, "contrail.cwd": g.env.cwd, "contrail.turns": g.prompts.length, "contrail.tool_calls": g.actions.length })
    }
  ];
  g.prompts.forEach((p, i) => {
    const next = g.prompts[i + 1];
    spans.push({
      traceId,
      spanId: turnSpan(p.promptId),
      parentSpanId: rootId,
      name: `turn ${p.label}`,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: nanos(at(p.seq)),
      endTimeUnixNano: nanos(next ? at(next.seq - 1) : last),
      attributes: attrs({
        "contrail.prompt.label": p.label,
        "contrail.prompt.from": p.from === "task" ? "background task report" : "you",
        "contrail.prompt.text": clip(p.text, 500)
      })
    });
  });
  for (const a of g.actions) {
    const e = explanations.get(a.id);
    const head = e ? headlineTrace(e) : void 0;
    const link = head?.links.find((l) => l.grade !== "UNKNOWN");
    const source = link?.to ? inputs.get(link.to) : void 0;
    const finding = byAction.get(a.id);
    const start = at(a.preSeq);
    const end = Math.max(start, at(a.postSeq ?? a.preSeq));
    const parent = a.promptId && g.prompts.some((p) => p.promptId === a.promptId) ? turnSpan(a.promptId) : rootId;
    spans.push({
      traceId,
      spanId: actionSpan(a.id),
      parentSpanId: parent,
      name: clip(`${a.tool} ${describe(a, g)}`, 120),
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: nanos(start),
      endTimeUnixNano: nanos(end),
      attributes: attrs({
        "contrail.tool": a.tool,
        "contrail.tool_use_id": a.id,
        "contrail.agent_id": a.scope.agentId,
        "contrail.seq": a.preSeq,
        "contrail.requested": e?.requested.verdict,
        "contrail.grade": e?.chainGrade,
        "contrail.value": head ? clip(head.token.text, 200) : null,
        "contrail.source": source ? clip(source.label, 200) : null,
        "contrail.origin": source?.origin,
        "contrail.trust": source?.trust,
        "contrail.sensitive": finding?.kinds.join(","),
        "contrail.external_upstream": finding ? finding.externalUpstream : null
      }),
      events: g.effects.filter((fx) => fx.actionId === a.id).map((fx) => ({
        timeUnixNano: nanos(end),
        name: "contrail.effect",
        attributes: attrs({ "contrail.effect.kind": fx.kind, "contrail.effect.target": clip(fx.target, 200), "contrail.effect.evidence": fx.evidence })
      })),
      links: provenanceLinks(a, e, inputs, actionIds, traceId, actionSpan, turnSpan),
      ...a.status === "failed" || a.status === "interrupted" ? { status: { code: STATUS_ERROR, message: a.status } } : {}
    });
  }
  return {
    resourceSpans: [
      {
        resource: { attributes: attrs({ "service.name": "claude-code", "contrail.version": version }) },
        scopeSpans: [{ scope: { name: "contrail", version }, spans }]
      }
    ]
  };
}
function provenanceLinks(a, e, inputs, actionIds, traceId, actionSpan, turnSpan) {
  if (!e) return [];
  const order = { DIRECT: 0, LIKELY: 1, POSSIBLE: 2, UNKNOWN: 3 };
  const links = /* @__PURE__ */ new Map();
  for (const t of e.traces) {
    for (const l of t.links) {
      const source = l.to ? inputs.get(l.to) : void 0;
      if (!source || l.grade === "UNKNOWN") continue;
      const spanId = source.producedBy && source.producedBy !== a.id && actionIds.has(source.producedBy) ? actionSpan(source.producedBy) : source.origin === "prompt" && source.promptId ? turnSpan(source.promptId) : null;
      if (!spanId) continue;
      const seen = links.get(spanId);
      if (!seen || order[l.grade] < order[seen.grade]) links.set(spanId, { spanId, grade: l.grade, value: t.token.text, source, rule: l.rule });
    }
  }
  return [...links.values()].sort((x, y) => order[x.grade] - order[y.grade]).map((l) => ({
    traceId,
    spanId: l.spanId,
    attributes: attrs({
      "contrail.link": "value_from",
      "contrail.grade": l.grade,
      "contrail.rule": l.rule,
      "contrail.value": clip(l.value, 200),
      "contrail.source": clip(l.source.label, 200),
      "contrail.trust": l.source.trust
    })
  }));
}

// src/render/review.ts
var REVIEW_BLIND_SPOTS = [
  ...BASE_BLIND_SPOTS,
  "changes made outside recorded Claude Code sessions (by you, another tool, or before Contrail was installed)",
  "which part of a recorded write the diff holds (files are joined by path and time, not content)",
  "commits rebased, amended or squashed after they were recorded (their new shas match no recorded commit line)",
  "sessions removed by retention"
];
var LIST_LIMIT = 20;
var COMMIT_LIMIT = 20;
var sid = (id) => id.slice(0, 8);
var short = (sha) => sha.slice(0, 7);
var plural2 = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var when = (sec) => new Date(sec * 1e3).toISOString().replace("T", " ").slice(0, 16) + " UTC";
var VERDICT_WORDS = {
  NAMED: "named by you",
  NOT_NAMED: "not named by you",
  NAMED_NEGATED: "named, but your latest mention is negated",
  PARTLY_NAMED: "partly named by you",
  NOTHING_TO_MATCH: "nothing in it to match against your words"
};
var STATUS_WORDS = { ok: "", failed: "failed", interrupted: "interrupted", pending: "no result recorded" };
function headline2(e, g) {
  const head = headlineTrace(e);
  const link = head?.links.find((l) => l.grade !== "UNKNOWN");
  const input = link?.to ? g.inputs.find((i) => i.id === link.to) : void 0;
  return head && link && input ? { token: head.token.text, link, input } : null;
}
var where = (link, input) => `${input.label}${link.quote?.line != null ? `:${link.quote.line}` : ""}`;
function fileState(f) {
  const committed = f.commits.length ? `committed in ${f.commits.slice(0, 3).map(short).join(", ")}${f.commits.length > 3 ? `, +${f.commits.length - 3} more` : ""}` : "";
  if (committed && f.uncommitted) return `${committed}; changed again, not committed`;
  return committed || (f.uncommitted ? "not committed" : "committed, in no listed commit (an older one, or a merge)");
}
function baseWords(r) {
  const b = r.range.base;
  return b.given ? `base ${b.name}` : `base ${b.name} (default: first found of ${DEFAULT_BASES.join(", ")})`;
}
function counts(r) {
  const agentFiles = r.files.filter((f) => f.grade !== "UNKNOWN").length;
  const uncommitted = r.files.filter((f) => f.uncommitted).length;
  const joined = r.commits.filter((c) => c.join.kind === "joined").length;
  return [
    plural2(r.range.totalCommits, "commit"),
    `${plural2(r.range.totalFiles, "changed file")}${uncommitted ? ` (${uncommitted} not committed)` : ""}`,
    `${agentFiles} with recorded agent changes`,
    plural2(r.graphs.size + r.sessionsOmitted, "session"),
    `${joined} of ${r.commits.length} commits joined to the call that made them`
  ];
}
function renderReview(r, s = PLAIN) {
  const out = [];
  const range = r.range;
  const head = range.branch ?? `HEAD (detached at ${short(range.head)})`;
  out.push(`${s.bold("Review")}  ${s.bold(clip(head, 80))} against ${s.bold(clip(range.base.name, 80))}`);
  out.push(s.dim(`  ${clip(baseWords(r), 160)} \xB7 merge-base ${short(range.base.mergeBase)}`));
  const facts = counts(r);
  out.push(`  ${facts.slice(0, 3).join(s.dim(" \xB7 "))}`, `  ${facts.slice(3).join(s.dim(" \xB7 "))}`);
  out.push(s.dim(`  agent changes: writes by sessions active here since ${when(r.floorSec)}, joined by path`));
  const limits = limitNotes(r);
  for (const note of limits) out.push(s.dim(`  ${note}`));
  out.push("", s.bold("Values from external content in this change"));
  if (!r.external.length) {
    out.push(s.dim("  None: no value in the agent's recorded writes or commits on this branch traces to web, MCP or dependency content."));
  }
  for (const x of r.external.slice(0, LIST_LIMIT)) {
    const g = r.graphs.get(x.sessionId);
    const into = x.files.length ? `in ${x.files.map((f) => clip(f, 80)).join(", ")} \xB7 ` : "";
    out.push(`  ${s.flag("\u25B2")} ${s.accent(clip(x.trail.token.text, 80))}  ${s.dim(`${into}${x.action.tool} ${callId(x.action.id)} \xB7 session ${sid(x.sessionId)} \xB7 ${turnLabel(x.action, g)}`)}`);
    x.trail.steps.forEach(({ link: link2, input: input2 }, i) => {
      const value = i ? `${clip(link2.token ?? "", 80)} ` : "";
      const lead = i ? s.dim("one step back: ") : "";
      out.push(`    ${s.grade(link2.grade)}${lead}${value}\u2190 ${clip(where(link2, input2), 100)}  ${trust(input2, s)}  ${s.dim(`[${link2.rule}]`)}`);
    });
    const { link, input } = x.trail.steps.at(-1);
    if (link.quote?.text) out.push(`             ${s.dim(link.quote.line != null ? `${link.quote.line}\u2502` : "\u2502")} ${clip(link.quote.text, 96)}`);
    else if (link.quote && input.hashed) out.push(`             ${s.dim(`${link.quote.line ?? ""}\u2502 (text not stored)`)}`);
  }
  more(out, r.external.length, s);
  out.push("", `${s.bold("Sensitive actions in these sessions")} ${s.dim(`(${r.findings.length} of ${r.actionsScanned} tool calls)`)}`);
  if (!r.findings.length) out.push(s.dim("  None found."));
  for (const f of r.findings.slice(0, LIST_LIMIT)) {
    const g = r.graphs.get(f.action.scope.sessionId);
    const mark = f.externalUpstream ? s.flag("\u25B2") : f.requested === "NOT_NAMED" ? s.bold("\u25B3") : s.dim("\xB7");
    const asked = f.requested === "NOT_NAMED" ? s.flag(VERDICT_WORDS[f.requested]) : VERDICT_WORDS[f.requested];
    const status = STATUS_WORDS[f.action.status];
    out.push(`  ${mark} ${s.bold(describe(f.action, g))}${status ? f.action.status === "pending" ? s.dim(` (${status})`) : s.flag(` ${status.toUpperCase()}`) : ""}`);
    out.push(`    ${s.accent(f.kinds.join(" \xB7 "))}   ${asked}   ${s.dim(`session ${sid(f.action.scope.sessionId)} \xB7 ${turnLabel(f.action, g)} \xB7 ${callId(f.action.id)}`)}`);
    const src = firstSource(f);
    if (src) {
      out.push(`    ${s.grade(src.link.grade)}${clip(src.link.token ?? "", 80)} \u2190 ${clip(where(src.link, src.input), 100)}  ${trust(src.input, s)}`);
    } else {
      out.push(s.dim("    values trace to: no observed source"));
    }
  }
  more(out, r.findings.length, s);
  out.push("", s.bold("Changed without being named in your words"));
  if (!r.notNamed.length) out.push(s.dim("  None: your words name a recorded writer of every agent-changed file that was explained."));
  const width = Math.min(60, Math.max(0, ...r.notNamed.map((f) => clip(f.path, 60).length)));
  for (const f of r.notNamed.slice(0, LIST_LIMIT)) {
    const w = f.writers.find((x) => x.explanation);
    const g = r.graphs.get(w.sessionId);
    const what = w.action.tool === "Bash" ? ` ${clip(describe(w.action, g), 50)}` : "";
    out.push(`  ${clip(f.path, 60).padEnd(width)}  ${s.dim("\u2190")} ${w.action.tool} ${callId(w.actionId)}${what}  ${s.dim(`session ${sid(w.sessionId)} \xB7 ${turnLabel(w.action, g)}`)}`);
  }
  more(out, r.notNamed.length, s);
  out.push("", s.bold("Commits") + s.dim(" (newest first)"));
  if (!r.commits.length) out.push(s.dim(`  None between ${clip(range.base.name, 80)} and HEAD.`));
  for (const c of r.commits.slice(0, COMMIT_LIMIT)) commitLines(c, r, s, out);
  if (r.range.totalCommits > Math.min(r.commits.length, COMMIT_LIMIT)) {
    out.push(s.dim(`  ${r.range.totalCommits - Math.min(r.commits.length, COMMIT_LIMIT)} more; --json lists up to ${r.commits.length}.`));
  }
  const agent = r.files.filter((f) => f.grade !== "UNKNOWN");
  const none = r.files.filter((f) => f.grade === "UNKNOWN");
  out.push("", s.bold("Files with recorded agent changes"));
  if (!agent.length) out.push(s.dim("  None."));
  for (const f of agent) fileLines(f, r, s, out);
  if (none.length) {
    out.push("", `${s.bold("No recorded agent change")} ${s.dim("(you, another process, or a session Contrail did not record)")}`);
    const w = Math.min(60, Math.max(...none.map((f) => clip(f.path, 60).length)));
    for (const f of none) out.push(`  ${s.grade("UNKNOWN")}${clip(f.path, 60).padEnd(w)}  ${s.dim(fileState(f))}`);
  }
  out.push(
    "",
    s.dim("LIKELY, not DIRECT: the agent wrote that path while this branch was in progress; whether that exact change is what the diff holds is not observed."),
    s.dim("Data provenance from Contrail's local record, not a judgment of this change. Not observable: the agent's reasons."),
    s.dim(`Blind spots: ${REVIEW_BLIND_SPOTS.join("; ")}. No observed source is not the same as no source.`),
    s.dim(`Run ${s.bold("contrail why <path>")} for the full trail behind any file, and ${s.bold("contrail review --markdown")} for a pull request description.`)
  );
  return `${out.join("\n")}
`;
}
function more(out, total, s) {
  if (total > LIST_LIMIT) out.push(s.dim(`  ${total - LIST_LIMIT} more; --json lists them all.`));
}
var trust = (i, s) => i.trust === "external" ? s.flag(`(${i.trust})`) : s.dim(`(${i.trust})`);
function firstSource(f) {
  return f.sources.find((x) => x.input.trust === "external") ?? f.sources[0];
}
function turnLabel(a, g) {
  return g.prompts.find((p) => p.promptId === a.promptId)?.label ?? "no turn";
}
function turnWords(a, g, max) {
  const p = g.prompts.find((x) => x.promptId === a.promptId);
  return p ? { label: p.label, yours: p.from === "you", text: clip(p.text, max) } : null;
}
function commitLines(c, r, s, out) {
  out.push(`  ${s.accent(short(c.sha))}  ${s.bold(`"${clip(c.subject, 80)}"`)}${c.merge ? s.dim(" (merge)") : ""}`);
  if (c.join.kind === "ambiguous") {
    out.push(`    ${s.grade("UNKNOWN")}${c.join.candidates} recorded git commits were running when git dated it, and git printed no commit line; neither is credited  ${s.dim("[R9]")}`);
    return;
  }
  if (c.join.kind === "none" || !c.action) {
    const why2 = c.join.kind === "joined" ? `made by ${callId(c.join.toolUseId)} in session ${sid(c.join.sessionId)}, past the session limit of this review` : "no recorded agent call made it (you, another tool, or a commit rebased or amended since)";
    out.push(`    ${s.grade("UNKNOWN")}${s.dim(why2)}`);
    return;
  }
  const g = r.graphs.get(c.join.sessionId);
  const how = c.join.via === "stdout" ? `${s.grade("DIRECT")}made by ${c.action.tool} ${callId(c.action.id)} \xB7 session ${sid(c.join.sessionId)} \xB7 seq ${c.action.preSeq}  ${s.dim("[R1]")}` : `${s.grade("LIKELY")}made by ${c.action.tool} ${callId(c.action.id)} \xB7 session ${sid(c.join.sessionId)} \xB7 seq ${c.action.preSeq}: the only recorded git commit running when git dated it  ${s.dim("[R9]")}`;
  out.push(`    ${how}`);
  const turn = turnWords(c.action, g, 70);
  const asked = c.explanation ? `   ${askedWords(c.explanation.requested.verdict, s)}` : "";
  if (turn) out.push(`             ${turnLine(turn, s)}${asked}`);
}
function turnLine(t, s) {
  return t.yours ? `turn ${t.label}: "${t.text}"` : `turn ${t.label}, ${s.dim("a background task report, not your words:")} "${t.text}"`;
}
function askedWords(v, s) {
  return v === "NAMED" ? s.dim(VERDICT_WORDS[v]) : v === "NOTHING_TO_MATCH" ? s.dim(VERDICT_WORDS[v]) : s.flag(VERDICT_WORDS[v]);
}
function fileLines(f, r, s, out) {
  out.push(`  ${s.bold(clip(f.path, 120))}  ${s.dim(fileState(f))}`);
  for (const w of f.writers) writerLines(w, r, s, out);
  if (f.moreWriters) out.push(s.dim(`             +${plural2(f.moreWriters, "more recorded call")} wrote this path`));
}
function writerLines(w, r, s, out) {
  const grade = s.grade(w.expected ? "POSSIBLE" : "LIKELY");
  if (!w.action) {
    out.push(`    ${grade}${callId(w.actionId)} \xB7 session ${sid(w.sessionId)}  ${s.dim("(session past the limit of this review; contrail why <path> explains it)")}  ${s.dim("[R7]")}`);
    return;
  }
  const g = r.graphs.get(w.sessionId);
  const what = w.action.tool === "Bash" ? ` ${clip(describe(w.action, g), 60)}` : "";
  const expected = w.expected ? s.dim(" \xB7 expected, not observed") : "";
  out.push(`    ${grade}${w.action.tool} ${callId(w.action.id)}${what} \xB7 session ${sid(w.sessionId)} \xB7 seq ${w.action.preSeq}${expected}  ${s.dim("[R7]")}`);
  const turn = turnWords(w.action, g, 80);
  const asked = w.explanation ? `   ${askedWords(w.explanation.requested.verdict, s)}` : "";
  out.push(`             ${turn ? turnLine(turn, s) : s.dim("no turn recorded for this call")}${asked}`);
  if (!w.explanation) {
    out.push(s.dim("             not explained: past the limit of this review; contrail why <path> explains it"));
    return;
  }
  const h = headline2(w.explanation, g);
  out.push(
    h ? `             ${s.grade(h.link.grade, 0).trim()} ${clip(h.token, 80)} \u2190 ${clip(where(h.link, h.input), 100)} ${trust(h.input, s)}` : `             ${s.grade("UNKNOWN", 0).trim()} ${s.dim(w.explanation.traces.length ? "no observed source for its values" : "nothing distinctive in it to trace")}`
  );
}
function limitNotes(r) {
  const notes = [];
  if (r.range.totalCommits > r.commits.length) notes.push(`only the newest ${r.commits.length} of ${r.range.totalCommits} commits are joined`);
  if (r.range.totalFiles > r.files.length) notes.push(`only ${r.files.length} of ${r.range.totalFiles} changed files are shown`);
  if (r.sessionsOmitted) notes.push(`${plural2(r.sessionsOmitted, "older session")} not loaded`);
  if (r.unexplained) notes.push(`${plural2(r.unexplained, "writing call")} not explained`);
  return notes.length ? [`limits reached: ${notes.join("; ")}`] : [];
}
function reviewJson(r) {
  const writer = (w) => {
    const g = r.graphs.get(w.sessionId);
    const p = w.action && g ? g.prompts.find((x) => x.promptId === w.action.promptId) : void 0;
    const h = w.explanation && g ? headline2(w.explanation, g) : null;
    return {
      session: w.sessionId,
      action: w.actionId,
      tool: w.action?.tool ?? null,
      seq: w.action?.preSeq ?? null,
      evidence: w.expected ? "expected" : "reported",
      grade: w.expected ? "POSSIBLE" : "LIKELY",
      rule: "R7",
      turn: p ? { label: p.label, from: p.from, text: p.text } : null,
      requested: w.explanation?.requested.verdict ?? null,
      headline: h ? { token: h.token, grade: h.link.grade, rule: h.link.rule, source: h.input.label, trust: h.input.trust, line: h.link.quote?.line ?? null } : null
    };
  };
  return {
    head: { sha: r.range.head, branch: r.range.branch },
    base: { name: r.range.base.name, given: r.range.base.given, mergeBase: r.range.base.mergeBase },
    searchedSince: new Date(r.floorSec * 1e3).toISOString(),
    counts: {
      commits: r.range.totalCommits,
      files: r.range.totalFiles,
      agentFiles: r.files.filter((f) => f.grade !== "UNKNOWN").length,
      sessions: r.graphs.size + r.sessionsOmitted,
      commitsJoined: r.commits.filter((c) => c.join.kind === "joined").length
    },
    external: r.external.map((x) => ({
      session: x.sessionId,
      action: x.action.id,
      tool: x.action.tool,
      files: x.files,
      token: x.trail.token.text,
      argPath: x.trail.token.argPath,
      steps: x.trail.steps.map(({ link, input }) => ({ token: link.token ?? null, grade: link.grade, rule: link.rule, source: input.label, origin: input.origin, trust: input.trust, line: link.quote?.line ?? null, quote: link.quote?.text ?? null }))
    })),
    sensitive: r.findings.map((f) => ({ session: f.action.scope.sessionId, action: f.action.id, kinds: f.kinds, requested: f.requested, externalUpstream: f.externalUpstream, sources: f.sources.map((x) => ({ grade: x.link.grade, token: x.link.token, source: x.input.label, trust: x.input.trust, line: x.link.quote?.line ?? null })) })),
    notNamed: r.notNamed.map((f) => f.path),
    commits: r.commits.map((c) => ({
      sha: c.sha,
      subject: c.subject,
      merge: c.merge,
      madeBy: c.join.kind === "joined" ? { session: c.join.sessionId, action: c.join.toolUseId, grade: c.join.via === "stdout" ? "DIRECT" : "LIKELY", rule: c.join.via === "stdout" ? "R1" : "R9", requested: c.explanation?.requested.verdict ?? null } : null,
      ambiguous: c.join.kind === "ambiguous" ? c.join.candidates : void 0
    })),
    files: r.files.map((f) => ({ path: f.path, commits: f.commits, uncommitted: f.uncommitted, grade: f.grade, rule: "R7", writers: f.writers.map(writer), moreWriters: f.moreWriters })),
    limits: { commitsShown: r.commits.length, filesShown: r.files.length, sessionsOmitted: r.sessionsOmitted, unexplained: r.unexplained }
  };
}
function mdCode(text, max) {
  const t = clip(text, max);
  return t ? `\`${t}\`` : "`(empty)`";
}
var escapeHtml2 = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
var htmlCode = (text, max) => `<code>${escapeHtml2(clip(text, max)) || "(empty)"}</code>`;
var safeId = (id) => id.replace(/[^\w-]/g, "").slice(0, 80);
var mdCall = (id) => `\`${callId(safeId(id))}\``;
var mdSession = (id) => `\`${sid(safeId(id))}\``;
var mdSha = (sha) => `\`${short(safeId(sha))}\``;
var MD_BUDGET = 6e4;
function renderReviewMarkdown(r, version) {
  const range = r.range;
  const head = range.branch ? mdCode(range.branch, 80) : `detached HEAD ${mdSha(range.head)}`;
  const top = [];
  top.push(`### Contrail review: ${head} against ${mdCode(range.base.name, 80)}`, "");
  top.push(
    "> [!NOTE]",
    "> Data provenance from Contrail's local record of Claude Code sessions, not a judgment of this change. It shows which files recorded agent calls wrote, the prompt each call ran under, and where values in them first entered the agent's context. It does not show the agent's reasons.",
    ""
  );
  top.push(`**${counts(r).join(" \xB7 ")}**`, "");
  top.push(`<sub>Merge-base ${mdSha(range.base.mergeBase)}${range.base.given ? "" : `, base chosen by default (the first of ${DEFAULT_BASES.map((b) => `\`${b}\``).join(", ")} that exists)`}. Agent changes: recorded writes to these paths in sessions active in this repository since ${when(r.floorSec)}, joined by path.${limitNotes(r).map((n) => ` ${n.charAt(0).toUpperCase()}${n.slice(1)}.`).join("")}</sub>`, "");
  top.push("#### Values from external content in this change", "");
  if (!r.external.length) top.push("None: no value in the agent's recorded writes or commits on this branch traces to web, MCP or dependency content.");
  for (const x of r.external.slice(0, LIST_LIMIT)) top.push(...externalMd(x));
  mdMore(top, r.external.length);
  top.push("");
  top.push(`#### Sensitive actions in these sessions (${r.findings.length} of ${r.actionsScanned} tool calls)`, "");
  if (!r.findings.length) top.push("None found.");
  for (const f of r.findings.slice(0, LIST_LIMIT)) {
    const g = r.graphs.get(f.action.scope.sessionId);
    const mark = f.externalUpstream ? "\u25B2" : f.requested === "NOT_NAMED" ? "\u25B3" : "\xB7";
    const status = STATUS_WORDS[f.action.status];
    top.push(`- ${mark} ${mdCode(describe(f.action, g), 140)}${status ? ` \xB7 ${status}` : ""} \xB7 ${f.kinds.join(", ")} \xB7 ${VERDICT_WORDS[f.requested]} \xB7 ${f.action.tool} ${mdCall(f.action.id)} in session ${mdSession(f.action.scope.sessionId)}`);
    const src = firstSource(f);
    if (src) top.push(`  - **${src.link.grade}** ${mdCode(src.link.token ?? "", 80)} from ${mdCode(where(src.link, src.input), 120)} (${src.input.trust})`);
  }
  mdMore(top, r.findings.length);
  if (r.findings.length) top.push("", "Marks: \u25B2 a value traces to web, MCP or dependency content; \u25B3 not named by you; \xB7 named by you.");
  top.push("");
  top.push("#### Changed without being named in your words", "");
  if (!r.notNamed.length) top.push("None: your words name a recorded writer of every agent-changed file that was explained.");
  for (const f of r.notNamed.slice(0, LIST_LIMIT)) {
    const w = f.writers.find((x) => x.explanation);
    top.push(`- ${mdCode(f.path, 120)} \xB7 ${w.action.tool} ${mdCall(w.actionId)} in session ${mdSession(w.sessionId)} \xB7 ${VERDICT_WORDS[w.explanation.requested.verdict]}`);
  }
  mdMore(top, r.notNamed.length);
  top.push("");
  top.push("#### Commits", "");
  if (!r.commits.length) top.push(`None between ${mdCode(range.base.name, 80)} and HEAD.`);
  for (const c of r.commits.slice(0, COMMIT_LIMIT)) top.push(commitMd(c, r));
  if (range.totalCommits > Math.min(r.commits.length, COMMIT_LIMIT)) top.push(`- ${range.totalCommits - Math.min(r.commits.length, COMMIT_LIMIT)} more; \`contrail review --json\` lists them.`);
  top.push("");
  const footer = [
    "---",
    `<sub>LIKELY, not DIRECT: the agent wrote that path while this branch was in progress; whether that exact change is what the diff holds is not observed. DIRECT is used only for joins Claude Code recorded, such as git's own commit line in a command's output. Text matches are LIKELY at best. The agent's own words are never evidence.</sub>`,
    "",
    `<sub>Blind spots: ${REVIEW_BLIND_SPOTS.join("; ")}. No observed source is not the same as no source.</sub>`,
    "",
    `<sub>Written by \`contrail review\` ${escapeHtml2(version)} from the local record on the author's machine; nothing was sent anywhere. Run \`contrail why <path>\` there for the full trail behind any file.</sub>`,
    ""
  ];
  const body = [];
  const agent = r.files.filter((f) => f.grade !== "UNKNOWN");
  const none = r.files.filter((f) => f.grade === "UNKNOWN");
  body.push(`#### Files with recorded agent changes (${agent.length})`, "");
  if (!agent.length) body.push("None.", "");
  let used = [...top, ...footer].join("\n").length + 2e3;
  let shown = 0;
  for (const f of agent) {
    const block = fileMd(f, r);
    if (used + block.length > MD_BUDGET) break;
    body.push(block);
    used += block.length;
    shown++;
  }
  if (shown < agent.length) body.push(`${agent.length - shown} more files did not fit; run \`contrail review\` locally for all of them.`, "");
  if (none.length) {
    body.push(`#### No recorded agent change (${none.length})`, "", "You, another process, or a session Contrail did not record.", "");
    let listed = 0;
    for (const f of none) {
      const line = `- ${mdCode(f.path, 160)} \xB7 ${fileState(f)}`;
      if (used + line.length > MD_BUDGET) break;
      body.push(line);
      used += line.length + 1;
      listed++;
    }
    if (listed < none.length) body.push(`- ${none.length - listed} more`);
    body.push("");
  }
  return `${[...top, ...body, ...footer].join("\n")}`;
}
function mdMore(out, total) {
  if (total > LIST_LIMIT) out.push(`- ${total - LIST_LIMIT} more; \`contrail review --json\` lists them all.`);
}
function externalMd(x) {
  const into = x.files.length ? ` in ${x.files.map((f) => mdCode(f, 100)).join(", ")}` : "";
  const steps = x.trail.steps.map(({ link: link2, input }, i) => `${i ? `; one step back, ${mdCode(link2.token ?? "", 80)} ` : ""}**${link2.grade}** [${link2.rule}] from ${mdCode(where(link2, input), 120)} (${input.trust})`);
  const lines = [`- \u25B2 ${mdCode(x.trail.token.text, 100)}${into} \xB7 ${x.action.tool} ${mdCall(x.action.id)} in session ${mdSession(x.sessionId)} \xB7 ${steps.join("")}`];
  const { link } = x.trail.steps.at(-1);
  if (link.quote?.text) lines.push(`  <br>line ${link.quote.line ?? "?"}: ${mdCode(link.quote.text, 140)}`);
  return lines;
}
function commitMd(c, r) {
  const head = `- ${mdSha(c.sha)} ${mdCode(c.subject, 100)}${c.merge ? " (merge)" : ""}`;
  if (c.join.kind === "ambiguous") return `${head} \xB7 **UNKNOWN** [R9]: ${c.join.candidates} recorded git commits were running when git dated it; neither is credited`;
  if (c.join.kind === "none" || !c.action) return `${head} \xB7 no recorded agent call made it`;
  const g = r.graphs.get(c.join.sessionId);
  const how = c.join.via === "stdout" ? "**DIRECT** [R1] made by" : "**LIKELY** [R9] made by";
  const turn = turnWords(c.action, g, 100);
  const said = turn ? ` \xB7 turn ${turn.label}${turn.yours ? "" : " (a background task report, not your words)"}: ${mdCode(turn.text, 100)}` : "";
  const asked = c.explanation ? ` \xB7 ${VERDICT_WORDS[c.explanation.requested.verdict]}` : "";
  return `${head} \xB7 ${how} ${c.action.tool} ${mdCall(c.action.id)} in session ${mdSession(c.join.sessionId)}${said}${asked}`;
}
function fileMd(f, r) {
  const first = f.writers[0];
  const verdict = f.writers.find((w) => w.explanation)?.explanation?.requested.verdict;
  const summary2 = [htmlCode(f.path, 120), f.grade, first?.action ? `${escapeHtml2(first.action.tool)} <code>${escapeHtml2(callId(safeId(first.actionId)))}</code>` : "", verdict ? VERDICT_WORDS[verdict] : ""].filter(Boolean).join(" \xB7 ");
  const lines = ["<details>", `<summary>${summary2}</summary>`, "", `- ${fileState(f)}`];
  for (const w of f.writers) {
    const g = r.graphs.get(w.sessionId);
    const grade = w.expected ? "POSSIBLE" : "LIKELY";
    if (!w.action || !g) {
      lines.push(`- **${grade}** [R7] ${mdCall(w.actionId)} in session ${mdSession(w.sessionId)} (session past the limit of this review)`);
      continue;
    }
    const what = w.action.tool === "Bash" ? ` ${mdCode(describe(w.action, g), 100)}` : "";
    const expected = w.expected ? ", expected, not observed" : "";
    const asked = w.explanation ? ` \xB7 ${VERDICT_WORDS[w.explanation.requested.verdict]}` : "";
    lines.push(`- **${grade}** [R7] ${w.action.tool} ${mdCall(w.action.id)}${what} in session ${mdSession(w.sessionId)}, seq ${w.action.preSeq}${expected}${asked}`);
    const turn = turnWords(w.action, g, 140);
    if (turn) lines.push(`  - Turn ${turn.label}${turn.yours ? "" : " (a background task report, not your words)"}: ${mdCode(turn.text, 140)}`);
    const h = w.explanation ? headline2(w.explanation, g) : null;
    if (h) lines.push(`  - Trail: **${h.link.grade}** [${h.link.rule}] ${mdCode(h.token, 80)} from ${mdCode(where(h.link, h.input), 120)}, ${originWording(h.input)}`);
    else if (w.explanation) lines.push(`  - Trail: **UNKNOWN** ${w.explanation.traces.length ? "no observed source for its values" : "nothing distinctive in it to trace"}`);
  }
  if (f.moreWriters) lines.push(`- ${plural2(f.moreWriters, "more recorded call")} wrote this path`);
  lines.push("", "</details>", "");
  return lines.join("\n");
}

// src/store/retention.ts
import { readFileSync as readFileSync4 } from "node:fs";
import { join as join6 } from "node:path";
var DEFAULTS = { retentionDays: 90, maxDbMb: 1024, storeContent: true, tripwire: true };
function loadConfig(dataDir) {
  let raw;
  try {
    raw = readFileSync4(join6(dataDir, "config.json"), "utf8");
  } catch {
    return { config: DEFAULTS, problem: null };
  }
  try {
    const c = JSON.parse(raw);
    const positive = (v, fallback) => typeof v === "number" && v > 0 ? v : fallback;
    return {
      config: {
        retentionDays: positive(c.retention_days, DEFAULTS.retentionDays),
        maxDbMb: positive(c.max_db_mb, DEFAULTS.maxDbMb),
        storeContent: c.store_content !== false,
        tripwire: c.tripwire !== false
      },
      problem: null
    };
  } catch (e) {
    return { config: DEFAULTS, problem: `config.json is not valid JSON (${e.message}); using defaults` };
  }
}
function prune(db, config, nowMs) {
  const cutoffUs = (nowMs - config.retentionDays * 864e5) * 1e3;
  let removed = 0;
  const drop = (sessionId) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (sessionId === null) db.run("DELETE FROM events WHERE session_id IS NULL AND captured_us < ?", cutoffUs);
      else db.run("DELETE FROM events WHERE session_id = ?", sessionId);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const old = db.all("SELECT session_id AS id FROM events WHERE session_id IS NOT NULL GROUP BY session_id HAVING MAX(captured_us) < ?", cutoffUs);
  for (const { id } of old) {
    drop(id);
    removed++;
  }
  drop(null);
  const limit = config.maxDbMb * 1024 * 1024;
  while (liveBytes(db) > limit) {
    const oldest = db.get(
      "SELECT session_id AS id FROM events WHERE session_id IS NOT NULL GROUP BY session_id ORDER BY MAX(captured_us) LIMIT 1"
    );
    if (!oldest) break;
    drop(oldest.id);
    removed++;
  }
  return { sessionsRemoved: removed };
}
function liveBytes(db) {
  const pages = db.get("PRAGMA page_count")?.page_count ?? 0;
  const free = db.get("PRAGMA freelist_count")?.freelist_count ?? 0;
  const size = db.get("PRAGMA page_size")?.page_size ?? 4096;
  return (pages - free) * size;
}

// src/store/schema.ts
var MIGRATIONS = [
  [
    `CREATE TABLE events (
       id          INTEGER PRIMARY KEY,
       spool_name  TEXT NOT NULL UNIQUE,
       captured_us INTEGER NOT NULL,
       session_id  TEXT,
       prompt_id   TEXT,
       agent_id    TEXT,
       hook_event  TEXT NOT NULL,
       tool_name   TEXT,
       tool_use_id TEXT,
       cwd         TEXT,
       repo_key    TEXT,
       payload     TEXT NOT NULL,
       parse_error TEXT
     )`,
    "CREATE INDEX events_session ON events (session_id, captured_us)",
    "CREATE INDEX events_tool_use ON events (tool_use_id)",
    "CREATE INDEX events_repo ON events (repo_key, captured_us)",
    `CREATE TABLE touches (
       event_id INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
       path     TEXT NOT NULL,
       kind     TEXT NOT NULL CHECK (kind IN ('read', 'write'))
     )`,
    "CREATE INDEX touches_path ON touches (path, kind)"
  ],
  [
    // v2: shell commands without bashEditDiff get "expected" file touches (R6). SQLite can't
    // alter a CHECK constraint, so the table is rebuilt and its rows copied across.
    `CREATE TABLE touches_v2 (
       event_id INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
       path     TEXT NOT NULL,
       kind     TEXT NOT NULL CHECK (kind IN ('read', 'write', 'expected'))
     )`,
    "INSERT INTO touches_v2 (event_id, path, kind) SELECT event_id, path, kind FROM touches",
    "DROP TABLE touches",
    "ALTER TABLE touches_v2 RENAME TO touches",
    "CREATE INDEX touches_path ON touches (path, kind)"
  ]
];
var SCHEMA_VERSION = MIGRATIONS.length;
function migrate(db) {
  db.exec("PRAGMA busy_timeout = 5000");
  useWal(db);
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("BEGIN IMMEDIATE");
  try {
    const version = db.get("PRAGMA user_version")?.user_version ?? 0;
    if (version > SCHEMA_VERSION) {
      throw new ContrailError(
        `This contrail.db (schema v${version}) is newer than this Contrail (v${SCHEMA_VERSION}). Update the plugin.`
      );
    }
    for (let v = version; v < SCHEMA_VERSION; v++) {
      for (const statement of MIGRATIONS[v]) db.exec(statement);
    }
    if (version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function useWal(db, attempts = 100) {
  for (let i = 1; ; i++) {
    try {
      if (db.get("PRAGMA journal_mode")?.journal_mode.toLowerCase() !== "wal") db.exec("PRAGMA journal_mode = WAL");
      return;
    } catch (e) {
      if (i >= attempts || !/locked|busy/i.test(e.message)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 + Math.floor(Math.random() * 30));
    }
  }
}

// src/store/sqlite.ts
async function openDb(path) {
  if (process.versions.bun) return openBun(path);
  let sqlite;
  try {
    sqlite = await import("node:sqlite");
  } catch {
    throw new ContrailError(
      `queries need Node 22.13+ or Bun, and this is Node ${process.versions.node}. Install either one, then run this again. Recording still works in the meantime.`
    );
  }
  const db = new sqlite.DatabaseSync(path);
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, ...params) => Number(db.prepare(sql).run(...params).changes),
    all: (sql, ...params) => db.prepare(sql).all(...params),
    get: (sql, ...params) => db.prepare(sql).get(...params),
    close: () => db.close()
  };
}
async function openBun(path) {
  const { Database } = await import("bun:sqlite");
  const db = new Database(path, { create: true });
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, ...params) => db.query(sql).run(...params).changes,
    all: (sql, ...params) => db.query(sql).all(...params),
    get: (sql, ...params) => db.query(sql).get(...params) ?? void 0,
    close: () => db.close()
  };
}

// src/version.ts
var VERSION = "0.4.0";

// src/cli.ts
var FILTERS = ["writes", "shell", "network", "mcp", "subagents", "instructions"];
var MAX_EXPLAINED = 300;
var OPTIONS = {
  json: { type: "boolean" },
  data: { type: "string" },
  "plugin-data": { type: "string" },
  stdin: { type: "boolean" },
  session: { type: "string" },
  limit: { type: "string" },
  all: { type: "boolean" },
  tree: { type: "boolean" },
  otel: { type: "boolean" },
  markdown: { type: "boolean" },
  output: { type: "string", short: "o" },
  "from-hook": { type: "boolean" },
  "from-skill": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  ...Object.fromEntries(FILTERS.map((f) => [f, { type: "boolean" }]))
};
var USAGE = `contrail ${VERSION}: the observable trail behind Claude Code actions

Usage:
  contrail why [<anything>]         the trail behind whatever you point at:
                                      nothing          the last thing the agent did
                                      src/app.ts       the latest agent change to that file
                                      src/app.ts:42    the call that last wrote that line (or 40-48)
                                      "npm install x"  the latest shell command containing it
                                      <commit sha>     what the commit holds, joined to agent changes
                                      toolu\u2026ALhq1      one tool call, by the id reports print
                                      jwt-decode       the latest call that used that value
  contrail blame <file> [--session <id>]
                                    each line of a file as it is now, with the recorded agent call
                                    that last wrote it, its turn and its trail
  contrail trace [--session <id>]   a session as a timeline, each side effect with its source
        [--writes | --shell | --network | --mcp | --subagents | --instructions | --tree]
                                    --tree: each action under the call whose output held its value
  contrail risks [--session <id> | --all]
                                    sensitive actions, those tracing to web or MCP content first
  contrail sessions [--limit N] [--all]
                                    recent sessions at a glance
  contrail export [<session> | last] [--otel]
                                    a session's recorded events as JSON, or as OpenTelemetry traces
  contrail report [<session> | last] [-o file.html]
                                    a session as one self-contained HTML page
  contrail find "<value>" [--all]   every recorded input that held a value, and every call that used it
  contrail review [<base>] [--markdown] [-o review.md]
                                    this branch's commits and uncommitted changes, joined to the agent
                                    calls behind them (base: the first of origin/HEAD, origin/main,
                                    origin/master, main, master); --markdown for a pull request,
                                    -o to save that markdown and print this view
  contrail statusline               one line for Claude Code's status bar (reads its JSON on stdin)
  contrail doctor                   check that recording and queries work
  contrail ingest                   move recorded events from the spool into the database
  contrail prune                    apply retention now and compact the database

Options:
  --json          machine-readable output (why, blame, trace, risks, sessions, find, review)
  --data <dir>    data directory (default: $CONTRAIL_HOME, $CLAUDE_PLUGIN_DATA, or the installed plugin's)
  --plugin-data <dir>
                  the plugin's data directory, used when $CONTRAIL_HOME is unset (the skills pass it)
  --stdin         read the why, find, blame or review argument from standard input (the skills use it)
  -h, --help      show this help
  -v, --version   show the version
`;
async function main(argv, io) {
  let flags;
  let positionals;
  try {
    const parsed = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
    flags = parsed.values;
    positionals = parsed.positionals;
  } catch (e) {
    io.err(`contrail: ${e.message}

${USAGE}`);
    return 2;
  }
  const [command, ...rest] = positionals;
  if (flags.version) {
    io.out(`${VERSION}
`);
    return 0;
  }
  if (flags.help || command === void 0 || command === "help") {
    io.out(USAGE);
    return 0;
  }
  const style = flags.json ? PLAIN : styleFor(io.env, io.isTTY ?? false);
  const commands = {
    why: (args) => why(args, flags, io, style),
    blame: (args) => blame(args, flags, io, style),
    trace: () => trace2(flags, io, style),
    risks: () => risks(flags, io, style),
    sessions: () => sessions(flags, io, style),
    export: (args) => exportSession(args, flags, io),
    report: (args) => report(args, flags, io),
    statusline: () => statusline(flags, io),
    tripwire: () => tripwire(flags, io),
    find: (args) => find(args, flags, io, style),
    review: (args) => review(args, flags, io, style),
    ingest: () => ingestCommand(flags, io),
    prune: () => pruneCommand(flags, io),
    doctor: () => doctor(flags, io)
  };
  const run = commands[command];
  if (!run) {
    io.err(`contrail: unknown command "${command}"

${USAGE}`);
    return 2;
  }
  try {
    return await run(rest);
  } catch (e) {
    if (flags["from-hook"]) return 0;
    const say = flags["from-skill"] ? io.out : io.err;
    if (e instanceof ContrailError) {
      say(`contrail: ${e.message}
`);
      return flags["from-skill"] ? 0 : 1;
    }
    say(`contrail: unexpected error. Please report it with this output.
${e.stack ?? String(e)}
`);
    return flags["from-skill"] ? 0 : 3;
  }
}
function prepareDataDir(dataDir) {
  mkdirSync(join7(dataDir, "spool"), { recursive: true, mode: 448 });
  try {
    chmodSync2(dataDir, 448);
  } catch {
  }
}
async function withStore(flags, io, use) {
  const dataDir = resolveDataDir(flags.data, io.env, io.home, flags["plugin-data"]);
  let db;
  try {
    prepareDataDir(dataDir);
    db = await openDb(join7(dataDir, "contrail.db"));
  } catch (e) {
    if (e instanceof ContrailError) throw e;
    throw new ContrailError(`Cannot use the data directory ${dataDir}: ${e.message}`);
  }
  try {
    migrate(db);
    const repoKeyOf = makeRepoKeyOf();
    const storeContent = loadConfig(dataDir).config.storeContent;
    const hashToken = contentHmac(dataDir, !storeContent);
    ingest(db, join7(dataDir, "spool"), repoKeyOf, Date.now(), storeContent ? void 0 : hashToken);
    return await use({ db, dataDir, repoKey: repoKeyOf(io.cwd), ...hashToken ? { hashToken } : {} });
  } finally {
    db.close();
  }
}
async function why(args, flags, io, s) {
  if (args[0] === "commit") return whyCommit(args.slice(1), flags, io, s);
  const target = parseTarget(flags.stdin ? [readStdin(io)] : args, io.cwd);
  if (target.kind === "command" && /^commit [0-9a-f]{7,40}$/i.test(target.text)) return whyCommit(target.text.split(" ").slice(1), flags, io, s);
  if (target.kind === "command" && isCommit(io.cwd, target.text)) return whyCommit([target.text], flags, io, s);
  if (target.kind === "line") return whyLine(target, flags, io, s);
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    let hit;
    let note;
    try {
      const found = findTarget(db, target, repoKey);
      hit = found;
      note = found.total > 1 ? `the latest of ${found.total} recorded matches` : void 0;
    } catch (e) {
      if (!(e instanceof ContrailError) || target.kind !== "command" && target.kind !== "path") throw e;
      const value = target.kind === "path" ? target.shown : target.text;
      const use = latestUse(db, value, repoKey, io.home, hashToken);
      if (!use) {
        throw new ContrailError(
          `Nothing recorded matches "${value}": no agent change to that file, no shell command containing it, and no call that used it. Contrail only sees sessions recorded since it was installed. Run /contrail:why with no argument for the last action.`
        );
      }
      hit = use;
      note = `the latest recorded call that used "${value}"${use.total > 1 ? ` (${use.total} calls in that session used it; contrail find lists them all)` : ""}`;
    }
    const graph = loadGraph(db, hit.sessionId, io.home, hashToken);
    const explanation = explain(hit.toolUseId, graph);
    if (flags.json) io.out(`${JSON.stringify(explanation, null, 2)}
`);
    else io.out(renderWhy(explanation, graph, note, s));
    return 0;
  });
}
function latestUse(db, value, repoKey, home, hashToken) {
  for (const row of recentSessions(db, repoKey, 50)) {
    const graph = loadGraph(db, row.id, home, hashToken);
    const uses = findValue(graph, value).filter((x) => x.use);
    const last = uses.at(-1)?.use;
    if (last) return { sessionId: row.id, toolUseId: last.action.id, total: uses.length };
  }
  return null;
}
async function whyCommit(args, flags, io, s) {
  const sha = args[0];
  if (!sha) throw new ContrailError("Usage: contrail why commit <sha>");
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const hit = findCommit(db, sha, io.cwd, repoKey);
    const graph = loadGraph(db, hit.sessionId, io.home, hashToken);
    const action = graph.actions.find((a) => a.id === hit.toolUseId);
    if (!action) throw new ContrailError(`The action that made commit ${sha} is missing from its session.`);
    const explanation = explain(action.id, graph);
    const files = commitFiles(hit.cwd, hit.commit.sha)?.map(realPath);
    const seqOf = (id) => graph.actions.find((a) => a.id === id)?.preSeq ?? 0;
    const shown = /* @__PURE__ */ new Map();
    const writes = graph.effects.filter((e) => e.kind === "file" && e.path).map((e) => {
      const path = realPath(e.path);
      shown.set(path, e.path);
      return { path, seq: seqOf(e.actionId), actionId: e.actionId, expected: e.evidence === "expected" };
    });
    const cwdReal = realPath(graph.env.cwd);
    const display = (file) => shown.get(file) ?? (graph.env.cwd && file.startsWith(`${cwdReal}/`) ? graph.env.cwd + file.slice(cwdReal.length) : file);
    const joined = files ? commitContains(
      action.preSeq,
      files,
      writes,
      graph.effects.filter((e) => e.kind === "commit" && e.actionId !== action.id && e.commit).map((e) => ({ seq: seqOf(e.actionId), files: (commitFiles(hit.cwd, e.commit.sha) ?? []).map(realPath) }))
    ).map((f) => {
      const file = display(f.file);
      if (!f.actionId) return { ...f, file };
      const writer = explain(f.actionId, graph);
      return { ...f, file, writer: { action: writer.action, named: writer.requested.verdict === "NAMED" } };
    }) : null;
    if (flags.json) {
      const madeBy = { action: action.id, grade: hit.via === "stdout" ? "DIRECT" : "LIKELY", rule: hit.via === "stdout" ? "R1" : "R9" };
      io.out(`${JSON.stringify({ commit: hit.commit, madeBy, requested: explanation.requested, files: joined }, null, 2)}
`);
    } else {
      io.out(renderCommit({ commit: hit.commit, action, explanation, files: joined, via: hit.via, commitSec: hit.commitSec }, graph, s));
    }
    return 0;
  });
}
async function whyLine(target, flags, io, s) {
  return withStore(flags, io, ({ db, hashToken }) => {
    const b = blameFile(db, target.path, target.shown);
    if (target.start > b.lines.length) {
      throw new ContrailError(`${target.shown} has ${b.lines.length} line${b.lines.length === 1 ? "" : "s"} now; there is no line ${target.start}.`);
    }
    const hit = b.lines.slice(target.start - 1, target.end).find((l) => l.call);
    if (!hit) throw new ContrailError(noLineWriter(target));
    const call = b.calls.find((c) => c.id === hit.call);
    const graph = loadGraph(db, call.sessionId, io.home, hashToken);
    const explanation = explain(call.id, graph);
    if (flags.json) {
      const line = { file: b.path, line: hit.line, call: call.id, grade: hit.grade, rule: "R10", match: hit.match, unambiguous: hit.unambiguous, writers: hit.writers, inFile: hit.inFile, byCall: hit.byCall };
      io.out(`${JSON.stringify({ line, ...explanation }, null, 2)}
`);
    } else {
      io.out(`${renderLineNote(target, hit, call, s)}
${renderWhy(explanation, graph, void 0, s)}`);
    }
    return 0;
  });
}
async function blame(args, flags, io, s) {
  const arg = unquote((flags.stdin ? readStdin(io) : args.join(" ")).trim());
  if (!arg) throw new ContrailError("Usage: contrail blame <file> [--session <id>] [--json]");
  const path = resolve7(io.cwd, arg);
  const shown = displayPath(path, io.cwd, io.home);
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const session = flags.session ? pickSession(db, flags.session, repoKey) : null;
    const b = blameFile(db, path, shown, session);
    explainCalls(db, b, io.home, hashToken);
    if (flags.json) io.out(`${JSON.stringify(blameJson(b), null, 2)}
`);
    else io.out(renderBlame(b, shown, s));
    return 0;
  });
}
async function trace2(flags, io, s) {
  const chosen = FILTERS.filter((f) => flags[f]);
  if (chosen.length > 1) throw new ContrailError(`Pick one filter: ${chosen.map((f) => `--${f}`).join(", ")}`);
  const filter = chosen[0] ?? null;
  if (flags.tree && filter) throw new ContrailError(`--tree shows the whole session; it does not combine with --${filter}.`);
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const graph = loadGraph(db, pickSession(db, flags.session, repoKey), io.home, hashToken);
    if (flags.tree) {
      const explanations2 = new Map(graph.actions.slice(0, MAX_EXPLAINED).map((a) => [a.id, explain(a.id, graph)]));
      const forest = trailForest(graph, explanations2);
      const omitted = graph.actions.length - explanations2.size;
      if (flags.json) io.out(`${JSON.stringify({ session: graph.sessionId, forest: forest.map(treeJson), omitted }, null, 2)}
`);
      else io.out(renderTree(graph, forest, omitted, s));
      return 0;
    }
    const explanations = /* @__PURE__ */ new Map();
    for (const a of graph.actions) {
      if (explanations.size >= MAX_EXPLAINED) break;
      if (!matchesFilter(a, graph, filter) || !EXPLAINED.has(kindForExplain(a.tool))) continue;
      explanations.set(a.id, explain(a.id, graph));
    }
    if (flags.json) io.out(`${JSON.stringify({ session: graph.sessionId, filter, explanations: [...explanations.values()] }, null, 2)}
`);
    else io.out(renderTrace(graph, explanations, filter, s));
    return 0;
  });
}
function treeJson(root) {
  const node = (n) => ({ action: n.action.id, tool: n.action.tool, seq: n.action.preSeq, token: n.token, grade: n.link?.grade ?? null, children: n.children.map(node) });
  return { kind: root.kind, source: root.source ? { id: root.source.id, label: root.source.label, trust: root.source.trust } : null, children: root.children.map(node) };
}
function kindForExplain(tool) {
  if (tool.startsWith("mcp__")) return "MCP";
  return { Edit: "EDIT", MultiEdit: "EDIT", NotebookEdit: "EDIT", Write: "WRITE", Bash: "SHELL", WebFetch: "WEB", WebSearch: "WEB", Agent: "AGENT", Task: "AGENT" }[tool] ?? "";
}
async function risks(flags, io, s) {
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const ids = flags.session ? [pickSession(db, flags.session, repoKey)] : recentSessions(db, repoKey, flags.all ? 1e4 : 20, flags.all === true).map((r) => r.id);
    const graphs = /* @__PURE__ */ new Map();
    let actions = 0;
    const findings = [];
    for (const id of ids) {
      const graph = loadGraph(db, id, io.home, hashToken);
      graphs.set(id, graph);
      actions += graph.actions.length;
      findings.push(...findingsFor(graph));
    }
    const ranked = rankFindings(findings);
    if (flags.json) {
      io.out(`${JSON.stringify(ranked.map((f) => ({ action: f.action.id, session: f.action.scope.sessionId, kinds: f.kinds, requested: f.requested, externalUpstream: f.externalUpstream, sources: f.sources.map((x) => ({ grade: x.link.grade, token: x.link.token, source: x.input.label, trust: x.input.trust, quote: x.link.quote })) })), null, 2)}
`);
    } else {
      io.out(renderRisks(ranked, { actions, sessions: ids.length }, graphs, s));
    }
    return 0;
  });
}
async function sessions(flags, io, s) {
  const limit = Number(flags.limit ?? 10);
  if (!Number.isInteger(limit) || limit < 1) throw new ContrailError("--limit takes a positive whole number.");
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const rows = recentSessions(db, repoKey, limit, flags.all === true);
    const summaries = rows.map((r) => {
      const graph = loadGraph(db, r.id, io.home, hashToken);
      return { ...r, graph, flagged: findingsFor(graph).filter((f) => f.externalUpstream).length };
    });
    if (flags.json) {
      io.out(`${JSON.stringify(summaries.map((x) => ({ id: x.id, lastUs: x.lastUs, cwd: x.cwd, turns: x.graph.prompts.length, toolCalls: x.graph.actions.length, flagged: x.flagged, firstPrompt: x.graph.prompts.find((p) => p.from === "you")?.text ?? null })), null, 2)}
`);
    } else {
      io.out(renderSessions(summaries, s));
    }
    return 0;
  });
}
async function exportSession(args, flags, io) {
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const id = pickSession(db, args[0] ?? flags.session, repoKey);
    if (flags.otel) {
      const graph = loadGraph(db, id, io.home, hashToken);
      const explanations = new Map(graph.actions.slice(0, MAX_EXPLAINED).map((a) => [a.id, explain(a.id, graph)]));
      io.out(`${JSON.stringify(toOtlp(graph, explanations, findingsFor(graph), VERSION))}
`);
      return 0;
    }
    const events = loadRows(db, id).map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
    io.out(`${JSON.stringify({ contrail: VERSION, schema: SCHEMA_VERSION, session: id, events }, null, 2)}
`);
    return 0;
  });
}
async function report(args, flags, io) {
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const id = pickSession(db, args[0] ?? flags.session, repoKey);
    const graph = loadGraph(db, id, io.home, hashToken);
    const explanations = new Map(graph.actions.slice(0, MAX_EXPLAINED).map((a) => [a.id, explain(a.id, graph)]));
    const html = renderReport({
      graph,
      explanations,
      findings: rankFindings(findingsFor(graph)),
      forest: trailForest(graph, explanations),
      omitted: graph.actions.length - explanations.size,
      version: VERSION,
      generatedAt: /* @__PURE__ */ new Date()
    });
    const path = flags.output;
    if (!path) {
      io.out(html);
      return 0;
    }
    writePrivate(path, html);
    io.out(`Wrote ${path}
`);
    return 0;
  });
}
async function find(args, flags, io, s) {
  const value = (flags.stdin ? readStdin(io) : args.join(" ")).trim();
  if (!value) throw new ContrailError('Usage: contrail find "<value>" [--all]');
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const sessions2 = flags.session ? [pickSession(db, flags.session, repoKey)] : recentSessions(db, repoKey, flags.all ? 500 : 50, flags.all === true).map((r) => r.id);
    const hits = sessions2.map((id) => {
      const graph = loadGraph(db, id, io.home, hashToken);
      return { graph, sightings: findValue(graph, value) };
    });
    if (flags.json) {
      const json = hits.filter((h) => h.sightings.length).map((h) => ({
        session: h.graph.sessionId,
        sightings: h.sightings.map(
          (x) => x.source ? { seq: x.seq, held: { source: x.source.input.label, trust: x.source.input.trust, origin: x.source.input.origin, line: x.source.line } } : { seq: x.seq, used: { action: x.use.action.id, tool: x.use.action.tool, argPath: x.use.argPath, sensitive: x.use.kinds } }
        )
      }));
      io.out(`${JSON.stringify({ value, sessions: json }, null, 2)}
`);
    } else {
      io.out(renderFind(value, hits, sessions2.length, s));
    }
    return 0;
  });
}
async function tripwire(flags, io) {
  try {
    const raw = readStdin(io);
    const payload = JSON.parse(raw);
    const sessionId = typeof payload.session_id === "string" ? payload.session_id : "";
    const toolUseId = typeof payload.tool_use_id === "string" ? payload.tool_use_id : "";
    if (payload.hook_event_name !== "PreToolUse" || !sessionId || !toolUseId) return 0;
    const notice = await withStore(flags, io, ({ db, dataDir, hashToken }) => {
      if (!loadConfig(dataDir).config.tripwire) return null;
      const rows = loadRows(db, sessionId, { later: true });
      if (!rows.some((r) => r.hook_event === "PreToolUse" && r.tool_use_id === toolUseId)) {
        rows.push({
          id: 0,
          spool_name: "tripwire",
          captured_us: Date.now() * 1e3,
          session_id: sessionId,
          prompt_id: typeof payload.prompt_id === "string" ? payload.prompt_id : null,
          agent_id: typeof payload.agent_id === "string" ? payload.agent_id : null,
          hook_event: "PreToolUse",
          tool_name: typeof payload.tool_name === "string" ? payload.tool_name : null,
          tool_use_id: toolUseId,
          cwd: typeof payload.cwd === "string" ? payload.cwd : null,
          // Capped and redacted exactly as ingest stores it, so a huge write costs no more here.
          payload: JSON.stringify(stored(payload, "PreToolUse")),
          parse_error: null
        });
      }
      const graph = buildGraph(rows, { home: io.home, user: basename7(io.home) }, hashToken);
      const action = graph.actions.find((a) => a.id === toolUseId);
      if (!action || !sensitivity(action).length) return null;
      const explanation = explain(action.id, graph);
      const finding = assess(explanation, graph);
      return finding?.externalUpstream ? renderTripwire(finding, explanation) : null;
    });
    if (notice) io.out(`${JSON.stringify({ systemMessage: redactString(notice) })}
`);
  } catch {
  }
  return 0;
}
async function review(args, flags, io, s) {
  const base = (flags.stdin ? readStdin(io) : args[0] ?? "").trim() || void 0;
  if (args.length > 1) throw new ContrailError("Usage: contrail review [<base>] [--markdown | --json] [-o review.md]");
  if (flags.json && flags.markdown) throw new ContrailError("Pick one of --json and --markdown.");
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const r = reviewBranch(db, { cwd: io.cwd, base, repoKey, home: io.home, ...hashToken ? { hashToken } : {} });
    const path = flags.output;
    if (path) {
      writePrivate(path, renderReviewMarkdown(r, VERSION));
    }
    if (flags.json) io.out(`${JSON.stringify(reviewJson(r), null, 2)}
`);
    else if (flags.markdown && !path) io.out(renderReviewMarkdown(r, VERSION));
    else io.out(renderReview(r, s));
    if (path) io.out(`
Wrote the markdown for a pull request description to ${path}
`);
    return 0;
  });
}
function writePrivate(path, text) {
  const tmp = join7(dirname3(path), `.${basename7(path)}.${process.pid}.tmp`);
  try {
    writeFileSync2(tmp, text, { mode: 384, flag: "wx" });
    renameSync(tmp, path);
  } catch (e) {
    rmSync2(tmp, { force: true });
    throw new ContrailError(`Cannot write ${path}: ${e.message}`);
  }
}
var readStdin = (io) => io.stdin ? io.stdin() : readFileSync5(0, "utf8");
async function statusline(flags, io) {
  const s = io.env.NO_COLOR ? PLAIN : COLOR;
  try {
    const input = JSON.parse(readStdin(io) || "{}");
    const sessionId = typeof input.session_id === "string" ? input.session_id : void 0;
    const line = await withStore(flags, { ...io, cwd: typeof input.cwd === "string" ? input.cwd : io.cwd }, ({ db, repoKey, hashToken }) => {
      if (!sessionId || !db.get("SELECT 1 FROM events WHERE session_id = ? LIMIT 1", sessionId)) return renderStatusline(null, [], s);
      const graph = loadGraph(db, pickSession(db, sessionId, repoKey), io.home, hashToken);
      return renderStatusline(graph, findingsFor(graph), s);
    });
    io.out(`${line}
`);
  } catch {
    io.out(`${s.dim("contrail")}
`);
  }
  return 0;
}
async function ingestCommand(flags, io) {
  const dataDir = resolveDataDir(flags.data, io.env, io.home, flags["plugin-data"]);
  prepareDataDir(dataDir);
  const db = await openDb(join7(dataDir, "contrail.db"));
  try {
    migrate(db);
    const { config } = loadConfig(dataDir);
    const r = ingest(db, join7(dataDir, "spool"), makeRepoKeyOf(), Date.now(), config.storeContent ? void 0 : contentHmac(dataDir, true));
    const { sessionsRemoved } = prune(db, config, Date.now());
    if (!flags["from-hook"]) {
      io.out(
        `ingested ${r.ingested} events (${r.duplicates} already stored, ${r.parseErrors} unparseable, ${r.staleTmpRemoved} stale temp files removed); pruned ${sessionsRemoved} sessions
`
      );
    }
    return 0;
  } finally {
    db.close();
  }
}
async function pruneCommand(flags, io) {
  return withStore(flags, io, ({ db, dataDir }) => {
    const { config, problem } = loadConfig(dataDir);
    if (problem) io.err(`contrail: ${problem}
`);
    const { sessionsRemoved } = prune(db, config, Date.now());
    db.exec("VACUUM");
    io.out(`removed ${sessionsRemoved} sessions (keeping ${config.retentionDays} days, up to ${config.maxDbMb} MB); database compacted
`);
    return 0;
  });
}
async function doctor(flags, io) {
  const versions = process.versions;
  io.out(`contrail ${VERSION} on ${versions.bun ? `bun ${versions.bun}` : `node ${process.versions.node}`}
`);
  return withStore(flags, io, ({ db, dataDir }) => {
    const backlog = readdirSync3(join7(dataDir, "spool")).filter((n) => n.endsWith(".json")).length;
    const stats = db.get(
      `SELECT COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions,
              SUM(parse_error IS NOT NULL) AS parseErrors, MAX(captured_us) AS last FROM events`
    );
    const { config, problem } = loadConfig(dataDir);
    const hook = captureTiming();
    const lines = [
      `data directory   ${dataDir}`,
      `schema           v${SCHEMA_VERSION}`,
      `events stored    ${stats.events} across ${stats.sessions} sessions`,
      `waiting in spool ${backlog}`,
      `unparseable      ${stats.parseErrors ?? 0}`,
      `last event       ${stats.last ? new Date(Math.floor(stats.last / 1e3)).toISOString() : "never"}`,
      `retention        ${config.retentionDays} days, up to ${config.maxDbMb} MB${problem ? ` (${problem})` : ""}`,
      `content          ${config.storeContent ? "stored as redacted text" : "stored as keyed hashes only (store_content: false)"}`,
      `launcher         ${existsSync3(join7(dataDir, "bin", "contrail")) ? join7(dataDir, "bin", "contrail") : "written at the next session start"}`,
      ...hook ? [`capture hook     ${hook} ms per event (median of 5)`] : [],
      stats.events === 0 && backlog === 0 ? "No events yet. Run a Claude Code session with the plugin enabled, then check again." : "Recording and queries work."
    ];
    io.out(`${lines.join("\n")}
`);
    return 0;
  });
}
function captureTiming() {
  let hook;
  try {
    hook = fileURLToPath(new URL("../hooks/capture.sh", import.meta.url));
  } catch {
    return null;
  }
  if (!existsSync3(hook)) return null;
  const dir = mkdtempSync(join7(tmpdir(), "contrail-doctor-"));
  try {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      spawnSync("sh", [hook], { input: '{"hook_event_name":"PreToolUse"}', env: { PATH: process.env.PATH ?? "", CONTRAIL_HOME: dir } });
      times.push(performance.now() - start);
    }
    return times.sort((a, b) => a - b)[2].toFixed(1);
  } finally {
    rmSync2(dir, { recursive: true, force: true });
  }
}

// src/main.ts
process.umask(63);
process.exitCode = await main(process.argv.slice(2), {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  cwd: process.cwd(),
  env: process.env,
  home: homedir2(),
  isTTY: process.stdout.isTTY === true
});
