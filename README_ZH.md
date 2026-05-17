# FlowMD Enhance

[![GitHub](https://img.shields.io/badge/GitHub-Repo-blue?logo=github)](https://github.com/anyueruhui/flow_md_enhance) [English](README.md)

VS Code 所见即所得 Markdown 编辑器，支持完整 HTML 标签、块级编辑和页面搜索。

![FlowMD Enhance](https://github.com/anyueruhui/flow_md_enhance/raw/main/show_case.png)

## 功能特性

### 三种编辑模式

| 模式 | 说明 |
|------|------|
| **Live 预览** | 块级编辑 — 点击块编辑原始 Markdown，失焦自动渲染 |
| **Viewer 只读** | 渲染后的只读预览 |
| **Source 源码** | 原始 Markdown 文本编辑 |

### 完整 HTML 标签支持

与 VS Code 内置 Markdown 预览不同，FlowMD Enhance 直接渲染内联 HTML 标签：

```html
<font color="red">红色文字</font>
<span style="color: blue; font-size: 20px;">蓝色大号文字</span>
<mark>高亮文本</mark>
<kbd>Ctrl</kbd> + <kbd>C</kbd>
<details><summary>可折叠</summary>内容</details>
<ruby>汉<rt>hàn</rt></ruby>
```

支持：`<font>`、`<span>`、`<mark>`、`<kbd>`、`<details>`、`<summary>`、`<sub>`、`<sup>`、`<ruby>`、`<rt>`、`<b>`、`<i>`、`<u>`、`<s>`、`<table>`（含 `colspan`/`rowspan`）以及内联 `style` 属性。

### 页面搜索

- **Cmd/Ctrl + F** — 打开搜索栏
- **Enter / Shift+Enter** — 下一个 / 上一个匹配
- **Aa** 按钮 — 切换大小写敏感
- **Escape** — 关闭搜索
- 搜索高亮在三种模式下均可用（Source 模式通过背景叠加层实现）

### 撤销 / 重做

- **Cmd/Ctrl + Z** — 撤销
- **Cmd/Ctrl + Shift + Z** — 重做
- 50 步历史记录，跨模式切换保持

### 任务列表

交互式复选框，支持 `- [ ]` / `- [x]` 语法。

### 代码块

围栏代码块，显示语言标签，一键复制。

### 外部文件同步

检测外部文件变更（如 git pull）并自动重新加载，内置自保存过滤防止反馈循环。

## 设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `flowMdEnhance.defaultMode` | `live` | 默认编辑模式：`live`、`viewer` 或 `source` |

## 系统要求

- VS Code 1.85.0+

## 致谢

灵感来源于 [FlowMD](https://marketplace.visualstudio.com/items?itemName=hephaestus-workers.flow-md)，在此基础上额外增加了 HTML 标签支持。

## 许可证

MIT
