import {
  AssistantMessageComponent, ToolExecutionComponent, UserMessageComponent,
  SkillInvocationMessageComponent,
  type ExtensionAPI, type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  Container, MouseRegion, Spacer, truncateToWidth,
  type Component, type TuiMouseEvent,
} from "@earendil-works/pi-tui";

// Pi 1.0.0 compatibility hook: project the transcript into nested activity
// batches without changing its actual children, messages, or tool results.
// Preserving the real children keeps Pi's Ctrl+O/Ctrl+T and lifecycle working.

class IndentedItem implements Component {
  private indent = 2;
  private trimmed = 0;

  constructor(readonly child: Component, readonly owner: Component) {}

  invalidate() { this.child.invalidate(); }

  render(width: number): string[] {
    if (width < 1) return [];
    this.indent = Math.min(2, width - 1);
    const lines = this.child.render(width - this.indent);
    // Tool rows have a leading spacer; remove it within the compact batch.
    this.trimmed = lines[0] === "" ? 1 : 0;
    return lines.slice(this.trimmed).map((line) => " ".repeat(this.indent) + line);
  }

  handleMouse(event: TuiMouseEvent) {
    return this.child.handleMouse?.({
      ...event,
      x: Math.max(0, event.x - this.indent),
      y: event.y + this.trimmed,
      width: Math.max(1, event.width - this.indent),
      height: event.height + this.trimmed,
    });
  }

  toggle() {
    if (this.child instanceof ToolExecutionComponent) {
      this.child.setExpanded(!Reflect.get(this.child, "expanded"));
    } else if (this.child instanceof MouseRegion) {
      // Use the existing thinking row's click handler, preserving its per-run
      // visibility override rather than changing global thinking visibility.
      this.child.handleMouse({
        type: "click", button: "left", x: 0, y: 0, screenX: 0, screenY: 0,
        width: 80, height: Math.max(1, this.child.render(80).length),
        shift: false, alt: false, ctrl: false,
      });
    }
  }
}

// Keep all assistant text/errors outside the batch. Thinking regions are shown
// inside it instead. Temporary filtering is only a display projection.
class AssistantText implements Component {
  constructor(private assistant: AssistantMessageComponent) {}

  invalidate() { this.assistant.invalidate(); }

  render(width: number): string[] {
    const container = Reflect.get(this.assistant, "contentContainer");
    if (!container || !Array.isArray(container.children)) return this.assistant.render(width);
    const original = container.children;
    const textChildren = original.filter((child: Component) => !(child instanceof MouseRegion));
    if (textChildren.every((child: Component) => child instanceof Spacer)) return [];
    container.children = textChildren;
    try {
      return this.assistant.render(width);
    } finally {
      container.children = original;
    }
  }

  handleMouse(event: TuiMouseEvent) {
    // Refresh the native mouse layout for just the visible assistant text.
    this.render(event.width);
    return this.assistant.handleMouse(event);
  }
}

class ActivityBatch extends Container {
  expanded = false;
  number = 0;
  items: IndentedItem[] = [];
  private header: MouseRegion;

  constructor(private ctx: ExtensionContext, private redraw: () => void) {
    super();
    this.header = new MouseRegion({
      invalidate() {},
      render: (width) => {
        const running = this.items.some((item) => item.owner instanceof ToolExecutionComponent
          ? Reflect.get(item.owner, "isPartial")
          : Reflect.get(item.owner, "isStreaming"));
        const errors = this.items.filter((item) => item.owner instanceof ToolExecutionComponent
          && Reflect.get(item.owner, "result")?.isError).length;
        const status = errors ? ` · ${errors} failed` : running ? " · running" : "";
        const theme = this.ctx.ui.theme;
        const row = theme.fg("muted", this.expanded ? "▼ " : "▶ ")
          + theme.fg("toolTitle", `Activity #${this.number}`)
          + theme.fg("muted", ` · ${this.items.length} actions${status} · /batches ${this.number} to ${this.expanded ? "collapse" : "expand"}`);
        return [truncateToWidth(row, Math.max(0, width))];
      },
    }, (event) => {
      if (event.type !== "click" || event.button !== "left") return undefined;
      this.expanded = !this.expanded;
      this.redraw();
      return { handled: true };
    });
  }

  render(width: number): string[] {
    this.children = [new Spacer(1), this.header, ...(this.expanded ? this.items : [])];
    return super.render(width);
  }
}

type Projection = {
  prefix: object;
  batches: Map<object, ActivityBatch>;
  ordered: ActivityBatch[];
  view: Container;
};

function thinkingRegions(assistant: AssistantMessageComponent): MouseRegion[] {
  const container = Reflect.get(assistant, "contentContainer");
  return container && Array.isArray(container.children)
    ? container.children.filter((child: Component) => child instanceof MouseRegion)
    : [];
}

