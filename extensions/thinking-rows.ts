import {
  AssistantMessageComponent, keyHint,
  type ExtensionAPI, type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { MouseRegion, Text } from "@earendil-works/pi-tui";

// Pi 1.0.0 exposes a static hidden-thinking label but no per-block label
// renderer. This reversible compatibility hook decorates the existing Text
// components, preserving Pi's thinking content, click handlers and Ctrl+T.
// If Pi changes its renderer internals, the static shortcut label still works.
type AssistantMessage = Parameters<AssistantMessageComponent["updateContent"]>[0];

function thinkingLineCounts(message: AssistantMessage): number[] {
  const runs: number[] = [];
  let blocks: string[] = [];
  const flush = () => {
    if (blocks.length) runs.push(blocks.join("\n\n").split(/\r\n|[\r\n]/).length);
    blocks = [];
  };
  for (const block of message.content) {
    if (block.type === "thinking") {
      const text = block.thinking.trim();
      if (text) blocks.push(text);
    } else {
      flush();
    }
  }
  flush();
  return runs;
}

function decorateRows(component: AssistantMessageComponent, message: AssistantMessage, ctx: ExtensionContext) {
  // These two fields are implementation details; guard both before using them.
  const container = Reflect.get(component, "contentContainer");
  if (!container || !Array.isArray(container.children)) return;
  const counts = thinkingLineCounts(message);
  let run = 0;
  for (const region of container.children) {
    if (!(region instanceof MouseRegion)) continue;
    const count = counts[run++];
    const child = Reflect.get(region, "child");
    // Expanded thinking uses Markdown. Only change the collapsed Text label.
    if (!(child instanceof Text) || count === undefined) continue;
    const label = ctx.ui.theme.fg("thinkingText", "▶ Thinking")
      + ctx.ui.theme.fg("muted", ` · ${count} ${count === 1 ? "line" : "lines"} · `)
      + keyHint("app.thinking.toggle", "to expand");
    child.setText(label);
  }
}

export default function thinkingRowsExtension(pi: ExtensionAPI) {
  let uninstall: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    uninstall?.();
    uninstall = undefined;
    if (ctx.mode !== "tui") return;
    const prototype = AssistantMessageComponent.prototype;
    const original = prototype.updateContent;
    let installed = true;
    const patched: typeof original = function (this: AssistantMessageComponent, message, isStreaming) {
      original.call(this, message, isStreaming);
      if (installed) decorateRows(this, message, ctx);
    };
    prototype.updateContent = patched;
    uninstall = () => {
      installed = false;
      if (prototype.updateContent === patched) prototype.updateContent = original;
    };
    // Also refresh existing transcript components. This is the fallback label
    // if a future Pi version no longer exposes the guarded internal fields.
    ctx.ui.setHiddenThinkingLabel(`▶ Thinking · ${keyHint("app.thinking.toggle", "to expand")}`);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    uninstall?.();
    uninstall = undefined;
    if (ctx.mode === "tui") ctx.ui.setHiddenThinkingLabel();
  });
}
