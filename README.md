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
