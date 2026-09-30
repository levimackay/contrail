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
import { existsSync as existsSync3, mkdirSync, mkdtempSync, readdirSync as readdirSync3, readFileSync as readFileSync4, realpathSync as realpathSync3, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { basename as basename4, dirname as dirname2, join as join5 } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// src/engine/effects.ts
import { basename as basename2, isAbsolute as isAbsolute3, resolve as resolve3 } from "node:path";

// src/util.ts
import { isAbsolute, relative, resolve } from "node:path";
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
  const one = s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/`/g, "'").replace(/\s+/g, " ").trim();
  return one.length <= max ? one : one.slice(0, max - 1) + "\u2026";
}
function callId(id) {
  return id.length > 12 ? `${id.slice(0, 5)}\u2026${id.slice(-5)}` : id;
}

// src/engine/tokens.ts
var import_shell_quote = __toESM(require_shell_quote(), 1);
import { basename, dirname, isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";

// src/engine/text.ts
var INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;
var WORD_CHAR = /[a-z0-9_-]/;
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
    const before = hay[i - 1];
    const after = hay[i + needle.length];
    if ((before === void 0 || !WORD_CHAR.test(before)) && (after === void 0 || !WORD_CHAR.test(after))) return i;
  }
  return -1;
}
function lineOf(text, index) {
  const lineIndex = normalize(text).slice(0, Math.max(0, index)).split("\n").length - 1;
  const lines = text.split("\n");
  const raw = lines[lineIndex] ?? "";
  const prefixed = READ_PREFIX.exec(raw);
  if (prefixed) return { line: Number(prefixed[1]), text: prefixed[2].trim() };
  return { line: lines.length > 1 ? lineIndex + 1 : null, text: raw.trim() };
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
    const wrapper = basename(argv[0]);
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
var URL_RE = /https?:\/\/[^\s'"<>)\]]+/g;
var WORD_RE = /[A-Za-z0-9_@][A-Za-z0-9_\-./@:]*[A-Za-z0-9_]/g;
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
      const base = basename(abs);
      if (!GENERIC_BASENAMES.has(base.toLowerCase())) {
        if (base !== rel && passes(base)) push(base, "target", group, argPath);
        const stem = base.replace(/\.[^.]+$/, "");
        if (stem !== base && passes(stem)) push(stem, "target", group, argPath, true);
      }
      for (const seg of dirname(rel).split("/")) {
        if (seg && seg !== "." && seg !== "~" && !GENERIC_DIRS.has(seg.toLowerCase())) api.hint(seg, argPath);
      }
    },
    tokens: () => out
  };
  return api;
}
function words(text) {
  const found = [];
  const rest = text.replace(URL_RE, (url) => {
    found.push(hostPath(url));
    return " ";
  });
  for (const m of rest.matchAll(WORD_RE)) found.push(m[0]);
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
    const prog = basename(argv[0]);
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
    if (basename2(words2[0] ?? "") !== "git") return false;
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
    const prog = basename2(first === "sudo" ? args.shift() ?? "" : first);
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
  const { line, text } = lineOf(input.text, index);
  return { ref: input.ref, line, text: input.hashed ? "" : text };
}

// src/engine/requested.ts
var NEGATOR = /(?<![\w./-])(?:not|never|no|without|avoid|stop|skip|instead of|rather than)(?![\w-])|n't(?![\w-])/i;
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
      if (hit) latest2 = { sentence: s, token: hit, strong: !hit.derived };
    }
    if (latest2) kept.push(latest2);
  }
  if (kept.length === 0) return { verdict: "NOT_NAMED", grade: "UNKNOWN", searched };
  const negated = kept.find((k) => NEGATOR.test(k.sentence.text));
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
var wordCache = /* @__PURE__ */ new WeakMap();
var WORD_RUN = /[a-z0-9_-]{1,256}/g;
function findInInput(i, needle, hashToken) {
  if (i.hashed) {
    const hashedNeedle = hashToken ? hashNeedle(needle, hashToken) : null;
    if (hashedNeedle === null) return -1;
    needle = hashedNeedle;
  }
  let words2 = wordCache.get(i);
  if (!words2) {
    words2 = new Set(normalizedText(i).match(WORD_RUN) ?? []);
    wordCache.set(i, words2);
  }
  for (const w of needle.match(WORD_RUN) ?? []) {
    if (w.length < 256 && !words2.has(w)) return -1;
  }
  return findNormalized(normalizedText(i), needle);
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
function sensitivity(action) {
  const kinds = /* @__PURE__ */ new Set();
  if (action.tool === "Bash") {
    const cmd = str(action.input, "command") ?? "";
    if (CREDENTIAL_PATH.test(cmd) || DUMPS_ENV.test(cmd)) kinds.add("credentials");
    if (RUNS_REMOTE_CODE.test(cmd)) kinds.add("runs remote code");
    if (NETWORK.test(cmd)) kinds.add("network");
    if (INSTALL.test(cmd)) kinds.add("install");
    if (DESTRUCTIVE.test(cmd)) kinds.add("destructive");
  } else if (["Read", "Edit", "MultiEdit", "Write"].includes(action.tool)) {
    if (CREDENTIAL_PATH.test(str(action.input, "file_path") ?? "")) kinds.add("credentials");
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
    const { line, text } = lineOf(input.text, index);
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
  return /(^|[\s;&|(/])(bin\/contrail|contrail)\s+(why|find|trace|risks|sessions|report|export|doctor|statusline)\b/.test(command);
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

// src/ingest/content.ts
import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var STRUCTURE = /* @__PURE__ */ new Set(["filePath", "agentId", "status", "isAsync", "success", "commandName", "code", "url", "interrupted", "isImage", "noOutputExpected", "type", "bashEditDiff", "resolvedModel", "description"]);
var COMMIT_LINE2 = /^\[[^\]\n]{1,200}\] [^\n]{0,300}$/m;
var TASK_HEAD = /^\s*<task-notification>[\s\S]{0,4000}?<\/summary>/;
function contentHmac(dataDir, create) {
  const path = join(dataDir, "content.key");
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

// src/ingest/ingest.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync as readFileSync2, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join as join2 } from "node:path";

// src/ingest/redact.ts
var tag = (id) => `[REDACTED:${id}]`;
var PLACEHOLDER = /^(?:\$\{?[A-Za-z_]\w*\}?|<[^>]*>|x{3,}|\*{3,}|\.{3}|changeme|your[-_a-z]*)$/i;
var CODE_REF = /^(?:[A-Za-z_][\w.]*(?:\(.*\)|\[.*\]|\[)|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+|\d{1,6})$/;
var namesSecret = (v) => PLACEHOLDER.test(v) || CODE_REF.test(v) || v.startsWith("[REDACTED");
var SECRET_NAME = /secret|token|passw(?:or)?d|pass(?:phrase)?(?![a-z])|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization|cookie/i;
var RULES = [
  {
    id: "private-key",
    // Unterminated keys (truncated output) take only whole base64 lines, so the text after them survives.
    re: /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----(?:[\s\S]{0,65536}?-----END [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----|(?:\r?\n[A-Za-z0-9+/=]{1,128}(?=\r?\n|$)){0,1024})/g
  },
  { id: "aws-access-key", re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { id: "github-token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { id: "gitlab-token", re: /\bglpat-[A-Za-z0-9_-]{20,64}/g },
  { id: "npm-token", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: "huggingface-token", re: /\bhf_[A-Za-z0-9]{30,64}\b/g },
  { id: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,256}/g },
  {
    id: "openai-key",
    re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,256}/g,
    // Real keys mix digits and capitals; a kebab-case CSS class does not.
    replace: (m) => /\d/.test(m) && /[A-Z]/.test(m) ? tag("openai-key") : m
  },
  { id: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,256}/g },
  {
    id: "webhook-url",
    re: /https:\/\/(?:hooks\.slack\.com\/services|(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks)\/[A-Za-z0-9/_-]{8,256}/g
  },
  { id: "stripe-key", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,256}/g },
  { id: "stripe-webhook-secret", re: /\bwhsec_[A-Za-z0-9]{24,256}/g },
  { id: "sendgrid-key", re: /\bSG\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{16,128}/g },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}/g },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,8192}\.eyJ[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{8,8192}/g },
  { id: "azure-sas", re: /([?&]sig=)[A-Za-z0-9%+/=]{16,512}/g, replace: (_m, prefix) => `${prefix}${tag("azure-sas")}` },
  {
    id: "auth-header",
    re: /\b((?:proxy-)?authorization|x-api-key)(["']?\s{0,4}[:=]\s{0,4}["']?)((?:bearer|basic|token)\s{1,4})?([^\s"',;]{1,4096})/gi,
    replace: (m, name, sep, scheme, value) => PLACEHOLDER.test(value) || value.startsWith("[REDACTED") ? m : `${name}${sep}${scheme ?? ""}${tag("auth-header")}`
  },
  {
    id: "cookie",
    re: /\b((?:set-)?cookie)(\s{0,4}:\s{0,4})[^\r\n]{1,4096}/gi,
    replace: (_m, name, sep) => `${name}${sep}${tag("cookie")}`
  },
  {
    id: "url-password",
    // Greedy up to the last @ so a password containing @ is fully removed; container digests are not credentials.
    re: /\b([a-z][a-z0-9+.-]{0,31}:\/\/[^\s:@/]{0,256}:)([^\s/]{1,256})@(?!sha256:)/gi,
    replace: (m, prefix, password) => PLACEHOLDER.test(password) ? m : `${prefix}${tag("url-password")}@`
  },
  {
    id: "cli-password",
    re: /((?:^|\s)--(?:password|passwd|pass)(?:=|\s{1,4}))(["']?)([^\s"']{1,256})/g,
    replace: (m, flag, quote2, value) => PLACEHOLDER.test(value) ? m : `${flag}${quote2}${tag("cli-password")}`
  },
  {
    id: "cli-password",
    re: /((?:^|\s)(?:-u|--user)(?:=|\s{1,4})["']?[^\s:"']{1,128}:)([^\s"']{1,256})/g,
    replace: (_m, prefix) => `${prefix}${tag("cli-password")}`
  },
  {
    id: "cli-password",
    re: /(\bmysql(?:dump|admin)?\b[^\n]{0,200}?\s-p)([^\s-][^\s]{2,255})/g,
    replace: (_m, prefix) => `${prefix}${tag("cli-password")}`
  },
  {
    id: "env-secret",
    re: /\b([A-Za-z0-9_.-]{0,64}(?:secret|token|passw(?:or)?d|pass(?:phrase)?(?![a-z])|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_]{0,64})(["']?\s{0,4}[:=]\s{0,4})(?:(["'])([^"'\n]{6,512})\3|([^\s"',;]{6,512}))/gi,
    replace: (m, key, sep, quote2, quoted, bare) => {
      const value = quoted ?? bare ?? "";
      if (namesSecret(value)) return m;
      return quote2 ? `${key}${sep}${quote2}${tag("env-secret")}${quote2}` : `${key}${sep}${tag("env-secret")}`;
    }
  }
];
function redactString(s) {
  let out = s;
  for (const rule of RULES) {
    const replace = rule.replace ?? (() => tag(rule.id));
    out = out.replace(rule.re, replace);
  }
  return out;
}
function redactValue(value, key = "") {
  if (typeof value === "string") {
    if (key && SECRET_NAME.test(key) && value.length >= 6 && !namesSecret(value)) return tag("secret-field");
    return redactString(value);
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (value && typeof value === "object") {
    const o = value;
    const pairName = typeof o.key === "string" ? o.key : typeof o.name === "string" ? o.name : "";
    const secretPair = pairName !== "" && SECRET_NAME.test(pairName);
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, redactValue(v, secretPair && k === "value" ? "secret" : k)])
    );
  }
  return value;
}

// src/ingest/ingest.ts
var STRING_CAP = 256 * 1024;
var STALE_TMP_MS = 60 * 60 * 1e3;
var WRITE_TOOLS = /* @__PURE__ */ new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
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
    const file = join2(spoolDir, name);
    if (name.startsWith(".tmp.")) {
      if (removeIfStale(file, now)) report2.staleTmpRemoved++;
      continue;
    }
    if (!name.endsWith(".json")) continue;
    let raw;
    let mtimeNs;
    try {
      mtimeNs = statSync(file, { bigint: true }).mtimeNs;
      raw = readFileSync2(file, "utf8");
    } catch {
      continue;
    }
    const capturedUs = Number(mtimeNs / 1000n);
    let row;
    try {
      row = toRow(name, raw, capturedUs, repoKeyOf, hmac);
    } catch (e) {
      row = failedRow(capturedUs, `${name}: ${e.message}`);
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
    return { ...failedRow(capturedUs, `${name}: ${e.message}`), payload: JSON.stringify({ raw: redactString(capString(raw)) }) };
  }
  const p = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed };
  const hookEvent = str(p, "hook_event_name") ?? "unknown";
  if (hookEvent === "InstructionsLoaded") attachInstructionText(p, capturedUs);
  if (hookEvent === "PostToolUse" && str(p, "tool_name") === "Skill") attachSkillText(p, capturedUs);
  const cwd = str(p, "cwd") ?? null;
  return {
    capturedUs,
    sessionId: str(p, "session_id") ?? null,
    promptId: str(p, "prompt_id") ?? null,
    agentId: str(p, "agent_id") ?? null,
    hookEvent,
    toolName: str(p, "tool_name") ?? null,
    toolUseId: str(p, "tool_use_id") ?? null,
    cwd,
    repoKey: cwd ? repoKeyOf(cwd) : null,
    payload: JSON.stringify(stored(p, hookEvent, hmac)),
    parseError: null,
    touches: hookEvent === "PostToolUse" ? touchesOf(p, cwd ?? "") : []
  };
}
function stored(p, hookEvent, hmac) {
  const clean = redactValue(capValue(dropBulky(p)));
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
  const candidates = [join2(homedir(), ".claude", "skills", name, "SKILL.md"), ...cwd ? [join2(cwd, ".claude", "skills", name, "SKILL.md")] : []];
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
  if (WRITE_TOOLS.has(tool)) {
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
function dropBulky(value, key = "") {
  if (typeof value === "string") {
    if (key === "originalFile" || key === "base64") {
      return `[contrail: dropped ${key}, ${value.length} bytes, sha256 ${sha256(value).slice(0, 16)}]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => dropBulky(v));
  if (value && typeof value === "object") {
    const isBase64Block = value.type === "base64";
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, dropBulky(v, isBase64Block && k === "data" ? "base64" : k)])
    );
  }
  return value;
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

