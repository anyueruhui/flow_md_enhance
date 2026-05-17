/**
 * FlowMD Enhance — 测试套件 v3
 * 验证 base64 data 属性内容传递方案
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

// ── 模拟完整 webview 加载 ──
async function loadWebview(mdContent) {
    const b64 = Buffer.from(mdContent, 'utf-8').toString('base64');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body class="vscode-dark">
    <div id="app" data-content="${b64}"></div>
    <script>${bundleCode}</script>
</body></html>`;
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    // 替换固定等待为轮询
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
        setTimeout(resolve, 3000); // 最大等3秒
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
        // 模拟浏览器 atob（只处理 Latin1）
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

    // 默认 Live
    assert(app.querySelector('.live-preview') !== null, '默认 Live 模式');

    // → Viewer
    const viewBtn = Array.from(app.querySelectorAll('.mode-btn')).find(b => b.dataset.mode === 'viewer');
    viewBtn.click();
    assert(app.querySelector('.viewer-mode') !== null, '切换到 Viewer');

    // → Source
    const srcBtn = Array.from(app.querySelectorAll('.mode-btn')).find(b => b.dataset.mode === 'source');
    srcBtn.click();
    assert(app.querySelector('.source-mode') !== null, '切换到 Source');
    assert(app.querySelector('.source-ta') !== null, 'Source textarea');

    // → Live
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
async function main() {
    console.log('══════════════════════════════════════════');
    console.log('  FlowMD Enhance — 测试套件 v3');
    console.log('══════════════════════════════════════════');

    try { testMarkdown(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testBase64(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { await testWebviewRender(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { await testHtmlTags(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { await testModes(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testExtension(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }
    try { testArtifacts(); } catch(e) { console.log('  ❌ CRASH:', e.message); fail++; }

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
