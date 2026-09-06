# Praex for VS Code

Opens the [Praex](https://praex.ai) coding agent in a split terminal beside your editor and keeps it aware of what you are looking at.

## Prerequisites

The `praex` CLI must be installed and on your PATH. Get it at https://praex.ai/download (one-line installer for Linux and macOS).

## Features

- **Quick launch**: `Cmd+Esc` (Mac) or `Ctrl+Esc` (Windows/Linux) opens Praex in a split terminal, or focuses the one already running.
- **New session**: `Cmd+Shift+Esc` / `Ctrl+Shift+Esc` starts a fresh Praex terminal even if one is open. The Praex button in the editor title bar does the same.
- **Context awareness**: the file (and selection) you have open is handed to Praex when it starts.
- **File references**: `Cmd+Option+K` (Mac) or `Ctrl+Alt+K` (Windows/Linux) inserts `@file#L37-42` style references into the prompt.

## Support

Issues and feedback: https://github.com/downoff/praex-cli/issues

## Development

```bash
bun install
bun run compile
```
