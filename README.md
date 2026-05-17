# FlowMD Enhance

A WYSIWYG Markdown editor for VS Code with full HTML tag support, block-level editing, and integrated page search.

## Features

### Three Editing Modes

| Mode | Description |
|------|-------------|
| **Live Preview** | Block-level editing — click a block to edit raw Markdown, blur to render |
| **Viewer** | Read-only rendered preview |
| **Source** | Raw Markdown text editing |

### Full HTML Tag Support

Unlike VS Code's built-in Markdown preview, FlowMD Enhance renders inline HTML tags directly:

```html
<font color="red">Colored text</font>
<span style="color: blue; font-size: 20px;">Styled text</span>
<mark>Highlighted</mark>
<kbd>Ctrl</kbd> + <kbd>C</kbd>
<details><summary>Collapsible</summary>Content here</details>
<ruby>汉<rt>hàn</rt></ruby>
```

Supports: `<font>`, `<span>`, `<mark>`, `<kbd>`, `<details>`, `<summary>`, `<sub>`, `<sup>`, `<ruby>`, `<rt>`, `<b>`, `<i>`, `<u>`, `<s>`, `<table>` with `colspan`/`rowspan`, and inline `style` attributes.

### Page Search

- **Cmd/Ctrl + F** — Open search bar
- **Enter / Shift+Enter** — Next / previous match
- **Aa** button — Toggle case sensitivity
- **Escape** — Close search
- Highlights work across all three modes (including Source mode via backdrop overlay)

### Undo / Redo

- **Cmd/Ctrl + Z** — Undo
- **Cmd/Ctrl + Shift + Z** — Redo
- 50-step history stack, persists across mode switches

### Task Lists

Interactive checkboxes rendered from `- [ ]` / `- [x]` syntax.

### Code Blocks

Fenced code blocks with syntax header and one-click copy button.

### External File Sync

Detects external file changes (e.g. git pull) and reloads content automatically, with self-save filtering to prevent feedback loops.

### Default Mode Setting

Configure which mode opens by default via VS Code Settings: search `flowMdEnhance.defaultMode`, choose `live`, `viewer`, or `source`.

## Scripts

| Command | Description |
|---------|-------------|
| `bash dist.sh` | Build + package VSIX to `dist/` |
| `bash publish.sh` | Auto bump version + build + publish to Marketplace |
| `bash publish.sh --skip-bump` | Publish without version bump |
| `node test/run.js` | Run 91 tests |

### Manual Build

```bash
npm install
node build.js
npx vsce package --no-dependencies
code --install-extension flow-md-enhance-0.2.0.vsix
```

## Architecture

```
src/
├── extension.js    — VS Code extension host: custom editor provider, file I/O, watcher
├── webview.js      — Webview: block parser, 3-mode renderer, search, undo system
└── style.css       — VS Code theme-integrated styles (CSS variables)
```

**Content flow:**

```
.md file → extension reads → base64 encode → data-content attribute → webview decodes → markdown-it renders
webview edits → postMessage('save') → extension WorkspaceEdit → file saved
```

### Key Design Decisions

- **Base64 data-content** — Bypasses webview CSP restrictions on inline scripts
- **Character offset tracking** — Block edits use `{start, end}` offsets, not string matching, for precise replacement even with duplicate content blocks
- **DOMPurify allowlist** — Extended tag/attribute whitelist preserves HTML while sanitizing dangerous content
- **Backdrop overlay pattern** — Source mode search highlights use a transparent textarea over a highlight div, since `<textarea>` cannot render inline HTML

## Requirements

- VS Code 1.85.0+

## License

MIT
