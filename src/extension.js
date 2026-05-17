const vscode = require('vscode');
const path = require('path');

class FlowMdEditorProvider {
    constructor(context) {
        this.context = context;
    }

    async openCustomDocument(uri, _openContext, _token) {
        return { uri, dispose() {} };
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

        // 读取文件内容，base64 编码放入 data 属性 —— 不受 CSP 限制
        const fileBytes = await vscode.workspace.fs.readFile(document.uri);
        const fileContent = new TextDecoder().decode(fileBytes);
        const b64 = Buffer.from(fileContent, 'utf-8').toString('base64');

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

        // 监听 webview 消息（保存 + 重新加载）
        webviewPanel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'save') {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(0, 0, 999999, 999999),
                    msg.content
                );
                await vscode.workspace.applyEdit(edit);
                document.save();
            }
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
