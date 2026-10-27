# Contributing to All-Tools / 参与贡献

**English** | [简体中文](#简体中文-1)

## The best way to contribute: add a tool manifest

The most valuable contribution is a new **tool adaptation manifest** — it makes one more GitHub tool one-click-runnable inside All-Tools.

1. Read [manifests/SCHEMA.md](./manifests/SCHEMA.md) (field spec, port templating, examples).
2. Create `manifests/tools/<tool-id>.json` (kebab-case id). Pick from real repos with healthy activity; prefer tools that run standalone (no external database required).
3. Verify locally:
   ```bash
   cd host && npm install && npm run dev
   # In the app: acquire the tool → open it → confirm it works
   node host/scripts/validate-manifests.mjs   # must pass
   ```
4. Open a PR. CI runs typecheck, build and manifest validation on every push.

## Bug reports & feature requests

Use the issue templates. For tool failures, always paste the in-app log panel output.

## Development

```bash
cd host
npm install
npm run typecheck   # both tsconfigs
npm run build
npm run dev
```

Commit style: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:` …).

---

# 简体中文

## 最有价值的贡献：新增工具清单

最有价值的贡献是一份新的**工具适配清单**——它让又一个 GitHub 工具在 All-Tools 里一键可用。

1. 阅读 [manifests/SCHEMA.md](./manifests/SCHEMA.md)（字段规范、端口占位符约定与示例）。
2. 新建 `manifests/tools/<tool-id>.json`（id 用小写 kebab-case）。请选择仍在活跃维护的真实仓库，优先可独立运行的工具（不依赖外部数据库）。
3. 本地验证：
   ```bash
   cd host && npm install && npm run dev
   # 应用内：获取该工具 → 打开 → 确认可用
   node host/scripts/validate-manifests.mjs   # 必须通过
   ```
4. 提交 PR。每次 push 的 CI 会自动执行类型检查、构建与清单校验。

## 问题反馈与功能建议

使用 Issue 模板。工具运行失败请务必附上应用内日志面板的输出。

## 开发

```bash
cd host
npm install
npm run typecheck   # 两套 tsconfig
npm run build
npm run dev
```

提交信息风格：[Conventional Commits](https://www.conventionalcommits.org/)（`feat:`、`fix:`、`docs:`、`chore:` 等）。
