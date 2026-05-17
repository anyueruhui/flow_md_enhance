/**
 * FlowMD Enhance — Webview
 * WYSIWYG Markdown + HTML renderer
 */

// ── markdown-it (bundled inline by build.js as var MarkdownIt) ──────
// In standalone mode, fall back to require
var MarkdownIt = typeof MarkdownIt !== 'undefined' ? MarkdownIt : require('markdown-it');
var TaskCheckbox = typeof TaskCheckbox !== 'undefined' ? TaskCheckbox : require('markdown-it-task-checkbox');

const md = new MarkdownIt({
    html: true,         // ★ 核心特性：启用 HTML 标签渲染
    xhtmlOut: false,
    breaks: true,
    linkify: true,
    typographer: true,
    highlight(str, lang) {
        const escaped = str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const label = lang || 'text';
        return `<div class="code-block"><div class="code-header"><span class="code-lang">${label}</span><button class="code-copy">Copy</button></div><pre class="code-content"><code>${escaped}</code></pre></div>`;
    },
}).use(TaskCheckbox);
md.enable('table');

// ── State ──────────────────────────────────────────────
let mode = 'live'; // live | viewer | source
let content = '';
let focusedBlockId = null;

const app = document.getElementById('app');

// ── VS Code API ────────────────────────────────────────
const vscodeApi = window.acquireVscodeApi ? window.acquireVscodeApi() : null;

function save() {
    if (vscodeApi) vscodeApi.postMessage({ type: 'save', content });
}

// 接收来自 extension 的消息
window.addEventListener('message', e => {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'init' || msg.type === 'update') {
        content = msg.content || '';
        render();
    }
});

// ── Block parser ───────────────────────────────────────
function parseBlocks(src) {
    const blocks = [];
    const lines = src.split('\n');
    let buf = [];
    let inCode = false;

    const flush = () => {
        if (buf.length === 0) return;
        const raw = buf.join('\n');
        const id = `b${blocks.length}`;
        const html = md.render(raw);
        const trimmed = raw.trimStart();
        let type = 'paragraph';
        if (/^#{1,6}\s/.test(trimmed)) type = 'heading';
        else if (/^```|^~~~/.test(trimmed)) type = 'code';
        else if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) type = 'list';
        else if (trimmed.startsWith('|')) type = 'table';
        else if (trimmed.startsWith('>')) type = 'blockquote';
        else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) type = 'hr';
        else if (/^<[a-zA-Z]/.test(trimmed)) type = 'html';
        blocks.push({ id, raw, html, type });
        buf = [];
    };

    for (const line of lines) {
        if (line.trimStart().startsWith('```') || line.trimStart().startsWith('~~~')) {
            if (!inCode) { flush(); inCode = true; }
            else { buf.push(line); flush(); inCode = false; continue; }
            buf.push(line); continue;
        }
        if (inCode) { buf.push(line); continue; }
        if (line.trim() === '') { flush(); continue; }
        if (/^#{1,6}\s/.test(line)) { flush(); blocks.push({ id:`b${blocks.length}`, raw:line, html:md.render(line), type:'heading' }); continue; }
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) { flush(); blocks.push({ id:`b${blocks.length}`, raw:line, html:md.render(line), type:'hr' }); continue; }
        buf.push(line);
    }
    flush();
    return blocks;
}

// ── Escape helper ──────────────────────────────────────
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Toolbar HTML ───────────────────────────────────────
function toolbar() {
    const btn = (m, icon, label) =>
        `<button class="mode-btn${mode===m?' active':''}" data-mode="${m}">${icon} ${label}</button>`;
    return `<div class="editor-toolbar">
        <span class="toolbar-title">FlowMD Enhance</span>
        <div class="toolbar-right">${btn('live','✎','Live')}${btn('viewer','👁','View')}${btn('source','&lt;/&gt;','Source')}</div>
    </div>`;
}

// ── Renderers ──────────────────────────────────────────
function render() {
    if (mode === 'live') renderLive();
    else if (mode === 'viewer') renderViewer();
    else renderSource();
}

function renderLive() {
    const blocks = parseBlocks(content);
    let h = toolbar() + '<div class="editor-content live-preview">';
    for (const b of blocks) {
        if (b.id === focusedBlockId) {
            h += `<div class="block block-focused" data-id="${b.id}"><textarea class="block-ta" data-id="${b.id}" spellcheck="false">${esc(b.raw)}</textarea></div>`;
        } else {
            h += `<div class="block block-rendered" data-id="${b.id}"><div class="block-html">${b.html}</div></div>`;
        }
    }
    h += '</div>';
    app.innerHTML = h;
    bindLive();
}

// 局部替换：只把指定块从编辑态换成渲染态，不动其他 DOM，不丢滚动
function unfocusBlock(blockId) {
    const blocks = parseBlocks(content);
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const oldEl = app.querySelector(`[data-id="${blockId}"]`);
    if (!oldEl) return;

    const newEl = document.createElement('div');
    newEl.className = 'block block-rendered';
    newEl.dataset.id = blockId;
    newEl.innerHTML = `<div class="block-html">${block.html}</div>`;

    oldEl.replaceWith(newEl);

    // 重新绑定这一个块的事件
    newEl.addEventListener('click', () => {
        focusedBlockId = newEl.dataset.id;
        const block2 = parseBlocks(content).find(b => b.id === newEl.dataset.id);
        const editEl = document.createElement('div');
        editEl.className = 'block block-focused';
        editEl.dataset.id = newEl.dataset.id;
        editEl.innerHTML = `<textarea class="block-ta" data-id="${newEl.dataset.id}" spellcheck="false">${esc(block2 ? block2.raw : '')}</textarea>`;
        newEl.replaceWith(editEl);
        const ta = editEl.querySelector('.block-ta');
        autoResize(ta);
        ta.focus();
        bindBlockTa(ta);
        bindCopyButtons();
    });
    bindCopyButtons();
}

function renderViewer() {
    const html = md.render(content);
    app.innerHTML = toolbar() + `<div class="editor-content viewer-mode"><div class="viewer-content">${html}</div></div>`;
    bindToolbar();
    bindCopyButtons();
}

function renderSource() {
    app.innerHTML = toolbar() + `<div class="editor-content source-mode"><textarea class="source-ta" spellcheck="false">${esc(content)}</textarea></div>`;
    bindToolbar();
    const ta = app.querySelector('.source-ta');
    ta.addEventListener('input', () => { content = ta.value; save(); });
}

// ── Event binding ──────────────────────────────────────
function bindToolbar() {
    app.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (mode === 'source') {
                const ta = app.querySelector('.source-ta');
                if (ta) { content = ta.value; save(); }
            }
            mode = btn.dataset.mode;
            focusedBlockId = null;
            render();
        });
    });
}

