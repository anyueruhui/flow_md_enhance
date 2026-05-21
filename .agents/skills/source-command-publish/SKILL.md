---
name: "source-command-publish"
description: "发布 FlowMD Enhance 扩展。流程：构建验证 → commit → bump 版本 → git tag → 发布到 VS Code 商店 → push 到 GitHub"
---

# source-command-publish

Use this skill when the user asks to run the migrated source command `publish`.

## Command Template

# Publish FlowMD Enhance

## 前置条件

- 工作目录有改动需要发布
- `package.json` 中 `version` 字段为当前版本
- PAT 已配置（`vsce login` 或环境变量）

## 流程

### 1. 前置检查

```bash
# 确认有未提交改动
git status --short
git diff --stat

# 确认当前版本
node -p "require('./package.json').version"
```

向用户展示待提交改动和当前版本号，**确认是否继续**。

询问版本号升级类型（默认 patch）：
- **patch**: 0.2.3 → 0.2.4（bug 修复）
- **minor**: 0.2.3 → 0.3.0（新功能）
- **major**: 0.2.3 → 1.0.0（破坏性变更）

### 2. 构建验证

```bash
node build.js
node test/run.js
```

构建或测试失败则**终止流程**。

### 3. Commit

```bash
git add -A
git commit -m "chore: v<VERSION>"
```

如果用户提供了自定义 commit message 则使用用户版本。如有未跟踪的设计文档（`docs/superpowers/`），询问是否纳入此次提交。

### 4. Bump 版本 + Tag

```bash
# 根据用户选择的类型 bump
npm version <patch|minor|major> --no-git-tag-version
git add package.json
VERSION=$(node -p "require('./package.json').version")
git commit -m "chore: v${VERSION}"
git tag "v${VERSION}"
```

### 5. 发布到 VS Code 商店

```bash
npx vsce publish --no-dependencies
```

发布失败则**终止流程**，不执行 push（避免远端有未发布的版本）。

### 6. Push 到 GitHub

```bash
git push origin main --follow-tags
```

`--follow-tags` 确保 annotated tag 一起推送。

### 7. 确认

输出最终状态：
```
✓ v<VERSION> published to VS Code Marketplace
✓ Pushed to github.com:anyueruhui/flow_md_enhance
✓ Tag: v<VERSION>
```

## 注意事项

- 步骤 5（发布）失败时不执行步骤 6（push），避免远端版本与商店不同步
- 如果只有 `docs/` 或 `style` 改动不涉及功能变更，仍建议 patch bump
- `docs/superpowers/specs/` 下的设计文档通常不纳入发布 commit，发布前确认是否需要排除
