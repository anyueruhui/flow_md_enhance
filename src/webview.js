/**
 * FlowMD Enhance — Webview
 * WYSIWYG Markdown + HTML renderer
 */

// ── markdown-it (bundled inline by build.js as var MarkdownIt) ──────
var MarkdownIt = typeof MarkdownIt !== 'undefined' ? MarkdownIt : require('markdown-it');
var TaskCheckbox = typeof TaskCheckbox !== 'undefined' ? TaskCheckbox : require('markdown-it-task-checkbox');
var DOMPurify = typeof DOMPurify !== 'undefined' ? DOMPurify : require('dompurify');

const md = new MarkdownIt({
    html: true,
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

// ── DOMPurify config ──────────────────────────────────
const purifyConfig = {
    ALLOWED_TAGS: [
        'strong','em','b','i','u','s','mark','kbd','sub','sup',
        'font','span','details','summary','input','label','a','img','br','hr',
        'p','div','h1','h2','h3','h4','h5','h6','ul','ol','li',
        'table','thead','tbody','tr','th','td','blockquote','pre','code',
        'del','ins','dl','dt','dd','figure','figcaption','abbr',
        'ruby','rt','rp','bdi','bdo','cite','dfn','var','samp','small','wbr',
    ],
    ALLOWED_ATTR: [
        'href','src','alt','title','class','id','style','color','type',
        'checked','disabled','for','data-*','target','rel',
        'colspan','rowspan','width','height',
    ],
    ALLOW_DATA_ATTR: true
};

// ── State ──────────────────────────────────────────────
let mode = 'live';
let content = '';
let focusedBlockId = null;
let focusedBlockLen = 0;

const app = document.getElementById('app');
const vscodeApi = window.acquireVscodeApi ? window.acquireVscodeApi() : null;

// ── Save with debounce ────────────────────────────────
let saveTimer = null;
function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        if (vscodeApi) vscodeApi.postMessage({ type: 'save', content });
    }, 300);
}
function saveImmediate() {
    clearTimeout(saveTimer);
    if (vscodeApi) vscodeApi.postMessage({ type: 'save', content });
}

// ── Receive extension messages ────────────────────────
window.addEventListener('message', e => {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'init' || msg.type === 'update') {
        const newContent = msg.content || '';
        if (newContent === content) return;
        content = newContent;
        focusedBlockId = null;
        render();
    }
});

// ── Block parser (with character offsets) ──────────────
function parseBlocks(src) {
    const blocks = [];
    const lines = src.split('\n');
    let buf = [];
    let inCode = false;
    let offset = 0;
    let bufStart = -1;

    const flush = () => {
        if (buf.length === 0) return;
        const raw = buf.join('\n');
        const id = `b${blocks.length}`;
        let html = md.render(raw);
        html = DOMPurify.sanitize(html, purifyConfig);
        const trimmed = raw.trimStart();
        let type = 'paragraph';
        if (/^#{1,6}\s/.test(trimmed)) type = 'heading';
        else if (/^```|^~~~/.test(trimmed)) type = 'code';
        else if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) type = 'list';
        else if (trimmed.startsWith('|')) type = 'table';
        else if (trimmed.startsWith('>')) type = 'blockquote';
        else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) type = 'hr';
        else if (/^<[a-zA-Z]/.test(trimmed)) type = 'html';
        blocks.push({ id, raw, html, type, start: bufStart, end: bufStart + raw.length });
        buf = [];
        bufStart = -1;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trimStart().startsWith('```') || line.trimStart().startsWith('~~~')) {
            if (!inCode) {
                flush();
                bufStart = offset;
                buf.push(line);
                inCode = true;
            } else {
                buf.push(line);
                flush();
                inCode = false;
            }
            offset += line.length + 1;
            continue;
        }
        if (inCode) {
            if (buf.length === 0) bufStart = offset;
            buf.push(line);
            offset += line.length + 1;
            continue;
        }
        if (line.trim() === '') {
            flush();
            offset += line.length + 1;
            continue;
        }
        if (/^#{1,6}\s/.test(line)) {
            flush();
            let h = md.render(line);
            h = DOMPurify.sanitize(h, purifyConfig);
            blocks.push({ id:`b${blocks.length}`, raw:line, html:h, type:'heading', start:offset, end:offset + line.length });
            offset += line.length + 1;
            continue;
        }
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
            flush();
            let h = md.render(line);
            h = DOMPurify.sanitize(h, purifyConfig);
            blocks.push({ id:`b${blocks.length}`, raw:line, html:h, type:'hr', start:offset, end:offset + line.length });
            offset += line.length + 1;
            continue;
        }
        if (buf.length === 0) bufStart = offset;
        buf.push(line);
        offset += line.length + 1;
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
            focusedBlockLen = b.raw.length;
            h += `<div class="block block-focused" data-id="${b.id}"><textarea class="block-ta" data-id="${b.id}" spellcheck="false">${esc(b.raw)}</textarea></div>`;
        } else {
            h += `<div class="block block-rendered" data-id="${b.id}"><div class="block-html">${b.html}</div></div>`;
        }
    }
    h += '</div>';
    app.innerHTML = h;
    bindLive(blocks);
}