export default function activityBatchesExtension(pi: ExtensionAPI) {
  let enabled = true;
  let requestRender: (() => void) | undefined;
  let uninstall: (() => void) | undefined;
  const projections = new Map<Container, Projection>();
  const virtualViews = new WeakSet<Container>();
  let latest: Projection | undefined;
  const redraw = () => requestRender?.();

  function project(container: Container, ctx: ExtensionContext): Container {
    let state = projections.get(container);
    if (!state) {
      state = { prefix: {}, batches: new Map(), ordered: [], view: new Container() };
      virtualViews.add(state.view);
      projections.set(container, state);
    }
    const used = new Set<object>();
    const children: Component[] = [];
    const ordered: ActivityBatch[] = [];
    let key = state.prefix;
    let current: ActivityBatch | undefined;
    const batch = () => {
      if (!current) {
        current = state!.batches.get(key) ?? new ActivityBatch(ctx, redraw);
        state!.batches.set(key, current);
        current.items = [];
        current.number = ordered.length + 1;
        ordered.push(current);
        used.add(key);
        children.push(current);
      }
      return current;
    };
    for (const child of container.children) {
      if (child instanceof UserMessageComponent || child instanceof SkillInvocationMessageComponent) {
        key = child;
        current = undefined;
        children.push(child);
      } else if (child instanceof ToolExecutionComponent) {
        batch().items.push(new IndentedItem(child, child));
      } else if (child instanceof AssistantMessageComponent) {
        const regions = thinkingRegions(child);
        if (regions.length) {
          for (const region of regions) batch().items.push(new IndentedItem(region, child));
          children.push(new AssistantText(child));
        } else {
          children.push(child);
        }
      } else {
        children.push(child);
      }
    }
    for (const oldKey of state.batches.keys()) if (!used.has(oldKey)) state.batches.delete(oldKey);
    state.ordered = ordered;
    state.view.children = children;
    latest = state;
    return state.view;
  }

  function toggle(number?: number) {
    const batches = latest?.ordered ?? [];
    const target = number === undefined ? batches.at(-1) : batches[number - 1];
    if (!target) return false;
    target.expanded = !target.expanded;
    redraw();
    return true;
  }

  pi.on("session_start", (_event, ctx) => {
    uninstall?.();
    projections.clear();
    latest = undefined;
    if (ctx.mode !== "tui") return;
    let installed = true;
    const originalRender = Container.prototype.render;
    const originalMouse = Container.prototype.handleMouse;
    const isTranscript = (container: Container) => container.children.some((child) =>
      child instanceof AssistantMessageComponent || child instanceof ToolExecutionComponent
      || child instanceof UserMessageComponent || child instanceof SkillInvocationMessageComponent);
    const patchedRender: typeof originalRender = function (this: Container, width) {
      if (!installed || !enabled || virtualViews.has(this) || !isTranscript(this)) return originalRender.call(this, width);
      return project(this, ctx).render(width);
    };
    const patchedMouse: typeof originalMouse = function (this: Container, event) {
      const state = projections.get(this);
      if (installed && enabled && state) return state.view.handleMouse(event);
      return originalMouse.call(this, event);
    };
    Container.prototype.render = patchedRender;
    Container.prototype.handleMouse = patchedMouse;
    uninstall = () => {
      installed = false;
      if (Container.prototype.render === patchedRender) Container.prototype.render = originalRender;
      if (Container.prototype.handleMouse === patchedMouse) Container.prototype.handleMouse = originalMouse;
    };
    // An invisible widget provides Pi's renderer without creating a second TUI.
    ctx.ui.setWidget("activity-batches-render", (tui) => {
      requestRender = () => tui.requestRender();
      return { render: () => [], invalidate() {}, dispose() { requestRender = undefined; } };
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    uninstall?.();
    uninstall = undefined;
    projections.clear();
    latest = undefined;
    if (ctx.mode === "tui") ctx.ui.setWidget("activity-batches-render", undefined);
    requestRender = undefined;
  });

  pi.registerShortcut("ctrl+shift+b", {
    description: "Expand or collapse the latest activity batch",
    handler: async (_ctx) => { if (enabled) toggle(); },
  });

  pi.registerCommand("batches", {
    description: "Toggle activity batches: /batches [number [item]|all|on|off]",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return;
      const option = args.trim().toLowerCase();
      if (option === "on" || option === "off") {
        enabled = option === "on";
        redraw();
        ctx.ui.notify(`Activity grouping ${enabled ? "on" : "off"}.`, "info");
        return;
      }
      if (!enabled) { ctx.ui.notify("Enable grouping first with /batches on.", "info"); return; }
      if (option === "all") {
        const batches = latest?.ordered ?? [];
        const expand = batches.some((batch) => !batch.expanded);
        for (const batch of batches) batch.expanded = expand;
        redraw();
        return;
      }
      const match = option.match(/^(\d+)(?:\s+(\d+))?$/);
      if (!option || match) {
        if (match?.[2]) {
          const batch = latest?.ordered[Number(match[1]) - 1];
          const item = batch?.items[Number(match[2]) - 1];
          if (!batch || !item) { ctx.ui.notify("No matching batch item.", "info"); return; }
          batch.expanded = true;
          item.toggle();
          redraw();
        } else if (!toggle(match ? Number(match[1]) : undefined)) {
          ctx.ui.notify("No matching activity batch yet.", "info");
        }
        return;
      }
      ctx.ui.notify("Usage: /batches [number [item]|all|on|off]", "info");
    },
  });
}
