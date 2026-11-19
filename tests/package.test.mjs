import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const json = (p) => JSON.parse(read(p));
const PORTABLE_KEYS = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];
const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", "gemini-extension.json"];

test("every manifest carries the same name and version", () => {
  const ids = MANIFESTS.map((p) => `${p} → ${json(p).name}@${json(p).version}`);
  assert.equal(new Set(ids.map((id) => id.split(" → ")[1])).size, 1, ids.join("\n"));
});

test("the marketplace lists exactly the liarliar plugin from the repo root", () => {
  const market = json(".claude-plugin/marketplace.json");
  assert.equal(market.name, "liarliar");
  assert.deepEqual(market.plugins.map((p) => [p.name, p.source]), [["liarliar", "./"]]);
  assert.equal(json(".claude-plugin/plugin.json").name, "liarliar");
});

test("the Codex marketplace points at the repo root", () => {
  const market = json(".agents/plugins/marketplace.json");
  assert.deepEqual(market.plugins.map((p) => [p.name, p.source.url]), [["liarliar", "./"]]);
});

test("Gemini loads the skill as context", () => {
  assert.equal(json("gemini-extension.json").contextFileName, "GEMINI.md");
  assert.equal(read("GEMINI.md").trim(), "@./skills/liarliar/SKILL.md");
});

