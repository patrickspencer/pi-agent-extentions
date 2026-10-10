import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Uses an installed Pi, not a second copy of its renderer packages. For npm or
// custom installations, set PI_TEST_PACKAGE_DIR to pi-coding-agent's directory.
const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const packageDir = process.env.PI_TEST_PACKAGE_DIR || join(
  agentDir, "install", "releases",
  readFileSync(join(agentDir, "install", "current-version"), "utf8").trim(),
  "node_modules", "@earendil-works", "pi-coding-agent",
);
const nodeModules = dirname(dirname(packageDir));
const load = (path) => import(pathToFileURL(path).href);
const { loadExtensions, createExtensionRuntime } = await load(join(packageDir, "dist/core/extensions/loader.js"));
const { AssistantMessageComponent, ToolExecutionComponent, UserMessageComponent } = await load(join(packageDir, "dist/modes/interactive/components/index.js"));
const { initTheme, theme } = await load(join(packageDir, "dist/modes/interactive/theme/theme.js"));
const { KeybindingsManager } = await load(join(packageDir, "dist/core/keybindings.js"));
const { Container, setKeybindings, stripTerminalSequences, visibleWidth } = await load(join(nodeModules, "@earendil-works/pi-tui/dist/index.js"));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
setKeybindings(new KeybindingsManager());
initTheme("dark", false);
const runtime = createExtensionRuntime();
runtime.getSettings = () => ({});
const { extensions, errors } = await loadExtensions(
  ["activity-batches", "activity", "thinking-rows"].map((name) => join(root, "extensions", `${name}.ts`)), root, undefined, runtime,
);
assert.deepEqual(errors, []);
const toolDefs = extensions[1].tools;
const grouping = extensions[0].commands.get("batches").handler;
const widgets = new Map();
let chat = new Container();
const ctx = { mode: "tui", hasUI: true, ui: {
  theme,
  setWidget(key, factory) {
    widgets.get(key)?.dispose?.();
    if (factory) widgets.set(key, factory({ requestRender() {} }, theme));
    else widgets.delete(key);
  },
  setToolsExpanded(value) {
    for (const child of chat.children) if (child instanceof ToolExecutionComponent) child.setExpanded(value);
  },
  setHiddenThinkingLabel(label) {
    for (const child of chat.children) if (child instanceof AssistantMessageComponent) child.setHiddenThinkingLabel(label || "Thinking...");
  },
  notify() {},
} };
async function emit(type) {
  for (const extension of extensions) for (const handler of extension.handlers.get(type) || []) await handler({ type }, ctx);
}
await emit("session_start");
const plainLines = (width = 110) => chat.render(width).map(stripTerminalSequences);
function addTool(name, args, text, details) {
  const component = new ToolExecutionComponent(name, name, args, {}, toolDefs.get(name).definition, { requestRender() {} }, "/tmp");
  component.markExecutionStarted();
  component.setArgsComplete();
  component.updateResult({ content: [{ type: "text", text }], details, isError: false }, false);
  chat.addChild(component);
  return component;
}
function click(pattern) {
  const rows = plainLines();
  const y = rows.findIndex((row) => pattern.test(row));
  assert(y >= 0, `Click target ${pattern}`);
  const event = { type: "click", button: "left", x: 5, y, screenX: 5, screenY: y, width: 110, height: rows.length, shift: false, alt: false, ctrl: false };
  assert(chat.handleMouse(event)?.handled);
}

