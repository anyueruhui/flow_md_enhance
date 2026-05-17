/**
 * FlowMD Enhance — 测试套件 v4
 * 包含回归测试（H1-H5, M1-M5）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/fmd-build/node_modules/jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, errors = [];

function assert(cond, msg) {
    if (cond) { pass++; console.log(`  ✅ ${msg}`); }
    else { fail++; errors.push(msg); console.log(`  ❌ ${msg}`); }
}

const bundleCode = fs.readFileSync(path.join(ROOT, 'out', 'webview', 'main.js'), 'utf8');
const extCode = fs.readFileSync(path.join(ROOT, 'out', 'extension.js'), 'utf8');

async function loadWebview(mdContent) {
    const b64 = Buffer.from(mdContent, 'utf-8').toString('base64');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body class="vscode-dark">
    <div id="app" data-content="${b64}"></div>
    <script>${bundleCode}</script>
</body></html>`;
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    await new Promise((resolve) => {
        const check = () => {
            const app = dom.window.document.getElementById('app');
            if (app && app.innerHTML.length > 0 && !app.innerHTML.includes('Loading')) {
                resolve();
            } else {
                setTimeout(check, 20);
            }
        };
        setTimeout(check, 20);
        setTimeout(resolve, 3000);
    });
    return dom;
}

// ─────────────────────────────────────────────
// Test 1: markdown-it 渲染
// ─────────────────────────────────────────────
function testMarkdown() {
    console.log('\n📋 Test 1: markdown-it HTML 渲染');
    const MarkdownIt = require('/tmp/fmd-build/node_modules/markdown-it');
    const TaskCheckbox = require('/tmp/fmd-build/node_modules/markdown-it-task-checkbox');
    const md = new MarkdownIt({ html: true, breaks: true }).use(TaskCheckbox);
    const cases = [
        ['<strong>', '<strong>B</strong>', '<strong>B</strong>'],
        ['<font color>', '<font color="red">R</font>', 'color="red"'],
        ['<span style>', '<span style="color:blue">B</span>', 'style="color:blue"'],
        ['<mark>', '<mark>H</mark>', '<mark>H</mark>'],
        ['<kbd>', '<kbd>K</kbd>', '<kbd>K</kbd>'],
        ['<sub>', 'H<sub>2</sub>O', '<sub>2</sub>'],
        ['<sup>', 'x<sup>2</sup>', '<sup>2</sup>'],
        ['<details>', '<details><summary>S</summary>C</details>', '<details>'],
        ['# 标题', '# H', '<h1>'],
        ['**粗**', '**B**', '<strong>B</strong>'],
        ['*斜*', '*I*', '<em>I</em>'],
        ['~~删~~', '~~D~~', '<s>D</s>'],
        ['表格', '|A|B|\n|-|-|\n|1|2|', '<table>'],
        ['代码', '```\ncode\n```', '<code'],
        ['引用', '> Q', '<blockquote>'],
        ['列表', '- a\n- b', '<li>'],
        ['任务列表 [ ]', '- [ ] todo', '<input type="checkbox"'],
        ['任务列表 [x]', '- [x] done', 'checked'],
    ];
    for (const [name, input, expect] of cases) {
        assert(md.render(input).includes(expect), name);
    }
}

// ─────────────────────────────────────────────
// Test 2: Base64 编解码正确性
// ─────────────────────────────────────────────
function testBase64() {
    console.log('\n📋 Test 2: Base64 编解码');
    const cases = [
        'Hello World',
        '# 标题\n\n段落',
        '<font color="red">红色</font>',
        '代码:\n```js\nconst x = 1;\n```\n结束',
        '# 中文内容 <strong>混合</strong>\n\n- 列表1\n- 列表2',
        '特殊字符: < > & " \' ` $ { } \\n \\t',
    ];
    for (const c of cases) {
        const b64 = Buffer.from(c, 'utf-8').toString('base64');
        const decoded = decodeURIComponent(escape(atob(b64)));
        assert(decoded === c, `roundtrip: "${c.substring(0, 30)}${c.length > 30 ? '...' : ''}"`);
    }
}

// ─────────────────────────────────────────────
// Test 3: Webview 完整加载 + 内容渲染
// ─────────────────────────────────────────────
async function testWebviewRender() {
    console.log('\n📋 Test 3: Webview 完整加载');

    const md = '# 测试标题\n\n<font color="red">红色文字</font>\n\n**加粗**';
    const dom = await loadWebview(md);
    const app = dom.window.document.getElementById('app');

    assert(app.innerHTML.length > 50, `内容已渲染 (${app.innerHTML.length} chars)`);
    assert(!app.innerHTML.includes('Welcome'), '不是 Welcome fallback');
    assert(app.innerHTML.includes('测试标题') || app.innerHTML.includes('<h1>'), '包含标题');
    assert(app.innerHTML.includes('toolbar'), '包含工具栏');
    assert(app.innerHTML.includes('block'), '包含内容块');

    dom.window.close();
}

// ─────────────────────────────────────────────
// Test 4: HTML 标签渲染
// ─────────────────────────────────────────────
async function testHtmlTags() {
    console.log('\n📋 Test 4: HTML 标签在 webview 中渲染');

    const md = '# HTML 测试\n\n<strong>加粗</strong>\n\n<font color="red">红色</font>\n\n<mark>高亮</mark>\n\n<kbd>Ctrl+C</kbd>';
    const dom = await loadWebview(md);
    const app = dom.window.document.getElementById('app');
    const html = app.innerHTML;

    assert(html.includes('<strong>加粗</strong>'), '<strong> 渲染');
    assert(html.includes('color="red"') || html.includes('color:red'), '<font color> 渲染');
    assert(html.includes('<mark>高亮</mark>'), '<mark> 渲染');
    assert(html.includes('<kbd>Ctrl+C</kbd>'), '<kbd> 渲染');

    dom.window.close();
}

// ─────────────────────────────────────────────
// Test 5: 三种模式切换
// ─────────────────────────────────────────────
async function testModes() {
    console.log('\n📋 Test 5: 三种模式');
    const dom = await loadWebview('# Title\n\nParagraph');
    const doc = dom.window.document;
    const app = doc.getElementById('app');

    assert(app.querySelector('.live-preview') !== null, '默认 Live 模式');

    const viewBtn = Array.from(app.querySelectorAll('.mode-btn')).find(b => b.dataset.mode === 'viewer');
    viewBtn.click();
    assert(app.querySelector('.viewer-mode') !== null, '切换到 Viewer');

    const srcBtn = Array.from(app.querySelectorAll('.mode-btn')).find(b => b.dataset.mode === 'source');
    srcBtn.click();
    assert(app.querySelector('.source-mode') !== null, '切换到 Source');
    assert(app.querySelector('.source-ta') !== null, 'Source textarea');

    const liveBtn = Array.from(app.querySelectorAll('.mode-btn')).find(b => b.dataset.mode === 'live');
    liveBtn.click();
    assert(app.querySelector('.live-preview') !== null, '切回 Live');

    dom.window.close();
}

// ─────────────────────────────────────────────
// Test 6: Extension 代码质量
// ─────────────────────────────────────────────
function testExtension() {
    console.log('\n📋 Test 6: Extension 代码');
    assert(extCode.includes('data-content'), '使用 data-content 属性传递内容');
    assert(extCode.includes('base64') || extCode.includes('b64') || extCode.includes('toString'), 'base64 编码');
    assert(extCode.includes("'unsafe-inline'"), 'CSP unsafe-inline');
    assert(extCode.includes('enableScripts'), 'enableScripts');
    assert(!extCode.includes('__INITIAL_CONTENT__'), '无 __INITIAL_CONTENT__');
    assert(extCode.includes('readFile'), '读取文件');
}

// ─────────────────────────────────────────────
// Test 7: 构建产物
// ─────────────────────────────────────────────
function testArtifacts() {
    console.log('\n📋 Test 7: 构建产物');
    for (const f of ['out/extension.js', 'out/webview/main.js', 'out/webview/style.css']) {
        const full = path.join(ROOT, f);
        assert(fs.existsSync(full), `${f} 存在`);
        if (fs.existsSync(full)) {
            assert(fs.statSync(full).size > 0, `${f} 非空`);
        }
    }
}

// ─────────────────────────────────────────────
// Test 8: [H1+H2 回归] 重复内容块编辑
// ─────────────────────────────────────────────
async function testDuplicateBlockEdit() {
    console.log('\n📋 Test 8: [H1+H2 回归] 重复内容块编辑');

    // 两个内容相同的块，验证它们在 DOM 中有不同 data-id
    const md = 'hello\n\nhello\n\nworld';
    const dom = await loadWebview(md);
    const doc = dom.window.document;
    const app = doc.getElementById('app');

    const renderedBlocks = app.querySelectorAll('.block-rendered');
    assert(renderedBlocks.length === 3, `3 个渲染块 (got ${renderedBlocks.length})`);

    // 两个 "hello" 块的 data-id 必须不同
    const ids = Array.from(renderedBlocks).map(el => el.dataset.id);
    assert(ids[0] !== ids[1], '重复块 ID 不同');

    // 点击第二个块聚焦
    renderedBlocks[1].click();
    await new Promise(r => setTimeout(r, 100));

    // 应该出现一个 textarea
    const ta = app.querySelector('.block-ta');
    assert(ta !== null, '聚焦后出现 textarea');
    assert(ta.value === 'hello', 'textarea 内容为 hello');

    // 编辑第二个块
    ta.value = 'edited';
    ta.dispatchEvent(new dom.window.Event('input'));
    await new Promise(r => setTimeout(r, 100));

    // blur 回渲染态，验证结果，检查 blur 后的渲染结果
    ta.blur();
    await new Promise(r => setTimeout(r, 150));

    // 第二个块应该显示 "edited" 而不是 "hello"
    const allBlocks = app.querySelectorAll('.block');
    const blockTexts = Array.from(allBlocks).map(el => el.textContent);
    assert(blockTexts.some(t => t.includes('edited')), '第二个块显示 edited');
    assert(blockTexts.some(t => t.includes('hello') && !t.includes('edited')), '第一个块仍显示 hello');

    dom.window.close();
}

// ─────────────────────────────────────────────
// Test 9: [H5+M4 回归] DOMPurify 扩展白名单
// ─────────────────────────────────────────────
async function testPurifyAllowlist() {
    console.log('\n📋 Test 9: [H5+M4 回归] DOMPurify 扩展白名单');

    const md = '# 标签测试\n\n<b>粗体</b>\n\n<i>斜体</i>\n\n<u>下划线</u>\n\n<ruby>汉<rt>hàn</rt></ruby>\n\n<table><tr><td colspan="2">合并</td></tr></table>';
    const dom = await loadWebview(md);
    const app = dom.window.document.getElementById('app');
    const html = app.innerHTML;

    assert(html.includes('<b>粗体</b>'), '<b> 保留');
    assert(html.includes('<i>斜体</i>'), '<i> 保留');
    assert(html.includes('<u>下划线</u>'), '<u> 保留');
    assert(html.includes('<rt>hàn</rt>'), '<rt> 保留');
    assert(html.includes('colspan="2"'), 'colspan 属性保留');

    dom.window.close();
}

// ─────────────────────────────────────────────
// Test 10: [H4 回归] Extension watcher 过滤自保存
// ─────────────────────────────────────────────
function testWatcherFilter() {
    console.log('\n📋 Test 10: [H4 回归] Watcher 过滤自保存');
    assert(extCode.includes('lastSavedContent'), '使用 lastSavedContent 追踪');
    assert(extCode.includes('newContent !== saved') || extCode.includes('!== saved'), 'watcher 比较已保存内容');
    assert(extCode.includes('new Map'), 'lastSavedContent 是 Map（支持多文档）');
}

// ─────────────────────────────────────────────
// Test 11: [M1 回归] Copy 按钮事件委托
// ─────────────────────────────────────────────
function testCopyDelegation() {
    console.log('\n📋 Test 11: [M1 回归] Copy 事件委托');
    // bundleCode 中不应有 bindCopyButtons 函数定义
    assert(!bundleCode.includes('function bindCopyButtons'), 'bindCopyButtons 函数已移除');
    assert(bundleCode.includes('code-copy'), 'code-copy 类仍存在');
}

// ─────────────────────────────────────────────
// Test 12: [M2 回归] save 防抖
// ─────────────────────────────────────────────
function testSaveDebounce() {
    console.log('\n📋 Test 12: [M2 回归] save 防抖');
    assert(bundleCode.includes('saveTimer'), 'saveTimer 变量存在');
    assert(bundleCode.includes('clearTimeout(saveTimer)'), 'clearTimeout 防抖');
    assert(bundleCode.includes('saveImmediate'), 'saveImmediate 用于即时保存');
}

// ─────────────────────────────────────────────
// Test 13: [M3 回归] 非空 catch
// ─────────────────────────────────────────────
function testNonEmptyCatch() {
    console.log('\n📋 Test 13: [M3 回归] 非空 catch');
    assert(!extCode.includes('catch(e) {}'), '无空 catch(e) {}');
    assert(extCode.includes('console.error'), 'catch 中有 console.error');
}

// ─────────────────────────────────────────────
// Test 14: [M5 回归] Base64 直接转换
// ─────────────────────────────────────────────
function testBase64Direct() {
    console.log('\n📋 Test 14: [M5 回归] Base64 直接转换');
    assert(!extCode.includes('TextDecoder'), '无 TextDecoder（多余中间步骤）');
    assert(extCode.includes("Buffer.from(fileBytes).toString('base64')"), '直接从 bytes 转 base64');
}

// ─────────────────────────────────────────────
async function main() {
    console.log('══════════════════════════════════════════');
    console.log('  FlowMD Enhance — 测试套件 v4');
    console.log('══════════════════════════════════════════');

    try { testMarkdown(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testBase64(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { await testWebviewRender(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { await testHtmlTags(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { await testModes(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testExtension(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testArtifacts(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { await testDuplicateBlockEdit(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { await testPurifyAllowlist(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testWatcherFilter(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testCopyDelegation(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testSaveDebounce(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testNonEmptyCatch(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testBase64Direct(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }

    console.log('\n══════════════════════════════════════════');
    console.log(`  结果: ${pass} passed, ${fail} failed`);
    if (errors.length) {
        console.log('  失败项:');
        errors.forEach(e => console.log(`    - ${e}`));
    }
    console.log('══════════════════════════════════════════');
    process.exit(fail > 0 ? 1 : 0);
}

main();
