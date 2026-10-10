# TODO

## Nested activity batches

- [ ] Group thinking blocks and tool calls from one prompt into a single collapsed activity batch.
- [ ] Show a compact summary such as `▶ Activity · 9 actions`.
- [ ] Expanding the batch reveals individual collapsed thinking, read, write, edit, search, and shell-command rows.
- [ ] Allow each item to expand independently to reveal thinking, file contents, diffs, or command output.
- [ ] Keep the agent's final answer outside the batch.
- [ ] Support streaming updates, parallel/nested calls, cancellation, transcript history, theme changes, and narrow terminals.
- [ ] Provide keyboard controls as well as clickable rows in fullscreen mode.
- [ ] Investigate a supported Pi transcript-grouping API before using internal renderer hooks; document version-specific compatibility if necessary.

This is planned, not implemented. The current extensions collapse individual tool results and thinking blocks only.
