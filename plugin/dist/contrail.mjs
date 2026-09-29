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
import { homedir } from "node:os";

// src/cli.ts
import { mkdirSync, readdirSync as readdirSync3, readFileSync as readFileSync2 } from "node:fs";
import { basename as basename2, join as join3 } from "node:path";
import { parseArgs } from "node:util";

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
  const needle = normalize(token);
  if (!needle) return -1;
  const hay = normalize(text);
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

// src/engine/grade.ts
var ORDER = ["DIRECT", "LIKELY", "POSSIBLE", "UNKNOWN"];
function minGrade(grades) {
  if (grades.length === 0) return "UNKNOWN";
  return grades.reduce((weakest, g) => ORDER.indexOf(g) > ORDER.indexOf(weakest) ? g : weakest);
}
function maxGrade(grades) {
  return grades.reduce((best, g) => ORDER.indexOf(g) < ORDER.indexOf(best) ? g : best, "UNKNOWN");
}
function gradeSources(token, candidates, actionId) {
  const base = { type: "value_from", from: actionId, recorded: false, token: token.text };
  if (candidates.length === 0) {
    return [{ ...base, to: null, grade: "UNKNOWN", rule: "R4", note: "no observed input contains it" }];
  }
  const bySource = /* @__PURE__ */ new Map();
  for (const c of [...candidates].sort((a, b) => a.availableAt - b.availableAt)) {
    if (!bySource.has(c.ref)) bySource.set(c.ref, c);
  }
  const sources = [...bySource.values()];
  const link = (input, grade2, extra = {}) => ({
    ...base,
    to: input.id,
    grade: grade2,
    rule: "R3",
    quote: quote(input, token.text),
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
function quote(input, token) {
  const { line, text } = lineOf(input.text, findMention(input.text, token));
  return { ref: input.ref, line, text };
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
    let latest = null;
    for (const s of before) {
      const hit = alternatives.find((t) => !t.derived && findMention(s.text, t.text) >= 0) ?? alternatives.find((t) => findMention(s.text, t.text) >= 0);
      if (hit) latest = { sentence: s, token: hit, strong: !hit.derived };
    }
    if (latest) kept.push(latest);
  }
  if (kept.length === 0) return { verdict: "NOT_NAMED", grade: "UNKNOWN", searched };
  const negated = kept.find((k) => NEGATOR.test(k.sentence.text));
  if (negated) {
    return { verdict: "NAMED_NEGATED", grade: "POSSIBLE", searched, sentence: negated.sentence, matched: negated.token.text };
  }
  const first = kept[0];
  const verdict = kept.length === groups.size && kept.every((k) => k.strong) ? "NAMED" : "PARTLY_NAMED";
  return {
    verdict,
    grade: verdict === "NAMED" ? "LIKELY" : "POSSIBLE",
    searched,
    sentence: first.sentence,
    matched: first.token.text
  };
}

// src/engine/scope.ts
var scopeKey = (s) => `${s.sessionId}/${s.agentId ?? "main"}`;
var sameScope = (a, b) => a.sessionId === b.sessionId && a.agentId === b.agentId;

// src/engine/tokens.ts
var import_shell_quote = __toESM(require_shell_quote(), 1);
import { basename, dirname, isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";

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
var WRAPPERS = /* @__PURE__ */ new Set(["sudo", "env", "time", "nohup", "command", "exec"]);
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
      const abs = isAbsolute2(p) ? p : resolve2(env.cwd || "/", p);
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
    let argv = seg.words;
    while (argv.length && (WRAPPERS.has(basename(argv[0])) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0]))) argv = argv.slice(1);
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
function segments(command) {
  const out = [];
  for (const line of withoutHeredocs(logicalLines(command))) {
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
        (redirectNext ? cur.redirects : cur.words).push(e);
        redirectNext = false;
        continue;
      }
      if ("comment" in e) break;
      if ("pattern" in e) {
        cur.words.push(e.pattern);
        continue;
      }
      if (e.op === ">" || e.op === ">>" || e.op === ">&") {
        redirectNext = true;
        continue;
      }
      if (e.op === "<") continue;
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

// src/engine/context.ts
function availableTo(probe, inputs, compactSeqs) {
  const boundary = Math.max(0, ...compactSeqs.filter((s) => s < probe.seq));
  return inputs.filter((i) => sameScope(i.scope, probe.scope) && i.availableAt < probe.seq && i.availableAt >= boundary);
}
function firstUse(token, action, scopeActions) {
  let first = action;
  for (const a of scopeActions) {
    if (a.preSeq >= first.preSeq || !sameScope(a.scope, action.scope)) continue;
    if (stringLeaves(a.input).some((leaf) => findMention(leaf.value, token.text) >= 0)) first = a;
  }
  return first;
}

// src/engine/trace.ts
var MAX_DEPTH = 3;
function traceToken(token, action, g, depth = 0, visited = /* @__PURE__ */ new Set([action.id])) {
  const scopeActions = g.actions.filter((a) => sameScope(a.scope, action.scope));
  const first = firstUse(token, action, scopeActions);
  const available = availableTo({ scope: action.scope, seq: first.preSeq }, g.inputs, g.compactSeqs[scopeKey(action.scope)] ?? []);
  const candidates = available.filter((i) => findMention(i.text, token.text) >= 0);
  const links = gradeSources(token, candidates, action.id);
  const trace2 = {
    token,
    firstUse: first === action ? null : { actionId: first.id, preSeq: first.preSeq },
    searched: { count: available.length, beforeSeq: first.preSeq },
    links,
    upstream: null
  };
  if (depth >= MAX_DEPTH) return trace2;
  const best = links.find((l) => l.grade === "LIKELY") ?? links.find((l) => l.firstSeen);
  const source = best?.to ? g.inputs.find((i) => i.id === best.to) : void 0;
  const producer = source?.producedBy ? g.actions.find((a) => a.id === source.producedBy) : void 0;
  if (!source || !producer || visited.has(producer.id)) return trace2;
  visited.add(producer.id);
  const next = source.trust === "agent" ? traceToken(token, producer, g, depth + 1, visited) : headline(producer, g, depth + 1, visited);
  if (next) trace2.upstream = { via: producer, trace: next };
  return trace2;
}
var UPSTREAM_TOKENS = 8;
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
  const sentences = g.prompts.flatMap((p) => splitSentences(p.text).map((text) => ({ promptId: p.promptId, seq: p.seq, text })));
  const traces = tokens.map((t) => traceToken(t, action, g, 0, /* @__PURE__ */ new Set([action.id])));
  const effects = g.effects.filter((e) => e.actionId === action.id).map((e) => ({ type: "changed", from: action.id, to: e.id, grade: "DIRECT", rule: "R1", recorded: true }));
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
  const mentions = g.prompts.filter((p) => p.seq < action.preSeq).flatMap((p) => [...p.text.matchAll(/(?:^|\s)@([\w.~/-]+)/g)].map((m) => m[1]));
  if (mentions.length) spots.push(`@-mentioned: ${[...new Set(mentions)].join(", ")} (contents not observable)`);
  if (g.inputs.some((i) => i.truncated && sameScope(i.scope, action.scope) && i.availableAt < action.preSeq)) {
    spots.push("some inputs were truncated when stored");
  }
  const compactions = (g.compactSeqs[scopeKey(action.scope)] ?? []).filter((s) => s < action.preSeq);
  if (compactions.length) {
    spots.push(`context compacted at seq ${compactions.join(", ")}; earlier inputs are only visible through the summary`);
  }
  const knownStarts = ["SessionStart", "UserPromptSubmit", "UserPromptExpansion", "InstructionsLoaded"];
  if (g.firstEvent && !knownStarts.includes(g.firstEvent)) spots.push("the start of this session was not recorded");
  return spots;
}

// src/errors.ts
var ContrailError = class extends Error {
  name = "ContrailError";
};

// src/graph/build.ts
var WRITE_TOOLS = /* @__PURE__ */ new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
var NO_OUTPUT_TOOLS = /* @__PURE__ */ new Set([...WRITE_TOOLS, "TodoWrite", "ExitPlanMode"]);
function buildGraph(rows, who) {
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
  rows.forEach((row, index) => {
    const seq = index + 1;
    const p = parsePayload(row.payload);
    const scope = { sessionId: row.session_id ?? "", agentId: row.agent_id };
    const id = row.tool_use_id;
    switch (row.hook_event) {
      case "UserPromptSubmit":
        prompts.push({ promptId: row.prompt_id ?? `seq-${seq}`, seq, label: `p${prompts.length + 1}`, text: str(p, "prompt") ?? "" });
        break;
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
        } else {
          a.status = p.is_interrupt === true ? "interrupted" : "failed";
          a.response = { error: str(p, "error") ?? "" };
        }
        break;
      }
      case "PostToolBatch":
        for (const call of arr(p.tool_calls)) {
          const callId = str(call, "tool_use_id");
          if (callId) modelSaw.set(callId, { seq, text: toText(field(call, "tool_response")) });
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
    const expansion = expansions.get(prompt.promptId);
    if (expansion) {
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
    const agentId = (a.tool === "Agent" || a.tool === "Task") && a.status === "ok" ? str(a.response, "agentId") : void 0;
    if (agentId) {
      inputs.push({
        id: `subprompt:${agentId}`,
        scope: { sessionId: a.scope.sessionId, agentId },
        origin: "subagent_prompt",
        trust: "agent",
        ref: `subprompt:${agentId}`,
        label: `subagent instructions written in ${a.id}`,
        text: str(a.input, "prompt") ?? "",
        truncated: false,
        fidelity: "reported",
        availableAt: subagentStarts.get(agentId) ?? a.preSeq,
        producedBy: a.id,
        promptId: a.promptId
      });
    }
  }
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
  inputs.sort((a, b) => a.availableAt - b.availableAt || a.id.localeCompare(b.id));
  return {
    actions: actionList,
    inputs,
    effects,
    prompts,
    compactSeqs,
    agentSaid,
    env,
    firstEvent: rows[0]?.hook_event ?? null
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
    if (/(^|\/)(node_modules|vendor|\.venv|venv|site-packages)\//.test(path)) {
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
    return { origin: "shell", trust: network ? "external" : "local", ref: `shell:${a.id}`, label: `the output of \`${clip(command, 50)}\`` };
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
    return { origin: "subagent_result", trust: "agent", ref: `agent:${a.id}`, label: `subagent report from ${a.id}` };
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
    return changedFiles(a.response, env.cwd).map(
      (path, i) => fx(i, { kind: "file", target: displayPath(path, env.cwd, env.home), path, evidence: "bashEditDiff", patch: [] })
    );
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

// src/ingest/ingest.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

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
var WRITE_TOOLS2 = /* @__PURE__ */ new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
var READ_TOOLS = /* @__PURE__ */ new Set(["Read", "NotebookRead"]);
function ingest(db, spoolDir, repoKeyOf, now = Date.now()) {
  const report = { ingested: 0, duplicates: 0, parseErrors: 0, staleTmpRemoved: 0 };
  let names;
  try {
    names = readdirSync(spoolDir).sort();
  } catch {
    return report;
  }
  for (const name of names) {
    const file = join(spoolDir, name);
    if (name.startsWith(".tmp.")) {
      if (removeIfStale(file, now)) report.staleTmpRemoved++;
      continue;
    }
    if (!name.endsWith(".json")) continue;
    let raw;
    let mtimeNs;
    try {
      mtimeNs = statSync(file, { bigint: true }).mtimeNs;
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const capturedUs = Number(mtimeNs / 1000n);
    let row;
    try {
      row = toRow(name, raw, capturedUs, repoKeyOf);
    } catch (e) {
      row = failedRow(capturedUs, `${name}: ${e.message}`);
    }
    if (row.parseError) report.parseErrors++;
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
        report.ingested++;
      } else {
        report.duplicates++;
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
  return report;
}
function toRow(name, raw, capturedUs, repoKeyOf) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ...failedRow(capturedUs, `${name}: ${e.message}`), payload: JSON.stringify({ raw: redactString(capString(raw)) }) };
  }
  const p = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed };
  const hookEvent = str(p, "hook_event_name") ?? "unknown";
  if (hookEvent === "InstructionsLoaded") attachInstructionText(p, capturedUs);
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
    // Cap before redacting, so no pattern ever scans more than STRING_CAP characters.
    payload: JSON.stringify(redactValue(capValue(dropBulky(p)))),
    parseError: null,
    touches: hookEvent === "PostToolUse" ? touchesOf(p, cwd ?? "") : []
  };
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
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > STRING_CAP) {
      p._contrail = { skipped: st.isFile() ? "larger than the storage cap" : "not a regular file" };
      return;
    }
    const changedSinceLoad = st.mtimeMs * 1e3 > capturedUs;
    const text = changedSinceLoad ? "" : readFileSync(path, "utf8");
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
  if (tool === "Bash") return changedFiles(response, cwd).map((path) => ({ path, kind: "write" }));
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
import { join as join2 } from "node:path";
function resolveDataDir(flag, env, home) {
  if (flag) return flag;
  if (env.CONTRAIL_HOME) return env.CONTRAIL_HOME;
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;
  const base = join2(home, ".claude", "plugins", "data");
  const hits = existsSync(base) ? readdirSync2(base).filter((n) => n === "contrail" || n.startsWith("contrail-")) : [];
  if (hits.length === 1) return join2(base, hits[0]);
  if (hits.length === 0) {
    throw new ContrailError("No recorded data found. Is the Contrail plugin installed? Set CONTRAIL_HOME to point at a data directory.");
  }
  const list = hits.map((h) => `  ${join2(base, h)}`).join("\n");
  throw new ContrailError(`Found ${hits.length} Contrail data directories:
${list}
Set CONTRAIL_HOME to pick one.`);
}

// src/query/target.ts
import { existsSync as existsSync2, realpathSync as realpathSync2 } from "node:fs";
import { resolve as resolve3 } from "node:path";
function parseTarget(args, cwd) {
  const text = unquote(args.join(" ").trim());
  if (!text) throw new ContrailError('Usage: contrail why <path | "command text" | last>');
  if (text === "last") return { kind: "last" };
  const abs = resolve3(cwd, text);
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
        WHERE t.kind = 'write' AND t.path IN (?, ?) AND e.tool_use_id IS NOT NULL
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

// src/render/why.ts
var HEADING = "Where the values came from (data provenance, not the agent's reasons)";
var FOOTER = [
  `LIKELY means "this value first appeared in the agent's context from this source", not "this source made the agent act".`,
  "Not observable: the agent's reasons for this action."
];
var grade = (g) => g.padEnd(9);
function renderWhy(e, g, note) {
  const out = [];
  const a = e.action;
  const inputs = new Map(g.inputs.map((i) => [i.id, i]));
  const prompt = g.prompts.find((p) => p.promptId === a.promptId);
  out.push(`${a.tool}  ${describe(a, g)}`);
  out.push(
    `  session ${a.scope.sessionId.slice(0, 8)} \xB7 ${prompt ? `turn ${prompt.label}` : "turn not recorded"} \xB7 ${a.id} \xB7 seq ${a.preSeq} \xB7 ${a.scope.agentId ? `subagent ${a.scope.agentId}` : "main agent"}${a.status === "ok" ? "" : ` \xB7 ${a.status.toUpperCase()}`}`
  );
  if (note) out.push(`  ${note}`);
  out.push("");
  out.push(...requestedLines(e));
  out.push(
    prompt ? `Turn        ${grade("DIRECT")}ran while answering ${prompt.label}: "${clip(prompt.text, 70)}"  [R1]` : `Turn        ${grade("UNKNOWN")}no prompt was recorded for this action`
  );
  out.push("", HEADING);
  const found = e.traces.filter((t) => t.links.some((l) => l.grade !== "UNKNOWN"));
  const unfound = e.traces.filter((t) => !found.includes(t));
  for (const t of found) trace(t, 1, out, inputs);
  if (unfound.length) out.push(`  ${grade("UNKNOWN")}no observed source for: ${unfound.map((t) => t.token.text).join(", ")}  [R4]`);
  if (!e.traces.length) out.push("  nothing distinctive in this action to trace");
  const searched = e.traces[0]?.searched;
  if (searched) {
    out.push(`  (searched ${searched.count} input${searched.count === 1 ? "" : "s"} in this agent's context before seq ${searched.beforeSeq})`);
  }
  out.push("");
  if (e.effects.length) {
    out.push("Effects");
    const shown = e.effects.map((l) => ({ l, fx: g.effects.find((x) => x.id === l.to) })).filter((x) => x.fx);
    const width = Math.max(...shown.map((x) => x.fx.target.length));
    for (const { l, fx } of shown) {
      if (!fx) continue;
      out.push(`  ${grade(l.grade)}${fx.target.padEnd(width)}  ${effectWording(fx)}  [R1 ${fx.evidence}]`);
      for (const line of fx.patch.slice(0, 6)) out.push(`      ${clip(line, 100)}`);
    }
    out.push("");
  }
  out.push(`Weakest link on this trail: ${e.chainGrade}`);
  out.push(...FOOTER);
  const said = a.scope.agentId ? g.agentSaid.byAgent[a.scope.agentId] : a.promptId ? g.agentSaid.byPrompt[a.promptId] : void 0;
  if (said) out.push(`Agent said (shown for context, never used as evidence): "${clip(said, 220)}"`);
  out.push(`Blind spots: ${e.blindSpots.join("; ")}. No observed source is not the same as no source.`);
  return `${out.join("\n")}
`;
}
function trace(t, depth, out, inputs) {
  const pad = "  ".repeat(depth);
  const firstUse2 = t.firstUse ? `, first used in ${t.firstUse.actionId} at seq ${t.firstUse.preSeq}` : "";
  out.push(`${pad}${t.token.text}  (${t.token.argPath}${firstUse2})`);
  for (const l of t.links) {
    if (!l.to) {
      out.push(`${pad}  ${grade(l.grade)}${l.note}  [${l.rule}]`);
      continue;
    }
    const src = inputs.get(l.to);
    if (!src) continue;
    const where = l.quote?.line != null ? `${src.label}:${l.quote.line}` : src.label;
    out.push(`${pad}  ${grade(l.grade)}${sourceWording(l, where)}  [${l.rule}]`);
    if (l.quote?.text) out.push(`${pad}           ${l.quote.line != null ? `${l.quote.line}\u2502 ` : "\u2502 "}${clip(l.quote.text, 100)}`);
    out.push(`${pad}           ${originWording(src)}${src.producedBy ? ` \xB7 returned by ${src.producedBy} (seq ${src.availableAt})` : ""}`);
  }
  if (t.links.every((l) => l.grade === "UNKNOWN") && depth > 1) out.push(`${pad}  the trail starts here: the reason is not observable`);
  if (t.upstream) {
    out.push(`${pad}  how the agent came to call ${t.upstream.via.tool} ${t.upstream.via.id}:`);
    trace(t.upstream.trace, depth + 2, out, inputs);
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
function requestedLines(e) {
  const r = e.requested;
  const quoted = r.sentence ? `"${clip(r.sentence.text, 80)}"` : "";
  switch (r.verdict) {
    case "NAMED":
      return [
        `Requested?  NAMED  ${quoted}  [R8 ${r.grade}]`,
        '            "Named" means your words contain it. It is not a judgment of intent or permission.'
      ];
    case "NAMED_NEGATED":
      return [`Requested?  NAMED, BUT YOUR LATEST MENTION IS NEGATED: ${quoted}  [R8 ${r.grade}]`];
    case "PARTLY_NAMED":
      return [`Requested?  PARTLY NAMED  ${quoted} names ${r.matched}, not everything this action targets  [R8 ${r.grade}]`];
    case "NOT_NAMED": {
      const yours = r.searched === 1 ? "Your 1 sentence this session does not" : `None of your ${r.searched} sentences this session`;
      return [`Requested?  NOT NAMED (the agent chose this). ${yours} name it.  [R8]`];
    }
    case "NOTHING_TO_MATCH":
      return ["Requested?  nothing specific in this action to match against your words  [R8]"];
  }
}
function describe(a, g) {
  const path = str(a.input, "file_path") ?? str(a.input, "notebook_path");
  if (path) return displayPath(path, g.env.cwd, g.env.home);
  if (a.tool === "Bash") return clip(str(a.input, "command") ?? "", 90);
  if (a.tool === "WebFetch") return str(a.input, "url") ?? "";
  return clip(JSON.stringify(a.input), 90);
}
function effectWording(fx) {
  if (fx.evidence === "filePath") return "written by this call";
  if (fx.evidence === "bashEditDiff") return "changed while this command ran";
  return "request made and answered";
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
var VERSION = "0.1.0";

// src/cli.ts
var USAGE = `contrail ${VERSION}: the observable trail behind Claude Code actions

Usage:
  contrail why <path>             the latest recorded agent change to a file
  contrail why "<command text>"   the latest recorded shell command containing the text
  contrail why last               the latest side-effecting action in this repository
  contrail ingest                 move recorded events from the spool into the database
  contrail doctor                 check that recording and queries work

Options:
  --json          print the explanation as JSON
  --data <dir>    data directory (default: $CONTRAIL_HOME, $CLAUDE_PLUGIN_DATA, or the installed plugin's)
  --stdin         read the why target from standard input (used by the /contrail:why skill)
  -h, --help      show this help
  -v, --version   show the version
`;
async function main(argv, io) {
  let flags;
  let positionals;
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: "boolean" },
        data: { type: "string" },
        stdin: { type: "boolean" },
        "from-hook": { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" }
      }
    });
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
  try {
    switch (command) {
      case "why":
        return await why(rest, flags, io);
      case "ingest":
        return await ingestCommand(flags, io);
      case "doctor":
        return await doctor(flags, io);
      default:
        io.err(`contrail: unknown command "${command}"

${USAGE}`);
        return 2;
    }
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
async function openStore(flags, io) {
  const dataDir = resolveDataDir(flags.data, io.env, io.home);
  let db;
  try {
    mkdirSync(join3(dataDir, "spool"), { recursive: true, mode: 448 });
    db = await openDb(join3(dataDir, "contrail.db"));
  } catch (e) {
    if (e instanceof ContrailError) throw e;
    throw new ContrailError(`Cannot use the data directory ${dataDir}: ${e.message}`);
  }
  migrate(db);
  return { db, dataDir };
}
async function why(args, flags, io) {
  const target = parseTarget(flags.stdin ? [readFileSync2(0, "utf8")] : args, io.cwd);
  const { db, dataDir } = await openStore(flags, io);
  try {
    const repoKeyOf = makeRepoKeyOf();
    ingest(db, join3(dataDir, "spool"), repoKeyOf);
    const hit = findTarget(db, target, repoKeyOf(io.cwd));
    const rows = db.all("SELECT * FROM events WHERE session_id = ? ORDER BY captured_us, spool_name", hit.sessionId);
    const graph = buildGraph(rows, { home: io.home, user: basename2(io.home) });
    const explanation = explain(hit.toolUseId, graph);
    if (flags.json) io.out(`${JSON.stringify(explanation, null, 2)}
`);
    else io.out(renderWhy(explanation, graph, hit.total > 1 ? `the latest of ${hit.total} recorded matches` : void 0));
    return 0;
  } finally {
    db.close();
  }
}
async function ingestCommand(flags, io) {
  const { db, dataDir } = await openStore(flags, io);
  try {
    const r = ingest(db, join3(dataDir, "spool"), makeRepoKeyOf());
    if (!flags["from-hook"]) {
      io.out(`ingested ${r.ingested} events (${r.duplicates} already stored, ${r.parseErrors} unparseable, ${r.staleTmpRemoved} stale temp files removed)
`);
    }
    return 0;
  } finally {
    db.close();
  }
}
async function doctor(flags, io) {
  const runtime = process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`;
  io.out(`contrail ${VERSION} on ${runtime}
`);
  const { db, dataDir } = await openStore(flags, io);
  try {
    const backlog = readdirSync3(join3(dataDir, "spool")).filter((n) => n.endsWith(".json")).length;
    const stats = db.get(
      `SELECT COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions,
              SUM(parse_error IS NOT NULL) AS parseErrors, MAX(captured_us) AS last FROM events`
    );
    const last = stats.last ? new Date(Math.floor(stats.last / 1e3)).toISOString() : "never";
    io.out(
      [
        `data directory   ${dataDir}`,
        `schema           v${SCHEMA_VERSION}`,
        `events stored    ${stats.events} across ${stats.sessions} sessions`,
        `waiting in spool ${backlog}`,
        `unparseable      ${stats.parseErrors ?? 0}`,
        `last event       ${last}`,
        stats.events === 0 && backlog === 0 ? "No events yet. Run a Claude Code session with the plugin enabled, then check again." : "Recording and queries work."
      ].join("\n") + "\n"
    );
    return 0;
  } finally {
    db.close();
  }
}

// src/main.ts
process.umask(63);
process.exitCode = await main(process.argv.slice(2), {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  cwd: process.cwd(),
  env: process.env,
  home: homedir()
});
