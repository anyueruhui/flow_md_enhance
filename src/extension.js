const vscode = require('vscode');
const path = require('path');

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
    <script src="${scriptUri}"></script>
</body>
</html>`;

        const uriKey = document.uri.toString();

        // Handle save messages from webview
        webviewPanel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'save') {
                this.lastSavedContent.set(uriKey, msg.content);
                const edit = new vscode.WorkspaceEdit();
                const lastLine = document.lineCount - 1;
                const lastChar = document.lineAt(lastLine).text.length;
                const fullRange = new vscode.Range(0, 0, lastLine, lastChar);
                edit.replace(document.uri, fullRange, msg.content);
                await vscode.workspace.applyEdit(edit);
                await document.save();
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
        vscode.window.registerCustomEditorProvider('flowMdEnhance.editor', provider, {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false,
        }),
        vscode.commands.registerCommand('flowMdEnhance.open', () => {
            vscode.commands.executeCommand('workbench.action.files.openFile');
        })
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
