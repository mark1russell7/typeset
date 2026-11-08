# Changelog of @mark1russell7/text

## 0.0.1

The first version. It has the escapes: `escapeHtml`, `escapeAttribute`, `escapeRegExp` and `escapeMarkdown`.

- The tests run 53 copies of these functions from other repositories as fixtures. `test/differences.ts` gives each difference and its reason.
- The root entry is 250 bytes after `esbuild` and `gzip` at level 9. A test holds it at 700 bytes or fewer.

Runtime dependencies: none.
