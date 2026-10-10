import {
  createBashToolDefinition, createReadToolDefinition, createEditToolDefinition,
  createWriteToolDefinition, createGrepToolDefinition, createFindToolDefinition,
  createLsToolDefinition, createPowerShellToolDefinition, keyHint,
  type ExtensionAPI, type ExtensionContext, type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container, Text, stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// A passive live viewport: no extra tool executions, prompts, or transcript entries.
const WIDGET_KEY = "live-tool-activity";
const HISTORY_LIMIT = 12;
const OUTPUT_LINES = 3;

type Activity = {
  id: string;
  name: string;
  label: string;
  status: "running" | "done" | "error";
  output: string[];
};

function plain(text: string): string {
  return stripTerminalSequences(text)
    .replace(/\t/g, "  ")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
}

function singleLine(value: unknown): string {
  return typeof value === "string" ? plain(value.slice(0, 2048)).replace(/[\r\n]+/g, " ↵ ").trim() : "";
}

function shortName(name: string): string {
  return name.split(/[.:]/).pop() || name;
}

function describe(name: string, args: Record<string, unknown> = {}): string {
  const tool = shortName(name);
  const path = singleLine(args.path ?? args.file_path);
  switch (tool) {
    case "bash":
    case "powershell":
      return `$ ${singleLine(args.command) || tool}`;
    case "read": return `Read ${path}`.trim();
    case "edit": return `Edit ${path}`.trim();
    case "write": return `Write ${path}`.trim();
    case "ls": return `List ${path || "."}`;
    case "find": return `Find ${singleLine(args.pattern)} ${path}`.trim();
    case "grep": return `Search ${singleLine(args.pattern)} ${path}`.trim();
    default: return singleLine(name); // Don't dump arbitrary arguments or file contents.
  }
}

function outputTail(result: unknown): string[] {
  const content = (result as { content?: { type: string; text?: string }[] } | undefined)?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .slice(-OUTPUT_LINES)
    .map((block) => plain(block.text!.slice(-8192)))
    .join("\n")
    .split(/\r\n|[\r\n]/)
    .filter((line) => line.trim())
    .slice(-OUTPUT_LINES);
}

export default function activityExtension(pi: ExtensionAPI) {
  let enabled = true;
  let active = false;
  let entries: Activity[] = [];
  let requestRender: (() => void) | undefined;

  // Override presentation only; execution still uses Pi's native bash tool,
  // including cwd, shell settings, cancellation, streaming and truncation.
  const bash = createBashToolDefinition(process.cwd());
  pi.registerTool({
    ...bash,
    defaultActive: false, // Respect the user's existing tool selection.
    renderShell: "self", // No standard green result background.
    async execute(id, args, signal, onUpdate, ctx) {
      const settings = pi.getSettings();
      return createBashToolDefinition(ctx.cwd, {
        commandPrefix: settings.shellCommandPrefix,
        shellPath: settings.shellPath,
      }).execute(id, args, signal, onUpdate, ctx);
    },
    renderCall() {
      return { render: () => [], invalidate() {} };
    },
    renderResult(result, options, theme, context) {
      // Live output belongs in the activity panel, not a second transcript box.
      if (options.isPartial && enabled) return { render: () => [], invalidate() {} };
      const text = result.content
        .filter((block) => block.type === "text")
        .map((block) => plain(block.text))
        .join("\n");
      const lineCount = text.trimEnd() ? text.trimEnd().split(/\r\n|[\r\n]/).length : 0;
      const marker = options.isPartial ? "›" : context.isError ? "✗" : "✓";
      const color = context.isError ? "error" : options.isPartial ? "accent" : "success";
      const command = singleLine(context.args.command);
      return {
        invalidate() {},
        render(width: number): string[] {
          const hint = theme.fg("muted", ` · ${lineCount} lines · `) + keyHint("app.tools.expand", options.expanded ? "to collapse" : "to expand");
          const prefix = theme.fg(color, `${options.expanded ? "▼" : "▶"} ${marker} `);
          const budget = Math.max(0, width - visibleWidth(prefix) - visibleWidth(hint));
          const heading = truncateToWidth(prefix + theme.fg("toolTitle", truncateToWidth(`$ ${command}`, budget)) + hint, width);
          if (!options.expanded) return [heading];
          const full = theme.fg("toolTitle", `$ ${plain(context.args.command || "")}`) + "\n\n" + theme.fg("toolOutput", text || "(no output)");
          return [heading, ...new Text(full, 0, 0).render(width)];
        },
      };
    },
  });

  // Apply the same compact presentation to the other built-in tools. Keep
  // native renderers for expanded contents/diffs and native execution semantics.
  const fileToolFactories: ((cwd: string) => ToolDefinition<any, any, any>)[] = [
    createReadToolDefinition, createEditToolDefinition, createWriteToolDefinition,
    createGrepToolDefinition, createFindToolDefinition, createLsToolDefinition,
    createPowerShellToolDefinition,
  ];
  for (const createTool of fileToolFactories) {
    const native = createTool(process.cwd());
    pi.registerTool({
      ...native,
      defaultActive: false,
      renderShell: "self",
      async execute(id, args, signal, onUpdate, ctx) {
        const tool = native.name === "read"
          ? createReadToolDefinition(ctx.cwd, { autoResizeImages: pi.getSettings().images?.autoResize })
          : createTool(ctx.cwd);
        return tool.execute(id, args, signal, onUpdate, ctx);
      },
      renderCall() {
        return { render: () => [], invalidate() {} };
      },
      renderResult(result, options, theme, context) {
        if (options.isPartial && enabled) return { render: () => [], invalidate() {} };
        const text = result.content.filter((block) => block.type === "text").map((block) => plain(block.text)).join("\n");
        const detailText = native.name === "edit" && typeof result.details?.diff === "string"
          ? result.details.diff
          : native.name === "write" && typeof context.args.content === "string" ? context.args.content : text;
        const lineCount = detailText.trimEnd() ? detailText.trimEnd().split(/\r\n|[\r\n]/).length : 0;
        const marker = options.isPartial ? "›" : context.isError ? "✗" : "✓";
        const color = context.isError ? "error" : options.isPartial ? "accent" : "success";
        const label = describe(native.name, context.args);
        const body = new Container();
        if (options.expanded) {
          const renderContext = { ...context, lastComponent: undefined };
          // Write's native call renderer shows the written file's contents.
          // Avoid edit's call renderer: it previews by re-reading the file.
          if (native.name === "write" && native.renderCall) {
            body.addChild(native.renderCall(context.args, theme, renderContext));
          }
          if (native.renderResult) {
            body.addChild(native.renderResult(result, options, theme, renderContext));
          } else {
            body.addChild(new Text(theme.fg("toolOutput", text || "(no output)"), 0, 0));
          }
        }
        return {
          invalidate() { body.invalidate(); },
          render(width: number): string[] {
            const hint = theme.fg("muted", ` · ${lineCount} lines · `) + keyHint("app.tools.expand", options.expanded ? "to collapse" : "to expand");
            const prefix = theme.fg(color, `${options.expanded ? "▼" : "▶"} ${marker} `);
            const budget = Math.max(0, width - visibleWidth(prefix) - visibleWidth(hint));
            const heading = truncateToWidth(prefix + theme.fg("toolTitle", truncateToWidth(label, budget)) + hint, width);
            return options.expanded ? [heading, ...body.render(width)] : [heading];
          },
        };
      },
    });
  }

  function hide(ctx: ExtensionContext) {
    requestRender = undefined;
    if (ctx.mode === "tui") ctx.ui.setWidget(WIDGET_KEY, undefined);
  }

  function prune() {
    // Keep all in-flight calls (including parallel/nested calls) and bounded history.
    const completed = entries.filter((entry) => entry.status !== "running");
    const keep = new Set(completed.slice(-HISTORY_LIMIT));
    entries = entries.filter((entry) => entry.status === "running" || keep.has(entry));
  }

  function refresh(ctx: ExtensionContext) {
    if (ctx.mode !== "tui" || !enabled || !active) return;
    if (requestRender) {
      requestRender();
      return;
    }
    ctx.ui.setWidget(WIDGET_KEY, (tui) => {
      requestRender = () => tui.requestRender();
      return {
        invalidate() {}, // No cached layout or colors; reads the current theme each render.
        dispose() { requestRender = undefined; },
        render(width: number): string[] {
          if (width < 4) return [truncateToWidth("Working…", Math.max(0, width))];
          const theme = ctx.ui.theme;
          const inner = width - 4;
          const border = (text: string) => theme.fg("borderMuted", text);
          const row = (text: string) => {
            const clipped = truncateToWidth(text, inner);
            return border("│ ") + clipped + " ".repeat(inner - visibleWidth(clipped)) + border(" │");
          };
          const running = entries.filter((entry) => entry.status === "running");
          const focus = running.at(-1) ?? entries.at(-1);
          const heading = truncateToWidth(` ${running.length ? `${running.length} running` : "Working…"} `, width - 2);
          const lines = [border("╭") + theme.fg("accent", heading) + border("─".repeat(width - 2 - visibleWidth(heading)) + "╮")];
          if (!focus) {
            lines.push(row(theme.fg("muted", "Waiting for tool activity…")));
          } else {
            // Keep the active command visible as its output scrolls underneath it.
            const others = entries.filter((entry) => entry !== focus);
            const previous = others.slice(-(focus.output.length ? 1 : 3));
            for (const entry of [...previous, focus]) {
              const color = entry.status === "error" ? "error" : entry.status === "done" ? "success" : "accent";
              const marker = entry.status === "error" ? "✗" : entry.status === "done" ? "✓" : "›";
              lines.push(row(theme.fg(color, marker) + " " + theme.fg(entry === focus ? "toolTitle" : "muted", entry.label)));
            }
            for (const output of focus.output) lines.push(row(theme.fg("toolOutput", "  " + output)));
          }
          lines.push(border("╰" + "─".repeat(width - 2) + "╯"));
          return lines;
        },
      };
    }, { placement: "aboveEditor" });
  }

  pi.on("session_start", (_event, ctx) => {
    active = false;
    entries = [];
    hide(ctx);
    if (ctx.mode === "tui") ctx.ui.setToolsExpanded(false);
  });

  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    if (!active) entries = [];
    active = true;
    refresh(ctx);
  });

  pi.on("tool_execution_start", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    active = true;
    entries.push({ id: event.toolCallId, name: event.toolName, label: describe(event.toolName, event.args ?? {}), status: "running", output: [] });
    prune();
    refresh(ctx);
  });

  pi.on("tool_execution_update", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    const entry = entries.find((item) => item.id === event.toolCallId);
    if (!entry) return;
    const tail = outputTail(event.partialResult);
    if (tail.length) entry.output = tail; // Updates are snapshots, not deltas.
    refresh(ctx);
  });

  pi.on("tool_execution_end", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    const entry = entries.find((item) => item.id === event.toolCallId);
    if (!entry) return;
    entry.status = event.isError ? "error" : "done";
    if (event.isError || ["bash", "powershell"].includes(shortName(entry.name))) {
      const tail = outputTail(event.result);
      if (tail.length) entry.output = tail;
    }
    // Once parallel calls finish, show the most recently completed result.
    entries = [...entries.filter((item) => item !== entry), entry];
    prune();
    refresh(ctx);
  });

  // Unlike agent_end, settlement also covers automatic retries and continuations.
  pi.on("agent_settled", (_event, ctx) => {
    active = false;
    entries = [];
    hide(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    active = false;
    entries = [];
    hide(ctx);
  });

  pi.registerCommand("activity", {
    description: "Toggle the live tool activity panel (/activity on|off)",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        if (ctx.hasUI) ctx.ui.notify("The activity panel is available in terminal UI mode only.", "info");
        return;
      }
      const option = args.trim().toLowerCase();
      if (option && option !== "on" && option !== "off") {
        ctx.ui.notify("Usage: /activity [on|off]", "info");
        return;
      }
      enabled = option ? option === "on" : !enabled;
      if (enabled) refresh(ctx);
      else hide(ctx);
      ctx.ui.notify(`Activity panel ${enabled ? "on" : "off"}.`, "info");
    },
  });
}