function bindCopyButtons() {
    app.querySelectorAll('.code-copy').forEach(btn => {
        btn.addEventListener('click', () => {
            const code = btn.closest('.code-block').querySelector('code').textContent;
            navigator.clipboard.writeText(code);
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy', 1500);
        });
    });
}

function bindBlockTa(ta) {
    ta.addEventListener('input', () => {
        autoResize(ta);
        applyBlockEdit(ta);
    });
    ta.addEventListener('blur', () => {
        applyBlockEdit(ta);
        focusedBlockId = null;
        unfocusBlock(ta.dataset.id); // 局部替换，不重建整个 DOM
    });
    ta.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const s = ta.selectionStart, en = ta.selectionEnd;
            ta.value = ta.value.substring(0,s) + '    ' + ta.value.substring(en);
            ta.selectionStart = ta.selectionEnd = s + 4;
            applyBlockEdit(ta);
        }
        if (e.key === 'Escape') {
            applyBlockEdit(ta);
            focusedBlockId = null;
            unfocusBlock(ta.dataset.id);
        }
    });
}

function bindLive() {
    bindToolbar();
    bindCopyButtons();

    // Click rendered block → focus
    app.querySelectorAll('.block-rendered').forEach(el => {
        el.addEventListener('click', () => {
            focusedBlockId = el.dataset.id;
            const block = parseBlocks(content).find(b => b.id === el.dataset.id);
            const editEl = document.createElement('div');
            editEl.className = 'block block-focused';
            editEl.dataset.id = el.dataset.id;
            editEl.innerHTML = `<textarea class="block-ta" data-id="${el.dataset.id}" spellcheck="false">${esc(block ? block.raw : '')}</textarea>`;
            el.replaceWith(editEl);
            const ta = editEl.querySelector('.block-ta');
            autoResize(ta);
            ta.focus();
            bindBlockTa(ta);
            bindCopyButtons();
        });
    });

    // Textarea editing (首次 renderLive 时)
    app.querySelectorAll('.block-ta').forEach(ta => {
        autoResize(ta);
        bindBlockTa(ta);
    });
}

function applyBlockEdit(ta) {
    const bid = ta.dataset.id;
    const newRaw = ta.value;
    const blocks = parseBlocks(content);
    const parts = blocks.map(b => b.id === bid ? newRaw : b.raw);
    content = parts.join('\n\n');
    save();
}

function autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
}

// ── Boot ───────────────────────────────────────────────
function init() {
    // 从 #app 的 data-content 属性读取 base64 编码的文件内容
    // 这种方式完全不依赖 CSP、postMessage 握手，最可靠
    const el = document.getElementById('app');
    const b64 = el ? el.getAttribute('data-content') : '';
    if (b64) {
        try {
            content = decodeURIComponent(escape(atob(b64)));
        } catch(e) {
            try { content = atob(b64); } catch(e2) { content = ''; }
        }
    }
    if (!content) {
        content = '# Welcome\n\nStart editing...';
    }

    // Theme detection
    const updateTheme = () => {
        let dark = document.body.classList.contains('vscode-dark')
            || document.querySelector('[data-vscode-theme-kind*="dark"]') !== null;
        try { if (window.matchMedia('(prefers-color-scheme: dark)').matches) dark = true; } catch(e) {}
        document.body.classList.toggle('theme-dark', dark);
        document.body.classList.toggle('theme-light', !dark);
    };
    updateTheme();
    try { new MutationObserver(updateTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch(e) {}

    render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
