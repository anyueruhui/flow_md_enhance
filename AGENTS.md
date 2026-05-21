# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目概述

FlowMD Enhance — VS Code 扩展，提供所见即所得 Markdown 编辑器，支持完整 HTML 标签。自定义编辑器替换默认 `.md` 编辑器，基于 webview 实现富文本编辑体验。

## 构建与开发命令

```bash
# 构建（esbuild 打包 webview，复制 extension + CSS 到 out/）
node build.js

# 运行测试
node test/run.js

# 打包 VSIX
npx vsce package --no-dependencies
```

测试依赖 jsdom、markdown-it、markdown-it-task-checkbox，使用项目根目录 `node_modules`。测试套件为单文件（`test/run.js`），无单独测试运行器，7 个测试组全部一起执行。

无 watch 模式，修改后需手动重新构建。无 TypeScript 编译，源码为纯 JS。未配置 linter。

## 架构

### 扩展两部分结构

1. **Extension host**（`src/extension.js`）— 注册 `flowMdEnhance.editor` 自定义编辑器。读取 `.md` 文件，base64 编码后放入 webview HTML 的 `data-content` 属性，监听 webview 的 `save` 消息并通过 `WorkspaceEdit` 写回文件。

2. **Webview**（`src/webview.js`）— 运行在 VS Code webview iframe 中。通过 base64 `data-content` 属性接收内容（非 postMessage），以块级方式渲染和编辑 Markdown。

### 构建流程（`build.js`）

- 复制 `src/extension.js` → `out/extension.js`
- 复制 `src/style.css` → `out/webview/style.css`
- esbuild 打包 `src/webview.js`（IIFE 格式，内联 markdown-it + DOMPurify + task-checkbox）→ `out/webview/main.js`

`webview/` 目录有独立 `package.json`，包含额外依赖（highlight.js、katex、mermaid、markdown-it-sub、markdown-it-sup），预留给未来使用，当前不参与构建。活跃构建使用根目录依赖。

### 内容流转

```text
.md 文件 → extension 读取 → base64 编码 → data-content 属性 → webview 解码 → markdown-it 渲染
webview 编辑 → postMessage('save') → extension 应用 WorkspaceEdit → 文件保存
```

外部文件变更通过 `FileSystemWatcher` 检测 → webview 接收 `update` 消息。

## Webview 架构（`src/webview.js`）

### 三种模式

- **Live**（默认）— 块级编辑：Markdown 解析为块，渲染块点击后变为可编辑 textarea（blur 失焦回渲染态）。使用局部 DOM 替换（`unfocusBlock`）保持滚动位置。
- **Viewer** — 只读全量渲染预览。
- **Source** — 原始 Markdown 文本编辑。

### 块解析器

`parseBlocks()` 将 Markdown 拆分为类型化块（heading、code、list、table、blockquote、hr、html、paragraph）。每块分配自增 `b{N}` ID。原始内容通过 `blockRawMap`（Map）追踪，用于编辑时精确替换。

### 关键设计决策

- 内容通过 base64 `data-content` 属性传递 — 绕过 webview 中内联脚本的 CSP 限制。
- `applyBlockEdit()` 通过字符串匹配替换原始内容（非块 ID），应对重新解析后块 ID 偏移。
- blur/click 竞态通过 blur 处理器中 50ms setTimeout 处理。
- DOMPurify 以显式标签/属性白名单对所有渲染输出做消毒。

## 样式

`src/style.css` 使用 VS Code CSS 变量（`--vscode-editor-background` 等）集成主题。通过 body class 检测深色/浅色。所有自定义属性定义在 `:root`。