test("SKILL.md frontmatter uses only portable keys and a one-line description of at most 200 chars", () => {
  const fm = read("skills/liarliar/SKILL.md").match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  assert.ok(fm, "SKILL.md must start with a --- frontmatter block");
  const keys = [...fm.matchAll(/^([a-z-]+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys.filter((k) => !PORTABLE_KEYS.includes(k)), []);
  assert.match(fm, /^name: liarliar$/m);
  const description = fm.match(/^description: (.+)$/m)?.[1] ?? "";
  assert.ok(description.length > 0 && description.length <= 200, `description length ${description.length}`);
  assert.ok(!/[<>]/.test(description), "description must not contain < or >");
});

test("every hook command runs in bash and exits 0 when node is missing", () => {
  // Without node on PATH each hook used to fail with "node: command not found" and a visible hook error.
  const GUARD = 'command -v node >/dev/null 2>&1 || exit 0; node "${CLAUDE_PLUGIN_ROOT}/hooks/liarliar.mjs" ';
  const hooks = Object.values(json("hooks/hooks.json").hooks).flat().flatMap((m) => m.hooks);
  assert.equal(hooks.length, 3);
  for (const h of hooks) {
    assert.equal(h.shell, "bash", h.command);
    assert.ok(h.command.startsWith(GUARD), h.command);
    assert.match(h.command.slice(GUARD.length), /^(log|gate)$/);
  }
});

test("SKILL.md loads for any editing task and states the edit-turn rule in its first 10 body lines", () => {
  const skill = read("skills/liarliar/SKILL.md");
  assert.match(skill.match(/^description: (.+)$/m)?.[1] ?? "", /^"Use for any coding task that edits files\./);
  const top = skill.replace(/^---\n[\s\S]*?\n---\n/, "").split("\n").slice(0, 10).join("\n");
  assert.match(top, /\*\*Every turn that changes files ends with a receipt\.\*\*/);
});

test("SKILL.md has Process and Example sections", () => {
  const body = read("skills/liarliar/SKILL.md");
  assert.match(body, /^## Process$/m);
  assert.match(body, /^## Example$/m);
});

const URL_BASE = "https://github.com/adidotai/liarliar";

test("every manifest points at github.com/adidotai/liarliar", () => {
  for (const p of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json"]) {
    assert.equal(json(p).repository, URL_BASE, `${p} repository`);
    assert.equal(json(p).homepage, URL_BASE, `${p} homepage`);
  }
  assert.equal(json(".codex-plugin/plugin.json").interface.websiteURL, URL_BASE);
});

const textFiles = () =>
  execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter((f) => f && !f.endsWith(".png") && !/^docs\/(specs|plans)\/2026-11-03-/.test(f));

test("no committed file mentions the old username", () => {
  const old = new RegExp("adityaabhiram" + "315", "i");
  assert.deepEqual(textFiles().filter((f) => old.test(read(f))), []);
});

const ABS_PATH = /[A-Z]:[\\/](?:Users|Aditya_Abhiram)/i;

test("no committed file contains an absolute local path", () => {
  assert.deepEqual(textFiles().filter((f) => ABS_PATH.test(read(f))), []);
});

test("the absolute-path guard catches drive paths with either slash, in any case", () => {
  // Built from parts at runtime, so this file holds no such path itself.
  const drive = (letter, slash, rest) => [letter, ":", slash, rest].join("");
  const paths = [drive("C", "\\", "Users\\me\\x"), drive("c", "/", "users/me/x"), drive("D", "/", "Aditya_Abhiram/x"),
    drive("d", "\\", "aditya_abhiram\\x")];
  for (const p of paths) assert.match(p, ABS_PATH, p);
  for (const p of ["https://github.com/adidotai/liarliar", "<repo>/hooks/judge.mjs", drive("C", "", "Users")]) {
    assert.doesNotMatch(p, ABS_PATH, p);
  }
});

test("the skill folder ships exactly SKILL.md", () => {
  const files = execFileSync("git", ["ls-files", "skills/liarliar"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  assert.deepEqual(files, ["skills/liarliar/SKILL.md"]);
});

test("the release workflow builds liarliar.zip with the skill folder at the zip root", () => {
  const wf = read(".github/workflows/release.yml");
  assert.match(wf, /git archive --format=zip --prefix=liarliar\/ -o liarliar\.zip HEAD:skills\/liarliar/);
  assert.match(wf, /gh release create/);
});

test("the release workflow takes its notes from the CHANGELOG section that matches the tag", () => {
  const wf = read(".github/workflows/release.yml");
  assert.match(wf, /GITHUB_REF_NAME##\*v/);
  assert.doesNotMatch(wf, /## 0\.1\.0/);
});

test("README links the zip and both chat apps", () => {
  const readme = read("README.md");
  assert.match(readme, /releases\/latest\/download\/liarliar\.zip/);
  assert.match(readme, /claude\.ai/);
  assert.match(readme, /ChatGPT/);
});

test("README embeds images with Markdown, not HTML", () => {
  const readme = read("README.md");
  assert.match(readme, /!\[[^\]]*\]\(assets\/logo\.svg\)/);
  assert.match(readme, /!\[[^\]]*\]\(assets\/hero\.svg\)/);
  assert.ok(!readme.includes("<img"), "README must not use <img");
});

test("every plugin manifest points at the logo, a 512x512 PNG", () => {
  assert.equal(json(".claude-plugin/plugin.json").icon, "./assets/logo.png");
  const codex = json(".codex-plugin/plugin.json").interface;
  assert.equal(codex.logo, "./assets/logo.png");
  assert.equal(codex.composerIcon, "./assets/logo.png");
  assert.equal(json(".cursor-plugin/plugin.json").logo, "assets/logo.png");
  // Directory listing fields belong in plugin.json only; validate flags them in a marketplace entry.
  assert.equal(json(".claude-plugin/marketplace.json").plugins[0].icon, undefined);
  const buf = readFileSync(new URL("../assets/logo.png", import.meta.url));
  assert.equal(buf.readUInt32BE(16), 512);
  assert.equal(buf.readUInt32BE(20), 512);
  assert.ok(buf.length < 102400, `size ${buf.length}`);
});

test("CI validates with Claude Code 2.1.281 or later, the first version that accepts the icon field", () => {
  const pins = [...read(".github/workflows/ci.yml").matchAll(/claude-code@2\.1\.(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(pins.length >= 2 && pins.every((n) => n >= 281), `pins: ${pins.join(", ")}`);
});

test("CHANGELOG has a dated section for the manifest version", () => {
  const version = json(".claude-plugin/plugin.json").version;
  const heading = new RegExp(`^## ${version.replace(/\./g, "\\.")} \\(\\d{4}-\\d{2}-\\d{2}\\)$`, "m");
  assert.match(read("CHANGELOG.md"), heading);
});

test("social preview is a 1280x640 PNG under 1 MB", () => {
  const buf = readFileSync(new URL("../assets/social-preview.png", import.meta.url));
  assert.equal(buf.readUInt32BE(16), 1280);
  assert.equal(buf.readUInt32BE(20), 640);
  assert.ok(buf.length < 1048576, `size ${buf.length}`);
});
