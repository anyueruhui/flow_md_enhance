const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
    entryPoints: [path.join(__dirname, 'src', 'main.ts')],
    bundle: true,
    outfile: path.join(__dirname, '..', 'out', 'webview', 'main.js'),
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify: false,
    sourcemap: true,
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    external: [],
}).then(() => {
    console.log('Webview build complete');
}).catch((err) => {
    console.error('Webview build failed:', err);
    process.exit(1);
});
