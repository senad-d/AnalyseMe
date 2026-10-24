# Check registry

Commands run from the repository root after `npm ci --ignore-scripts`, using Node 22.19.0 (the CI version).
For the full validation chain and offline Pi smoke procedure, see [VALIDATION.md](VALIDATION.md).

| Check command | Scope | Behavior guarded |
| --- | --- | --- |
| `node --test --test-reporter=dot test/typescript-policy.test.mjs` | `package.json`, `package-lock.json` | TypeScript stays exactly pinned to the supported compiler in the manifest, lockfile request, and resolved version. Included in `npm test` and CI's `npm run validate`. Revisit this policy test with the Dependabot ignore when upstream supports newer compilers. |
