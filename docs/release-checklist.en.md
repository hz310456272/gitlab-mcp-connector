# Release Checklist

> 中文版见 [release-checklist.md](release-checklist.md)。

Every item below must pass before tagging. Verification failures block the tag.

## Automated Checks (covered by CI)

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] `npm test` — all pass
- [ ] `npm run build` — zero errors, `dist/server.js` exists
- [ ] `npm pack --dry-run` — includes `dist/server.js`, `README.md`, `LICENSE`, `docs/`, `examples/`
- [ ] `npm run scan` — sensitive info scan returns zero matches

## Manual Checks

- [ ] `git status` clean, no uncommitted changes
- [ ] `git diff --name-only HEAD~1` scope is correct, no unrelated files
- [ ] README / docs cross-links complete (run for both Chinese and English)
- [ ] No real tokens, company domains, personal paths, or internal env var names in public files

## Tagging

After all checks pass:

```bash
git tag -a vX.Y.Z -m "Phase N: short description"
git push origin vX.Y.Z
```

## Tag Naming Convention

- semver: `v0.1.0`, `v0.2.0`, `v0.3.0`, `v0.4.0`, `v0.5.0`, `v1.0.0`
- Annotated tags only (lightweight tags do not count)
- Tag message format: `Phase X: short description`
- Tag contents must not include: real tokens, company private info, temporary debug docs, personal paths, unredacted internal domain names
