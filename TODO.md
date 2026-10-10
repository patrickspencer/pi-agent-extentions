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

- [x] Use muted expand/collapse arrows on collapsed read, write, edit, search, and command rows; keep success/error indicators separately colored.
- [x] Align thinking and tool rows with the same left padding, arrow column, reserved status column, label column, and consistent spacing.
- [x] Indent expanded read/write contents, edit diffs, command output, and thinking text by two columns beneath their headers, in addition to any batch indentation.
- [x] Add automated dark/light theme, native output-padding, Unicode, narrow-width, mouse-toggle, semantic-color, and nested-indentation tests.
- [ ] Visually check contrast and alignment in real light/dark terminals, narrow windows, and both regular/fullscreen modes.
