const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function build() {
    fs.mkdirSync(path.join(ROOT, 'out', 'webview'), { recursive: true });

    // 1. Copy CSS
    fs.copyFileSync(path.join(ROOT, 'src', 'style.css'), path.join(ROOT, 'out', 'webview', 'style.css'));
    console.log('✓ CSS copied');

    // 2. Copy extension
    fs.copyFileSync(path.join(ROOT, 'src', 'extension.js'), path.join(ROOT, 'out', 'extension.js'));
    console.log('✓ Extension copied');

    // 3. Bundle webview with esbuild
    execSync(
        `NODE_PATH=/tmp/fmd-build/node_modules npx esbuild ` +
        `${path.join(ROOT, 'src', 'webview.js')} ` +
        `--outfile=${path.join(ROOT, 'out', 'webview', 'main.js')} ` +
        `--bundle --format=iife --target=es2020 --platform=browser --sourcemap`,
        { stdio: 'inherit', cwd: ROOT }
    );
    console.log('✓ Webview bundled');

    const mainSize = fs.statSync(path.join(ROOT, 'out', 'webview', 'main.js')).size;
    console.log(`\nBuild complete! webview: ${(mainSize / 1024).toFixed(1)} KB`);
}

build();
