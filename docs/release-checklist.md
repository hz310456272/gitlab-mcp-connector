# 发布检查清单

> English version: [release-checklist.en.md](release-checklist.en.md)

每次打 tag 前必须逐项通过。验证失败禁止打 tag。

## 自动检查（CI 已覆盖）

- [ ] `npm run typecheck` — 零错误
- [ ] `npm run lint` — 零错误
- [ ] `npm test` — 全部通过
- [ ] `npm run build` — 零错误，`dist/server.js` 存在
- [ ] `npm pack --dry-run` — 包含 `dist/server.js`、`README.md`、`LICENSE`、`docs/`、`examples/`
- [ ] `npm run scan` — 敏感信息扫描零匹配

## 手动检查

- [ ] `git status` 干净，无未提交改动
- [ ] `git diff --name-only HEAD~1` 范围正确，无无关文件
- [ ] README / docs 交叉链接完整（中英各跑一次）
- [ ] 无真实 token、公司域名、个人路径、内部 env var 名出现在公开文件中

## 打 tag

全部通过后：

```bash
git tag -a vX.Y.Z -m "Phase N: short description"
git push origin vX.Y.Z
```

## tag 命名规范

- semver：`v0.1.0`、`v0.2.0`、`v0.3.0`、`v0.4.0`、`v0.5.0`、`v1.0.0`
- annotated tag（lightweight tag 不算）
- tag message 格式：`Phase X: short description`
- tag 内容禁止包含：真实 token、公司私有信息、临时 debug 文档、个人路径、未脱敏内部域名
