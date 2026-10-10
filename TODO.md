# TODO

## Nested activity batches

- [x] Prototype grouping thinking blocks and tool calls from one prompt into a single collapsed activity batch.
- [x] Show a compact summary such as `▶ Activity #1 · 9 actions`.
- [x] Expanding the batch reveals individual collapsed thinking, read, write, edit, search, and shell-command rows.
- [x] Allow each item to expand independently to reveal thinking, file contents, diffs, or command output.
- [x] Keep the agent's final answer outside the batch.
- [x] Provide keyboard controls as well as clickable rows in fullscreen mode.
- [x] Investigate Pi's grouping API and document the reversible, Pi-1.0.0-specific renderer hook used by the prototype.
- [ ] Validate the prototype in real interactive sessions: streaming, parallel/nested calls, cancellation, history navigation, compaction, theme changes, resize, mouse selection, and both terminal modes.
- [ ] Seek a supported upstream transcript-grouping API to replace the internal hook.

Implemented as a prototype in `extensions/activity-batches.ts`. Renderer tests cover nested clicks, keyboard batch/item controls, streaming/error state, narrow widths, history reconstruction, lifecycle cleanup, and preserving messages and native transcript children. Nested tool calls retain Pi's parent-tool representation rather than creating duplicate transcript entries.

## Collapsed-row visual polish

- [ ] Review colors on collapsed read, write, edit, search, and command rows. Use a neutral or muted expand/collapse arrow instead of the distracting green arrow; keep success/error indications separate.
- [ ] Align thinking rows with tool rows. Thinking is currently indented slightly farther to the right; give both the same left padding, arrow column, label column, and consistent spacing.
- [ ] Slightly indent expanded contents under their collapsed-row headers, including read/write text, edit diffs, command output, and thinking text, to distinguish them from the surrounding transcript. Keep indentation consistent with nested batch levels.
- [ ] Check alignment and contrast in light/dark themes, narrow terminals, and both regular and fullscreen modes.
