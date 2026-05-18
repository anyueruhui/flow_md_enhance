const vscode = require('vscode');
const path = require('path');

const VIEW_TYPE = 'flowMdEnhance.editor';
const autoOpeningUris = new Set();

function sameUri(left, right) {
    return Boolean(left && right && left.toString() === right.toString());
}

function isMarkdownFileUri(uri) {
    return Boolean(uri
        && uri.scheme === 'file'
        && /\.md$/i.test(uri.fsPath || uri.path || ''));
}

function isUriInTextDiff(uri) {
    try {
        return vscode.window.tabGroups.all.some(group => group.tabs.some(tab => {
            const input = tab.input;
            return Boolean(input
                && input.original
                && input.modified
                && (sameUri(input.original, uri) || sameUri(input.modified, uri)));
        }));
    } catch(e) {
        console.error('FlowMD: diff tab detection error', e);
        return false;
    }
}

async function autoOpenMarkdownEditor(editor) {
    if (!editor) return;
    const enabled = vscode.workspace.getConfiguration('flowMdEnhance').get('autoOpenMarkdown', true);
    if (!enabled || !isMarkdownFileUri(editor.document.uri) || isUriInTextDiff(editor.document.uri)) return;

    const uriKey = editor.document.uri.toString();
    if (autoOpeningUris.has(uriKey)) return;

    autoOpeningUris.add(uriKey);
    try {
        await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, VIEW_TYPE, {
            preview: false,
            preserveFocus: false,
            viewColumn: editor.viewColumn,
        });
    } catch(e) {
        console.error('FlowMD: auto open Markdown editor error', e);
    } finally {
        setTimeout(() => autoOpeningUris.delete(uriKey), 500);
    }
}

class FlowMdEditorProvider {
    constructor(context) {
        this.context = context;
        this.lastSavedContent = new Map();
    }

    async openCustomDocument(uri, _openContext) {
        return {
            uri,
            async backup(destination) {
                const content = (await vscode.workspace.fs.readFile(uri)).toString();
                await vscode.workspace.fs.writeFile(destination, Buffer.from(content, 'utf-8'));
            },
            async revert() {},
            dispose() {}
        };
    }

    async resolveCustomEditor(document, webviewPanel, _token) {
        const uriKey = document.uri.toString();
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.context.extensionUri,
                vscode.Uri.file(path.dirname(document.uri.fsPath)),
            ],
        };

        const webviewDir = path.join(this.context.extensionPath, 'out', 'webview');
        const scriptUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(webviewDir, 'main.js')));
        const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(webviewDir, 'style.css')));
        const csp = webviewPanel.webview.cspSource;

        // M5: read file bytes → base64 directly (skip unnecessary string decode/re-encode)
        const fileBytes = await vscode.workspace.fs.readFile(document.uri);
        const b64 = Buffer.from(fileBytes).toString('base64');
        const defaultMode = vscode.workspace.getConfiguration('flowMdEnhance').get('defaultMode', 'live');
        const fileDir = path.dirname(document.uri.fsPath || document.uri.path);
        const fileDirUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(fileDir)) + '/';

        webviewPanel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src 'unsafe-inline' ${csp};
                 script-src 'unsafe-inline' 'unsafe-eval' ${csp};
                 img-src * data: blob:;
                 font-src ${csp};">
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div id="app" data-content="${b64}"></div>
    <script>window.__DEFAULT_MODE__ = "${defaultMode}"; window.__FILE_DIR_URI__ = "${fileDirUri}";</script>
    <script src="${scriptUri}?v=${Date.now()}"></script>
</body>
</html>`;

        // Handle save messages from webview
        webviewPanel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'save') {
                this.lastSavedContent.set(uriKey, msg.content);
                const encoder = new TextEncoder();
                await vscode.workspace.fs.writeFile(document.uri, encoder.encode(msg.content));
            }
        });

        // Watch for external file changes — skip self-triggered updates (H4)
        const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
        const changeSub = watcher.onDidChange(async () => {
            try {
                const newContent = (await vscode.workspace.fs.readFile(document.uri)).toString();
                const saved = this.lastSavedContent.get(uriKey);
                if (newContent !== saved) {
                    webviewPanel.webview.postMessage({ type: 'update', content: newContent });
                }
            } catch(e) {
                console.error('FlowMD: file watcher error', e);
            }
        });
        webviewPanel.onDidDispose(() => {
            changeSub.dispose();
            watcher.dispose();
            this.lastSavedContent.delete(uriKey);
        });
    }
}

function activate(context) {
    const provider = new FlowMdEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false,
        }),
        vscode.commands.registerCommand('flowMdEnhance.open', () => {
            vscode.commands.executeCommand('workbench.action.files.openFile');
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            setTimeout(() => autoOpenMarkdownEditor(editor), 0);
        })
    );
    setTimeout(() => autoOpenMarkdownEditor(vscode.window.activeTextEditor), 0);
}

function deactivate() {}

module.exports = { activate, deactivate };
