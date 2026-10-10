# Pi Agent Extensions

Personal extensions for the [Pi coding agent](https://pi.dev).

## Live Activity Panel

[`extensions/activity.ts`](extensions/activity.ts) adds a compact live panel above Pi's input box and collapsible tool results in the transcript.

### Features

- Shows recent tool calls and the number of running tools.
- Displays the last three lines of available streaming output.
- Hides the live panel when the agent finishes.
- Replaces the built-in tools' large result boxes with compact rows.
- Uses **▶ / ▼** arrows to expand and collapse results.
- Keeps file contents, command output, and edit diffs available when expanded.
- Supports parallel and nested tool activity, terminal resizing, and theme changes.

The panel shows actual tool activity, **not the model's private thinking**. Live output depends on tools reporting progress while they run.

### Installation

Tested with Pi 1.0.0 (`@earendil-works/pi-coding-agent`). Pi loads TypeScript extensions directly; no build step is required.

Clone this repository and copy the extension into your personal extensions directory:

```bash
git clone https://github.com/patrickspencer/pi-agent-extentions.git
cd pi-agent-extentions
mkdir -p ~/.pi/agent/extensions
cp extensions/activity.ts ~/.pi/agent/extensions/activity.ts
```

If `activity.ts` already exists there, the copy command replaces it. If you use a custom `PI_CODING_AGENT_DIR`, copy into that directory's `extensions/` folder instead.

Run `/reload` in Pi, or start a new Pi session.

To try it for one session without copying it:

```bash
pi --extension ./extensions/activity.ts
```

Do not load a second copy if the extension is already installed in your personal extensions directory.

### Controls

| Control | Action |
| --- | --- |
| `/activity` | Toggle the live panel |
| `/activity on` | Show the panel during agent activity |
| `/activity off` | Disable the live panel |
| `Ctrl+O` | Expand or collapse tool output globally (Pi's default shortcut) |
| Click a result row in fullscreen mode | Expand or collapse that individual result |

The live panel starts enabled, and tool results start collapsed when the extension loads. `/activity off` disables only the live panel; compact result rendering remains active. Custom keybindings for Pi's `app.tools.expand` action are respected.

### Test it

After running `/reload`, send the following prompt to the agent:

```text
Run this bash command exactly:
for i in {1..10}; do echo "Test output: step $i"; sleep 1; done
```

The live panel should show output scrolling once per second. When the agent finishes, the panel disappears and the command remains as a collapsed row. Click the row in fullscreen mode or press `Ctrl+O` to reveal the output.

To test a file result, ask:

```text
Read the first 5 lines of ~/.pi/agent/extensions/activity.ts
```

Use an agent prompt, not a `!` shell command: the panel observes agent tool executions.

### Scope and compatibility

The extension customizes the built-in `bash`, `powershell`, `read`, `edit`, `write`, `grep`, `find`, and `ls` tools. It delegates execution to Pi's native implementations and preserves the existing active tool selection. The live panel is terminal-UI-only; tools continue to work in non-interactive modes.

Because it registers replacements for those built-in tool names, it may conflict with other extensions that replace the same tools, including remote-execution or sandboxing extensions. Custom and MCP tool results retain their own rendering.

### Uninstall

Remove `activity.ts` from your personal extensions directory and run `/reload`.

## Thinking Rows

[`extensions/thinking-rows.ts`](extensions/thinking-rows.ts) adds a line count and shortcut hint to each collapsed thinking block:

```text
▶ Thinking · 8 lines · ctrl+t to expand
```

The count is the number of source-text lines in that thinking block, not terminal-wrapped lines. Counts update while output streams and remain specific to each block. Pi's existing fullscreen click behavior and `Ctrl+T` toggle are preserved; customized thinking-toggle keybindings are reflected in the hint. Thinking content and conversation context are unchanged.

### Installation

From this repository's directory:

```bash
mkdir -p ~/.pi/agent/extensions
cp extensions/thinking-rows.ts ~/.pi/agent/extensions/thinking-rows.ts
```

Use your custom agent directory if `PI_CODING_AGENT_DIR` is set. Run `/reload` in Pi. Press `Ctrl+T` if thinking is currently expanded; Pi remembers this display preference. You can also set `"hideThinkingBlock": true` in your Pi settings to start collapsed.

### Compatibility and uninstall

Tested with Pi 1.0.0. Pi's public API supports only a static hidden-thinking label, so per-block counts use a reversible hook into the existing assistant-message renderer. The internal-field accesses are guarded; if those fields change, the static shortcut label remains available, but counts may stop appearing. This extension may need updates for future Pi versions or other extensions that modify the same renderer.

The hook is installed only in terminal UI mode and removed on shutdown or reload. To uninstall, remove `thinking-rows.ts` from your personal extensions directory and run `/reload`.

## Nested Activity Batches (prototype)

[`extensions/activity-batches.ts`](extensions/activity-batches.ts) groups each prompt's thinking and tool calls into a single collapsed parent row:

```text
▶ Activity #1 · 4 actions · /batches 1 to expand
```

Expand the parent to reveal the individual rows, then expand just the item you want:

```text
▼ Activity #1 · 4 actions · /batches 1 to collapse
  ▶ Thinking · 3 lines · ctrl+t to expand
  ▶ ✓ Read file.ts · 2 lines · ctrl+o to expand
  ▶ ✓ $ echo sample · 1 lines · ctrl+o to expand
  ▶ Thinking · 1 line · ctrl+t to expand
```

Assistant text, including the final answer, stays outside the batch. The original transcript children and model messages are preserved; grouping changes only the display. Nested tool calls keep Pi's existing parent-tool representation rather than adding duplicate transcript entries.

### Installation

Use this alongside `activity.ts` and `thinking-rows.ts` for compact individual tool/thinking rows. Without those extensions, inner items keep Pi's native rendering.

From this repository's directory:

```bash
cp extensions/activity-batches.ts ~/.pi/agent/extensions/activity-batches.ts
```

Use your custom agent directory if configured, then run `/reload`. Grouping starts enabled, with parent batches collapsed. Batch numbering is based on the currently rendered transcript; rebuilding history may renumber batches and reset their expansion state.

### Controls

| Control | Action |
| --- | --- |
| Click a batch header in fullscreen mode | Expand/collapse that batch |
| `Ctrl+Shift+B` | Toggle the latest batch (terminal keyboard-protocol support may vary) |
| `/batches` | Toggle the latest batch |
| `/batches 2` | Toggle batch 2 |
| `/batches 2 3` | Open batch 2 and toggle its third item |
| `/batches all` | Expand all batches, or collapse all if already expanded |
| `/batches off` / `/batches on` | Disable/enable grouping |
| `Ctrl+O` / `Ctrl+T` | Pi's existing global tool/thinking expansion controls |

Opening a parent does not automatically expand its items. Individual expansion is retained when closing and reopening the parent. `/batches off` restores the ungrouped transcript while leaving the other extensions' compact-row styling in place.

To test after `/reload`, ask the agent to read a few lines from a file and run a short command. The finished activity should appear in one batch, with the final answer outside it. Open the batch and test individual rows with clicks or `/batches NUMBER ITEM`.

### Compatibility and uninstall

This is a **Pi 1.0.0 prototype** using reversible `Container.render`/mouse-dispatch hooks and guarded access to assistant-message renderer internals. It discovers the existing transcript and builds a separate display projection without reparenting its real components. Other extensions that replace the same renderers or transcript layout may conflict.

Automated renderer tests cover nested clicks, keyboard controls, error/running state, widths, history reconstruction, global Pi toggles, and cleanup. Full interactive validation—especially compaction, selection, and both terminal modes—is still tracked in [TODO.md](TODO.md).

Remove `activity-batches.ts` and run `/reload` to uninstall. The hook is also removed on session shutdown; non-TUI modes do not install it.

## Planned improvements

See [TODO.md](TODO.md) for batch validation and visual-polish work.