// src/ingest/repo.ts
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
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
    return out ? realpathSync(out) : null;
  } catch {
    return null;
  }
}

// src/paths.ts
import { existsSync, readdirSync as readdirSync2 } from "node:fs";
import { join as join3 } from "node:path";
function resolveDataDir(flag, env, home, pluginData) {
  if (flag) return flag;
  if (env.CONTRAIL_HOME) return env.CONTRAIL_HOME;
  if (pluginData) return pluginData;
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;
  const base = join3(home, ".claude", "plugins", "data");
  const hits = existsSync(base) ? readdirSync2(base).filter((n) => n === "contrail" || n.startsWith("contrail-")) : [];
  if (hits.length === 1) return join3(base, hits[0]);
  if (hits.length === 0) {
    throw new ContrailError("No recorded data found. Is the Contrail plugin installed? Set CONTRAIL_HOME to point at a data directory.");
  }
  const list = hits.map((h) => `  ${join3(base, h)}`).join("\n");
  throw new ContrailError(`Found ${hits.length} Contrail data directories:
${list}
Set CONTRAIL_HOME to pick one.`);
}

// src/query/commit.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { resolve as resolve4 } from "node:path";
function findCommit(db, sha, cwd, repoKey) {
  const wanted = sha.toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(wanted)) throw new ContrailError(`"${sha}" is not a commit sha (7 to 40 hex characters).`);
  const rows = db.all(
    `SELECT session_id AS sessionId, tool_use_id AS toolUseId, cwd, payload FROM events
      WHERE hook_event = 'PostToolUse' AND tool_name = 'Bash' AND instr(payload, ?) > 0
      ORDER BY captured_us DESC`,
    wanted.slice(0, 7)
  );
  for (const row of rows) {
    const p = JSON.parse(row.payload);
    const commit = parseCommitSha(str(p.tool_input, "command") ?? "", str(p.tool_response, "stdout") ?? toText(p.tool_response));
    if (commit && (wanted.startsWith(commit.sha) || commit.sha.startsWith(wanted))) {
      return { sessionId: row.sessionId, toolUseId: row.toolUseId, cwd: row.cwd, commit, via: "stdout" };
    }
  }
  const info = cwd ? commitInfo(cwd, wanted) : null;
  if (info) {
    const { match, candidates } = commitByTime(info.sec, bashCallsBetween(db, info.sec * 1e6 - WINDOW_US, info.sec * 1e6 + WINDOW_US, repoKey));
    if (match) return { sessionId: match.sessionId, toolUseId: match.toolUseId, cwd: match.cwd, commit: info.commit, via: "time", commitSec: info.sec };
    if (candidates > 1) {
      throw new ContrailError(`${candidates} recorded git commits were running when git dated commit ${sha}, and git printed no commit line, so Contrail cannot tell which one made it.`);
    }
  }
  throw new ContrailError(`No recorded agent action made commit ${sha}. Contrail sees commits made by Claude Code through its shell tool.`);
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
function commitFiles(cwd, sha) {
  try {
    const run = (args) => execFileSync2("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const top = run(["rev-parse", "--show-toplevel"]);
    return run(["show", "--name-only", "--format=", "--no-renames", sha]).split("\n").filter(Boolean).map((f) => resolve4(top, f));
  } catch {
    return null;
  }
}

// src/query/sessions.ts
import { basename as basename3 } from "node:path";

// src/graph/build.ts
var DEPENDENCY_DIR = /(^|\/)(node_modules|vendor|\.venv|venv|site-packages)(\/|$)/;
var WRITE_TOOLS2 = /* @__PURE__ */ new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
var NO_OUTPUT_TOOLS = /* @__PURE__ */ new Set([...WRITE_TOOLS2, "TodoWrite", "ExitPlanMode"]);
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
    const seq = index + 1;
    const p = parsePayload(row.payload);
    const scope = { sessionId: row.session_id ?? "", agentId: row.agent_id };
    const id = row.tool_use_id;
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
      case "PostToolBatch":
        for (const call of arr(p.tool_calls)) {
          const useId = str(call, "tool_use_id");
          if (useId) modelSaw.set(useId, { seq, text: toText(field(call, "tool_response")) });
        }
        break;
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
    tool: row.tool_name ?? str(p, "tool_name") ?? "unknown",
    input: obj(p, "tool_input") ?? {},
    response: null,
    preSeq: seq,
    postSeq: null,
    status: "pending",
    mcpServer: mcp ? { name: str(mcp, "name") ?? "", source: str(mcp, "source") ?? "" } : null
  };
}
var TASK_NOTIFICATION = /^\s*<task-notification>/;
var tag2 = (text, name) => new RegExp(`<${name}>([^<]{1,200})</${name}>`).exec(text)?.[1]?.trim() ?? null;
function taskNotification(text) {
  if (!TASK_NOTIFICATION.test(text)) return null;
  const head = text.slice(0, 4e3);
  return {
    summary: tag2(head, "summary") ?? "a background task finished",
    toolUseId: tag2(head, "tool-use-id"),
    taskId: tag2(head, "task-id")
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
    const where = hostPath(str(a.input, "url") ?? "");
    return { origin: "web", trust: "external", ref: where, label: `WebFetch of ${where}` };
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
  if (WRITE_TOOLS2.has(a.tool)) {
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

// src/query/sessions.ts
function recentSessions(db, repoKey, limit, all = false) {
  const query = (where, ...params) => db.all(
    `SELECT session_id AS id, MAX(captured_us) AS lastUs, MAX(cwd) AS cwd FROM events
        WHERE session_id IS NOT NULL ${where}
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
  if (!matches.length) throw new ContrailError(`No session starts with "${prefix}". Run contrail sessions to list them.`);
  throw new ContrailError(`"${prefix}" matches several sessions:
${matches.map((m) => `  ${m.id}`).join("\n")}
Use more characters.`);
}
function loadRows(db, sessionId) {
  return db.all("SELECT * FROM events WHERE session_id = ? ORDER BY captured_us, spool_name", sessionId);
}
function loadGraph(db, sessionId, home, hashToken) {
  return buildGraph(loadRows(db, sessionId), { home, user: basename3(home) }, hashToken);
}

// src/query/target.ts
import { existsSync as existsSync2, realpathSync as realpathSync2 } from "node:fs";
import { resolve as resolve5 } from "node:path";
var SHORT_CALL = /^([A-Za-z0-9_-]{1,40})(?:…|\.\.\.)([A-Za-z0-9_-]{1,40})$/;
var FULL_CALL = /^toolu_[A-Za-z0-9_-]{8,200}$/;
function parseTarget(args, cwd) {
  const text = unquote(args.join(" ").trim());
  if (!text) throw new ContrailError('Usage: contrail why <path | "command text" | call id | last>');
  if (text === "last") return { kind: "last" };
  const abs = resolve5(cwd, text);
  const short = SHORT_CALL.exec(text);
  if (short && !existsSync2(abs)) return { kind: "call", prefix: short[1], suffix: short[2], shown: text };
  if (FULL_CALL.test(text) && !existsSync2(abs)) return { kind: "call", prefix: text, suffix: "", shown: text };
  if (!/\s/.test(text) && (existsSync2(abs) || /\/|\.[A-Za-z0-9]{1,8}$/.test(text))) return { kind: "path", path: abs, shown: text };
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
    const real = existsSync2(target.path) ? realpathSync2(target.path) : target.path;
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
    if (!rows.length) throw new ContrailError("No recorded actions in this repository yet.");
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
  out.push(`${s.bold(a.tool)}  ${s.bold(describe(a, g))}`);
  out.push(
    s.dim(
      `  session ${a.scope.sessionId.slice(0, 8)} \xB7 ${prompt ? `turn ${prompt.label}` : "turn not recorded"} \xB7 ${callId(a.id)} \xB7 seq ${a.preSeq} \xB7 ${a.scope.agentId ? `subagent ${callId(a.scope.agentId)}` : "main agent"}${a.status === "ok" ? "" : ` \xB7 ${a.status.toUpperCase()}`}`
    )
  );
  if (note) out.push(s.dim(`  ${note}`));
  out.push("");
  out.push(...requestedLines(e, s));
  out.push(
    !prompt ? `Turn        ${s.grade("UNKNOWN")}no prompt was recorded for this action` : prompt.from === "task" ? `Turn        ${s.grade("DIRECT")}ran while handling ${prompt.label}, a background task report, not your words: "${clip(prompt.text, 60)}"  ${s.dim("[R1]")}` : `Turn        ${s.grade("DIRECT")}ran while answering ${prompt.label}: "${clip(prompt.text, 70)}"  ${s.dim("[R1]")}`
  );
  out.push("", s.bold(HEADING));
  const best = bestPerGroup(e.traces);
  const credited = new Set(best.filter((t) => t.token.role !== "hint").flatMap((t) => t.links.filter((l) => l.grade !== "UNKNOWN").map((l) => l.to)));
  const shown = best.filter((t) => t.token.role !== "hint" || t.links.some((l) => l.grade !== "UNKNOWN" && !credited.has(l.to)));
  const found = shown.filter((t) => t.links.some((l) => l.grade !== "UNKNOWN"));
  const unfound = shown.filter((t) => !found.includes(t));
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
    const width = Math.max(...effects.map((x) => x.fx.target.length));
    for (const { l, fx } of effects) {
      out.push(`  ${s.grade(l.grade)}${fx.target.padEnd(width)}  ${effectWording(fx)}  ${s.dim(`[${l.rule} ${fx.evidence}]`)}`);
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
    const where = l.quote?.line != null ? `${clip(src.label, 100)}:${l.quote.line}` : clip(src.label, 100);
    out.push(`${pad3}  ${s.grade(l.grade)}${sourceWording(l, where)}  ${s.dim(`[${l.rule}]`)}`);
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
function sourceWording(l, where) {
  if (l.note === "you supplied it") return `you supplied it: ${where}`;
  if (l.note === "also in") return `also in ${where}`;
  if (l.grade === "LIKELY") return `only observed in ${where}`;
  if (l.firstSeen) return `could be from ${where} (seen first)`;
  if (l.note) return `${where} (${l.note})`;
  return `could be from ${where}`;
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
      return [`Requested?  ${s.flag("NOT NAMED")} (the agent chose this). ${yours} name it.  ${tag3("R8")}`];
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
    const where = str(a.input, "path");
    return clip(`${JSON.stringify(str(a.input, "pattern") ?? "")}${where ? ` in ${displayPath(where, g.env.cwd, g.env.home)}` : ""}`, 90);
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
  const sessionId = g.actions[0]?.scope.sessionId ?? g.prompts[0]?.promptId ?? "";
  const inputs = new Map(g.inputs.map((i) => [i.id, i]));
  out.push(`${s.bold("Session")} ${sessionId.slice(0, 8)}  ${s.dim(clip(g.env.cwd, 120))}`);
  out.push(
    s.dim(
      `${g.prompts.length} turn${g.prompts.length === 1 ? "" : "s"} \xB7 ${g.actions.length} tool calls \xB7 ${g.effects.filter((e) => e.kind === "file").length} file effects` + (filter ? ` \xB7 showing --${filter}` : "")
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
  const head = headline2(e);
  const link = head?.links.find((l) => l.grade !== "UNKNOWN");
  const src = link?.to ? inputs.get(link.to) : void 0;
  const from = src && link ? `${s.grade(link.grade, 0).trim()} ${clip(head.token.text, 80)} \u2190 ${clip(src.label, 100)}${link.quote?.line != null ? `:${link.quote.line}` : ""} ${src.trust === "external" ? s.flag(`(${src.trust})`) : s.dim(`(${src.trust})`)}` : e.traces.length ? `${s.grade("UNKNOWN", 0).trim()} ${s.dim("no observed source")}` : "";
  const asked = e.requested.verdict === "NAMED" ? s.dim("named by you") : e.requested.verdict === "NOT_NAMED" ? s.flag("not named by you") : "";
  const detail = [from, asked].filter(Boolean).join("   ");
  if (detail) lines.push(`         ${s.dim("\u21B3")} ${detail}`);
  const effects = g.effects.filter((x) => x.actionId === a.id && x.kind !== "network");
  if (effects.length && kind === "SHELL") {
    const shown = effects.slice(0, 4).map((x) => x.target).join(", ") + (effects.length > 4 ? `, +${effects.length - 4} more` : "");
    const how = effects.every((x) => x.evidence === "expected") ? s.dim(" (expected, not observed)") : "";
    lines.push(`         ${s.dim("\u2192")} ${shown}${how}`);
  }
  return lines;
}
var headline2 = headlineTrace;
function renderTree(g, forest, omitted, s = PLAIN) {
  const out = [];
  const sessionId = g.actions[0]?.scope.sessionId ?? "";
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
    const sessionId = g.actions[0]?.scope.sessionId ?? "";
    const first = g.prompts.find((p) => p.from === "you");
    out.push("", `${s.bold("Session")} ${sessionId.slice(0, 8)}  ${s.dim(first ? `"${clip(first.text, 70)}"` : "")}`);
    let seenSource = false;
    for (const hit of sightings) {
      if (hit.source) {
        const src = hit.source.input;
        const where = `${clip(src.label, 90)}${hit.source.line != null ? `:${hit.source.line}` : ""}`;
        const trust = src.trust === "external" ? s.flag(`(${src.trust})`) : s.dim(`(${src.trust})`);
        out.push(`  ${s.dim(pad2(`${hit.seq}`, 4))} ${pad2("HELD", 6)} ${where}  ${trust}${seenSource ? "" : `  ${s.accent("first seen")}`}`);
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
    const count = (kinds) => g.actions.filter((a) => kinds.includes(kindOf(a))).length;
    const subagents = new Set(g.actions.map((a) => a.scope.agentId).filter(Boolean)).size;
    return [
      x.id.slice(0, 8),
      localTime(x.lastUs),
      `${g.prompts.length}`,
      `${count(["READ", "SEARCH"])}`,
      `${new Set(g.effects.filter((e) => e.kind === "file").map((e) => e.target)).size}`,
      `${count(["SHELL"])}`,
      `${count(["WEB", "MCP"])}`,
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
    `${s.bold("Sensitive actions")} ${s.dim(`(${findings.length} of ${scanned.actions} tool calls in ${scanned.sessions} session${scanned.sessions === 1 ? "" : "s"})`)}`
  );
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
      const where = `${clip(input.label, 100)}${link.quote?.line != null ? `:${link.quote.line}` : ""}`;
      out.push(`    ${s.grade(link.grade)}${clip(link.token ?? "", 80)}  \u2190 ${where}  ${input.trust === "external" ? s.flag(`(${input.trust})`) : s.dim(`(${input.trust})`)}`);
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
  out.push(`${s.bold("Commit")} ${s.accent(commit.sha)} on ${commit.branch}  ${s.bold(`"${clip(commit.subject, 80)}"`)}`);
  if (r.via === "time") {
    const at = r.commitSec ? new Date(r.commitSec * 1e3).toISOString().slice(11, 19) : "that second";
    out.push(
      `  ${s.grade("LIKELY")}made by ${action.tool} ${callId(action.id)} (seq ${action.preSeq}): the only recorded git commit running when git dated this commit (${at} UTC)  ${s.dim("[R9]")}`,
      `           ${s.dim("git printed no commit line for this command, so the join is on time, not on git's output")}`
    );
  } else {
    out.push(`  ${s.grade("DIRECT")}made by ${action.tool} ${callId(action.id)} (seq ${action.preSeq}): [${commit.branch} ${commit.sha}] ${clip(commit.subject, 60)}  ${s.dim("[R1]")}`);
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
function localTime(us) {
  const d = new Date(Math.floor(us / 1e3));
  const two = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
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
  const sessionId = g.actions[0]?.scope.sessionId ?? "";
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
  const sessionId = g.actions[0]?.scope.sessionId ?? g.prompts[0]?.promptId ?? "unknown";
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

// src/store/retention.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { join as join4 } from "node:path";
var DEFAULTS = { retentionDays: 90, maxDbMb: 1024, storeContent: true };
function loadConfig(dataDir) {
  let raw;
  try {
    raw = readFileSync3(join4(dataDir, "config.json"), "utf8");
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
        storeContent: c.store_content !== false
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
  db.exec("PRAGMA journal_mode = WAL");
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

// src/store/sqlite.ts
async function openDb(path) {
  if (process.versions.bun) return openBun(path);
  let sqlite;
  try {
    sqlite = await import("node:sqlite");
  } catch {
    throw new ContrailError("Contrail needs Node 22.13+ or Bun to answer queries. Recording still works.");
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
var VERSION = "0.3.0";

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
  output: { type: "string", short: "o" },
  "from-hook": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  ...Object.fromEntries(FILTERS.map((f) => [f, { type: "boolean" }]))
};
var USAGE = `contrail ${VERSION}: the observable trail behind Claude Code actions

Usage:
  contrail why <path>               the trail behind the latest agent change to a file
  contrail why "<command text>"     the trail behind the latest shell command containing the text
  contrail why <call id>            the trail behind one tool call, as reports print its id
  contrail why last                 the latest side-effecting action in this repository
  contrail why commit <sha>         what a commit contains, joined to the agent changes behind it
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
  contrail statusline               one line for Claude Code's status bar (reads its JSON on stdin)
  contrail doctor                   check that recording and queries work
  contrail ingest                   move recorded events from the spool into the database
  contrail prune                    apply retention now and compact the database

Options:
  --json          machine-readable output (why, trace, risks, sessions)
  --data <dir>    data directory (default: $CONTRAIL_HOME, $CLAUDE_PLUGIN_DATA, or the installed plugin's)
  --plugin-data <dir>
                  the plugin's data directory, used when $CONTRAIL_HOME is unset (the skills pass it)
  --stdin         read the why target from standard input (used by the /contrail:why skill)
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
    trace: () => trace2(flags, io, style),
    risks: () => risks(flags, io, style),
    sessions: () => sessions(flags, io, style),
    export: (args) => exportSession(args, flags, io),
    report: (args) => report(args, flags, io),
    statusline: () => statusline(flags, io),
    find: (args) => find(args, flags, io, style),
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
    if (e instanceof ContrailError) {
      io.err(`contrail: ${e.message}
`);
      return 1;
    }
    io.err(`contrail: unexpected error. Please report it with this output.
${e.stack ?? String(e)}
`);
    return 3;
  }
}
async function withStore(flags, io, use) {
  const dataDir = resolveDataDir(flags.data, io.env, io.home, flags["plugin-data"]);
  let db;
  try {
    mkdirSync(join5(dataDir, "spool"), { recursive: true, mode: 448 });
    db = await openDb(join5(dataDir, "contrail.db"));
  } catch (e) {
    if (e instanceof ContrailError) throw e;
    throw new ContrailError(`Cannot use the data directory ${dataDir}: ${e.message}`);
  }
  try {
    migrate(db);
    const repoKeyOf = makeRepoKeyOf();
    const storeContent = loadConfig(dataDir).config.storeContent;
    const hashToken = contentHmac(dataDir, !storeContent);
    ingest(db, join5(dataDir, "spool"), repoKeyOf, Date.now(), storeContent ? void 0 : hashToken);
    return await use({ db, dataDir, repoKey: repoKeyOf(io.cwd), ...hashToken ? { hashToken } : {} });
  } finally {
    db.close();
  }
}
async function why(args, flags, io, s) {
  if (args[0] === "commit") return whyCommit(args.slice(1), flags, io, s);
  const target = parseTarget(flags.stdin ? [readStdin(io)] : args, io.cwd);
  if (target.kind === "command" && /^commit [0-9a-f]{7,40}$/i.test(target.text)) return whyCommit(target.text.split(" ").slice(1), flags, io, s);
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const hit = findTarget(db, target, repoKey);
    const graph = loadGraph(db, hit.sessionId, io.home, hashToken);
    const explanation = explain(hit.toolUseId, graph);
    if (flags.json) io.out(`${JSON.stringify(explanation, null, 2)}
`);
    else io.out(renderWhy(explanation, graph, hit.total > 1 ? `the latest of ${hit.total} recorded matches` : void 0, s));
    return 0;
  });
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
function realPath(path) {
  try {
    return realpathSync3(path);
  } catch {
    try {
      return join5(realpathSync3(dirname2(path)), basename4(path));
    } catch {
      return path;
    }
  }
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
      if (flags.json) io.out(`${JSON.stringify({ session: graph.actions[0]?.scope.sessionId, forest: forest.map(treeJson), omitted }, null, 2)}
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
    if (flags.json) io.out(`${JSON.stringify({ session: graph.actions[0]?.scope.sessionId, filter, explanations: [...explanations.values()] }, null, 2)}
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
    writeFileSync2(path, html, { mode: 384 });
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
        session: h.graph.actions[0]?.scope.sessionId ?? null,
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
var readStdin = (io) => io.stdin ? io.stdin() : readFileSync4(0, "utf8");
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
  mkdirSync(join5(dataDir, "spool"), { recursive: true, mode: 448 });
  const db = await openDb(join5(dataDir, "contrail.db"));
  try {
    migrate(db);
    const { config } = loadConfig(dataDir);
    const r = ingest(db, join5(dataDir, "spool"), makeRepoKeyOf(), Date.now(), config.storeContent ? void 0 : contentHmac(dataDir, true));
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
    const backlog = readdirSync3(join5(dataDir, "spool")).filter((n) => n.endsWith(".json")).length;
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
      `launcher         ${existsSync3(join5(dataDir, "bin", "contrail")) ? join5(dataDir, "bin", "contrail") : "written at the next session start"}`,
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
  const dir = mkdtempSync(join5(tmpdir(), "contrail-doctor-"));
  try {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      spawnSync("sh", [hook], { input: '{"hook_event_name":"PreToolUse"}', env: { PATH: process.env.PATH ?? "", CONTRAIL_HOME: dir } });
      times.push(performance.now() - start);
    }
    return times.sort((a, b) => a - b)[2].toFixed(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
