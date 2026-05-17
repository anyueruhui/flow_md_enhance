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

// ── Search state ───────────────────────────────────────
let searchOpen = false;
let searchCaseSensitive = false;
let searchMatches = [];    // [{node, start, end}] for rendered; [{ta, start, end}] for textarea
let searchIndex = -1;
let searchDebounce = null;
let searchTerm = '';

// ── Undo history ───────────────────────────────────────
const history = [];
let historyIdx = -1;
const HISTORY_MAX = 50;

function pushHistory() {
    // Trim any redo states ahead of current position
    history.length = historyIdx + 1;
    history.push(content);
    if (history.length > HISTORY_MAX) history.shift();
    historyIdx = history.length - 1;
}

function undo() {
    if (historyIdx <= 0) return;
    historyIdx--;
    content = history[historyIdx];
    saveImmediate();
    focusedBlockId = null;
    render();
}

function redo() {
    if (historyIdx >= history.length - 1) return;
    historyIdx++;
    content = history[historyIdx];
    saveImmediate();
    focusedBlockId = null;
    render();
}

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
        pushHistory();
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

function searchBarHtml() {
    const countText = searchMatches.length > 0 ? `${searchIndex + 1}/${searchMatches.length}` : '0/0';
    return `<div class="search-bar${searchOpen ? ' open' : ''}">
        <input class="search-input" type="text" placeholder="Search..." spellcheck="false">
        <button class="search-btn search-case${searchCaseSensitive ? ' active' : ''}" title="Match Case (Aa)">Aa</button>
        <span class="search-count">${countText}</span>
        <button class="search-btn search-prev" title="Previous (Shift+Enter)">▲</button>
        <button class="search-btn search-next" title="Next (Enter)">▼</button>
        <button class="search-btn search-close" title="Close (Escape)">✕</button>
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
    let h = toolbar() + searchBarHtml() + '<div class="editor-content live-preview">';
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
    app.innerHTML = toolbar() + searchBarHtml() + `<div class="editor-content viewer-mode"><div class="viewer-content">${html}</div></div>`;
    bindToolbar();
    bindSearch();
}

function renderSource() {
    app.innerHTML = toolbar() + searchBarHtml() +
        `<div class="editor-content source-mode">` +
        `<div class="source-backdrop" aria-hidden="true"></div>` +
        `<textarea class="source-ta" spellcheck="false">${esc(content)}</textarea>` +
        `</div>`;
    bindToolbar();
    bindSearch();
    const ta = app.querySelector('.source-ta');
    const backdrop = app.querySelector('.source-backdrop');
    // Sync backdrop scroll with textarea
    ta.addEventListener('scroll', () => {
        backdrop.scrollTop = ta.scrollTop;
        backdrop.scrollLeft = ta.scrollLeft;
    });
    let sourceHistTimer = null;
    ta.addEventListener('input', () => {
        content = ta.value;
        save();
        if (searchOpen && searchTerm) updateSourceBackdrop();
        clearTimeout(sourceHistTimer);
        sourceHistTimer = setTimeout(() => pushHistory(), 1000);
    });
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

    pushHistory();

    newEl.addEventListener('click', () => {
        focusBlock(block.id);
    });
}

// ── Search logic ───────────────────────────────────────
function openSearch() {
    searchOpen = true;
    render();
    const input = app.querySelector('.search-input');
    if (input) input.focus();
}

function closeSearch() {
    clearHighlights();
    searchOpen = false;
    searchMatches = [];
    searchIndex = -1;
    render();
}

function updateSearchCount() {
    const count = app.querySelector('.search-count');
    if (count) {
        count.textContent = searchMatches.length > 0 ? `${searchIndex + 1}/${searchMatches.length}` : '0/0';
    }
}

function clearHighlights() {
    // Remove all search mark elements, restoring text nodes
    app.querySelectorAll('mark.search-hl, mark.search-hl-active').forEach(mark => {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });
    searchMatches = [];
    searchIndex = -1;
    searchTerm = '';
    // Clear source backdrop
    const backdrop = app.querySelector('.source-backdrop');
    if (backdrop) backdrop.innerHTML = '';
}

function highlightAll(term) {
    if (!term) { clearHighlights(); updateSearchCount(); return; }

    clearHighlights();
    searchTerm = term;
    const matches = [];

    if (mode === 'source') {
        // Source mode: search in source textarea, highlight via backdrop
        const ta = app.querySelector('.source-ta');
        if (ta) {
            const text = ta.value;
            const flags = searchCaseSensitive ? 'g' : 'gi';
            const regex = new RegExp(escapeRegex(term), flags);
            let m;
            while ((m = regex.exec(text)) !== null) {
                matches.push({ ta, start: m.index, end: m.index + m[0].length });
            }
        }
        updateSourceBackdrop();
    } else {
        // Live/Viewer mode: search in rendered HTML content
        const containers = mode === 'viewer'
            ? [app.querySelector('.viewer-content')].filter(Boolean)
            : Array.from(app.querySelectorAll('.block-html'));

        for (const container of containers) {
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            let n;
            while (n = walker.nextNode()) textNodes.push(n);

            // Build full text map: [{node, start, end}] mapping positions in concatenated text
            let fullText = '';
            const nodeMap = [];
            for (const tn of textNodes) {
                nodeMap.push({ node: tn, start: fullText.length, end: fullText.length + tn.textContent.length });
                fullText += tn.textContent;
            }

            const flags = searchCaseSensitive ? 'g' : 'gi';
            const regex = new RegExp(escapeRegex(term), flags);
            let m;
            while ((m = regex.exec(fullText)) !== null) {
                const matchStart = m.index;
                const matchEnd = m.index + m[0].length;

                // Find which text nodes this match spans
                for (const nm of nodeMap) {
                    if (nm.end <= matchStart || nm.start >= matchEnd) continue;
                    const overlapStart = Math.max(matchStart, nm.start) - nm.start;
                    const overlapEnd = Math.min(matchEnd, nm.end) - nm.start;
                    if (overlapEnd > overlapStart) {
                        matches.push({ node: nm.node, start: overlapStart, end: overlapEnd, container });
                    }
                }
            }
        }

        // Apply highlights (reverse order to avoid offset shifts)
        for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];
            if (!m.node || !m.node.parentNode) continue;
            try {
                const range = document.createRange();
                range.setStart(m.node, m.start);
                range.setEnd(m.node, m.end);
                const mark = document.createElement('mark');
                mark.className = 'search-hl';
                range.surroundContents(mark);
                m.markEl = mark;
            } catch(e) { /* cross-element matches may fail */ }
        }
    }

    searchMatches = matches;
    searchIndex = matches.length > 0 ? 0 : -1;
    if (searchIndex >= 0) activateMatch(searchIndex);
    updateSearchCount();
}

function activateMatch(idx, forceFocus) {
    if (idx < 0 || idx >= searchMatches.length) return;

    // Deactivate previous
    const prevActive = app.querySelector('mark.search-hl-active');
    if (prevActive) prevActive.className = 'search-hl';

    const m = searchMatches[idx];
    const searchInput = app.querySelector('.search-input');
    const searchHasFocus = searchInput && document.activeElement === searchInput;

    if (m.ta) {
        // Textarea match: focus when navigating (forceFocus) or search bar doesn't have focus
        if (forceFocus || !searchHasFocus) m.ta.focus();
        m.ta.setSelectionRange(m.start, m.end);
        scrollTextareaTo(m.ta, m.start);
        if (mode === 'source') updateSourceBackdrop();
    } else if (m.markEl) {
        // Rendered match: activate and scroll into view
        m.markEl.className = 'search-hl-active';
        m.markEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    updateSearchCount();
}

function scrollTextareaTo(ta, pos) {
    // Measure height of text before position using a mirror div
    const div = document.createElement('div');
    const cs = getComputedStyle(ta);
    div.style.font = cs.font;
    div.style.lineHeight = cs.lineHeight;
    div.style.padding = cs.padding;
    div.style.width = ta.clientWidth + 'px';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.textContent = ta.value.substring(0, pos) + '\n';
    document.body.appendChild(div);
    const target = div.scrollHeight - ta.clientHeight / 2;
    document.body.removeChild(div);
    ta.scrollTop = Math.max(0, target);
}

function updateSourceBackdrop() {
    const backdrop = app.querySelector('.source-backdrop');
    const ta = app.querySelector('.source-ta');
    if (!backdrop || !ta) return;

    if (!searchTerm) { backdrop.innerHTML = ''; return; }

    const text = ta.value;
    const flags = searchCaseSensitive ? 'g' : 'gi';
    const regex = new RegExp(escapeRegex(searchTerm), flags);
    let html = '';
    let lastIdx = 0;
    let matchIdx = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
        html += esc(text.substring(lastIdx, m.index));
        const cls = matchIdx === searchIndex ? 'search-hl-active' : 'search-hl';
        html += `<mark class="${cls}">${esc(m[0])}</mark>`;
        lastIdx = m.index + m[0].length;
        matchIdx++;
    }
    html += esc(text.substring(lastIdx));
    backdrop.innerHTML = html;

    // Sync scroll
    backdrop.scrollTop = ta.scrollTop;
    backdrop.scrollLeft = ta.scrollLeft;
}

function nextMatch() {
    if (searchMatches.length === 0) return;
    searchIndex = (searchIndex + 1) % searchMatches.length;
    activateMatch(searchIndex, true);
}

function prevMatch() {
    if (searchMatches.length === 0) return;
    searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
    activateMatch(searchIndex, true);
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function bindSearch() {
    const input = app.querySelector('.search-input');
    if (!input) return;

    input.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => highlightAll(input.value), 150);
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) prevMatch(); else nextMatch();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeSearch();
        }
    });

    const caseBtn = app.querySelector('.search-case');
    if (caseBtn) {
        caseBtn.addEventListener('click', () => {
            searchCaseSensitive = !searchCaseSensitive;
            caseBtn.classList.toggle('active', searchCaseSensitive);
            highlightAll(input.value);
            input.focus();
        });
    }

    const nextBtn = app.querySelector('.search-next');
    if (nextBtn) nextBtn.addEventListener('click', () => { nextMatch(); input.focus(); });

    const prevBtn = app.querySelector('.search-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => { prevMatch(); input.focus(); });

    const closeBtn = app.querySelector('.search-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);

    // Restore previous search term if search was open
    if (searchOpen && searchTerm && input.value === '') {
        input.value = searchTerm;
        highlightAll(searchTerm);
    }
}

// ── Event binding ──────────────────────────────────────
function bindToolbar() {
    app.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (mode === 'source') {
                const ta = app.querySelector('.source-ta');
                if (ta) { content = ta.value; saveImmediate(); pushHistory(); }
            }
            mode = btn.dataset.mode;
            focusedBlockId = null;
            render();
        });
    });
}

function bindLive(blocks) {
    bindToolbar();
    bindSearch();

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

    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
            e.preventDefault();
            openSearch();
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            const tag = document.activeElement && document.activeElement.tagName;
            if (tag === 'TEXTAREA' || tag === 'INPUT') {
                document.execCommand(e.shiftKey ? 'redo' : 'undo');
                return;
            }
            if (e.shiftKey) redo(); else undo();
        }
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

    pushHistory();
    render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