function renderViewer() {
    let html = md.render(content);
    html = DOMPurify.sanitize(html, purifyConfig);
    app.innerHTML = toolbar() + `<div class="editor-content viewer-mode"><div class="viewer-content">${html}</div></div>`;
    bindToolbar();
}

function renderSource() {
    app.innerHTML = toolbar() + `<div class="editor-content source-mode"><textarea class="source-ta" spellcheck="false">${esc(content)}</textarea></div>`;
    bindToolbar();
    const ta = app.querySelector('.source-ta');
    ta.addEventListener('input', () => { content = ta.value; save(); });
}

// ── Block editing ──────────────────────────────────────
function focusBlock(blockId) {
    const blocks = parseBlocks(content);
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const blockOffset = block.start;
    focusedBlockId = blockId;
    focusedBlockLen = block.raw.length;

    const oldEl = app.querySelector(`[data-id="${blockId}"]`);
    if (!oldEl) return;

    const editEl = document.createElement('div');
    editEl.className = 'block block-focused';
    editEl.dataset.id = blockId;
    editEl.innerHTML = `<textarea class="block-ta" data-id="${blockId}" spellcheck="false">${esc(block.raw)}</textarea>`;
    oldEl.replaceWith(editEl);

    const ta = editEl.querySelector('.block-ta');
    autoResize(ta);
    ta.focus();
    setupTextarea(ta, blockOffset);
}

function setupTextarea(ta, blockOffset) {
    ta.addEventListener('input', () => {
        autoResize(ta);
        const newRaw = ta.value;
        content = content.slice(0, blockOffset) + newRaw + content.slice(blockOffset + focusedBlockLen);
        focusedBlockLen = newRaw.length;
        save();
    });

    ta.addEventListener('blur', () => {
        setTimeout(() => {
            const clickedAnother = focusedBlockId !== null && focusedBlockId !== ta.dataset.id;
            if (!clickedAnother) {
                focusedBlockId = null;
            }
            unfocusTa(ta, blockOffset);
        }, 50);
    });

    ta.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const s = ta.selectionStart, en = ta.selectionEnd;
            ta.value = ta.value.substring(0, s) + '    ' + ta.value.substring(en);
            ta.selectionStart = ta.selectionEnd = s + 4;
            const newRaw = ta.value;
            content = content.slice(0, blockOffset) + newRaw + content.slice(blockOffset + focusedBlockLen);
            focusedBlockLen = newRaw.length;
            save();
        }
        if (e.key === 'Escape') {
            focusedBlockId = null;
            unfocusTa(ta, blockOffset);
        }
    });
}

function unfocusTa(ta, blockOffset) {
    const currentBlocks = parseBlocks(content);
    const block = currentBlocks.find(b => b.start === blockOffset);
    if (!block) return;

    const oldEl = ta.closest('.block');
    if (!oldEl) return;

    const newEl = document.createElement('div');
    newEl.className = 'block block-rendered';
    newEl.dataset.id = block.id;
    newEl.innerHTML = `<div class="block-html">${block.html}</div>`;
    oldEl.replaceWith(newEl);

    newEl.addEventListener('click', () => {
        focusBlock(block.id);
    });
}

// ── Event binding ──────────────────────────────────────
function bindToolbar() {
    app.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (mode === 'source') {
                const ta = app.querySelector('.source-ta');
                if (ta) { content = ta.value; saveImmediate(); }
            }
            mode = btn.dataset.mode;
            focusedBlockId = null;
            render();
        });
    });
}

function bindLive(blocks) {
    bindToolbar();

    app.querySelectorAll('.block-rendered').forEach(el => {
        el.addEventListener('click', () => {
            focusBlock(el.dataset.id);
        });
    });

    if (focusedBlockId) {
        const ta = app.querySelector(`.block-ta[data-id="${focusedBlockId}"]`);
        if (ta) {
            const block = blocks.find(b => b.id === focusedBlockId);
            if (block) {
                autoResize(ta);
                setupTextarea(ta, block.start);
            }
        }
    }
}

function autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
}

// ── Boot ───────────────────────────────────────────────
function init() {
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
        content = '';
    }

    // Copy button — event delegation on app (M1: prevents duplicate listeners)
    app.addEventListener('click', e => {
        if (!e.target.classList.contains('code-copy')) return;
        const codeBlock = e.target.closest('.code-block');
        if (!codeBlock) return;
        const code = codeBlock.querySelector('code');
        if (!code) return;
        navigator.clipboard.writeText(code.textContent);
        e.target.textContent = 'Copied!';
        setTimeout(() => e.target.textContent = 'Copy', 1500);
    });

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