for (const name of ["dark", "light"]) {
  initTheme(name, false);
  for (const outputPad of [0, 1, 2]) {
    chat = new Container();
    chat.addChild(new UserMessageComponent("Visual polish test"));
    const message = { role: "assistant", content: [{ type: "thinking", thinking: "THINK_BODY 日本語\nsecond thought" }, { type: "text", text: "FINAL ANSWER" }], stopReason: "stop" };
    const snapshot = JSON.stringify(message);
    chat.addChild(new AssistantMessageComponent(message, true, undefined, "Thinking...", outputPad));
    const tools = [
      addTool("read", { path: "file.ts" }, "READ_BODY 日本語\nnext line"),
      addTool("write", { path: "file.ts", content: "WRITE_BODY\nnext line" }, "Written"),
      addTool("edit", { path: "file.ts", edits: [] }, "Edited", { diff: "-1 const BEFORE = 1;\n+1 const EDIT_BODY = 2;", firstChangedLine: 1 }),
      addTool("bash", { command: "echo test" }, "SHELL_BODY\nnext line"),
      addTool("grep", { path: ".", pattern: "BODY" }, "SEARCH_BODY"),
    ];
    plainLines(); // Discover/rebuild the current transcript projection.
    await grouping("off", ctx);
    let rows = plainLines();
    const thoughtRow = rows.find((row) => row.includes("Thinking ·"));
    const readRow = rows.find((row) => row.includes("Read file.ts"));
    assert.equal(thoughtRow.indexOf("▶"), 0, "thinking arrow has no native transcript padding");
    assert.equal(readRow.indexOf("▶"), 0);
    assert.equal(thoughtRow.indexOf("Thinking"), readRow.indexOf("Read"), "status placeholder aligns label columns");
    click(/▶   Thinking/);
    assert(plainLines().some((row) => row.startsWith("  THINK_BODY")), "thinking body is indented two columns");
    assert(plainLines().some((row) => row.includes("▼   Thinking") && row.includes("to collapse")));
    for (const tool of tools) tool.setExpanded(true);
    rows = plainLines();
    for (const marker of ["READ_BODY", "WRITE_BODY", "EDIT_BODY", "SHELL_BODY", "SEARCH_BODY"]) {
      const row = rows.find((row) => row.includes(marker));
      assert(row?.startsWith("  "), `${marker} has the shared expanded-body inset`);
    }
    await grouping("on", ctx);
    plainLines();
    await grouping("1", ctx);
    rows = plainLines();
    assert(rows.some((row) => row.startsWith("  ▼   Thinking")), "thinking header has batch inset only");
    assert(rows.some((row) => row.startsWith("  ▼ ✓ Read")), "tool header has the same batch inset");
    for (const marker of ["THINK_BODY", "READ_BODY", "WRITE_BODY", "EDIT_BODY", "SHELL_BODY", "SEARCH_BODY"]) {
      const row = rows.find((row) => row.includes(marker));
      assert(row?.startsWith("    "), `${marker} is nested beneath its item header`);
    }
    click(/▼ ✓ Read/);
    assert(!plainLines().some((row) => row.includes("READ_BODY")), "tool click still collapses after inset changes");
    click(/▼   Thinking/);
    assert(!plainLines().some((row) => row.includes("THINK_BODY")), "thinking click still collapses independently");
    for (const width of [10, 20, 40, 80, 120]) {
      assert(chat.render(width).every((line) => visibleWidth(line) <= width), `${name} width ${width}`);
    }
    assert.equal(JSON.stringify(message), snapshot, "layout does not change thinking or final text");
    assert(plainLines().some((row) => row.includes("FINAL ANSWER")));
    console.log(`PASS: ${name}, outputPad=${outputPad}, aligned headers, two-level indentation, clicks, Unicode and widths`);
  }
}

// Verify semantic colors separately: neutral arrow, independent status color.
for (const [isError, symbol, expectedColor] of [[false, "✓", "success"], [true, "✗", "error"]]) {
  const calls = [];
  const trackedTheme = { fg(color, text) { calls.push([color, text]); return text; } };
  for (const registered of toolDefs.values()) {
    calls.length = 0;
    const component = registered.definition.renderResult(
      { content: [{ type: "text", text: "output" }], details: undefined },
      { expanded: false, isPartial: false }, trackedTheme,
      { args: { command: "echo test", path: "file.ts" }, isError, state: {}, cwd: "/tmp" },
    );
    component.render(160);
    assert(calls.some(([color, text]) => color === "muted" && text === "▶ "));
    assert(calls.some(([color, text]) => color === expectedColor && text === symbol));
    assert(!calls.some(([color, text]) => color === expectedColor && text.includes("▶")));
  }
}
await emit("session_shutdown");
assert.equal(widgets.size, 0);
console.log("PASS: all eight tool arrows use muted colors; success/error markers keep their own colors; cleanup restores native UI.");
