# mcp-proxy@6.4.4 — vendored npm package

- **Pinned version:** 6.4.4 (matches the version already used by the macOS `launch-agent-*-mcp-http` scripts / `install.ps1`)
- **Fetched via:** `npm pack mcp-proxy@6.4.4`, tarball `mcp-proxy-6.4.4.tgz` (npm-reported shasum
  `888a0c148d1b012485eedb4468569527322f3504`), then extracted (`tar -xzf`) and its contents
  (the tarball's `package/` directory) copied directly into this directory.
- No network fetch of this package happens at MSI build time or install time — it is a checked-in
  build input.

## bin entry point — verified against the vendored `package.json`

The vendored `package.json`'s `"bin"` field is:

```json
"bin": {
  "mcp-proxy": "dist/bin/mcp-proxy.mjs"
}
```

This **matches** the previously-confirmed value (`npm view mcp-proxy@6.4.4 bin` → `dist/bin/mcp-proxy.mjs`).
No discrepancy found. Task 5's NSSM `ExeCommand` should invoke:

```
node.exe "<installdir>\proxy\node_modules\mcp-proxy\dist\bin\mcp-proxy.mjs" --host 127.0.0.1 --port <PORT> --server stream --streamEndpoint /mcp -- "<installdir>\bin\<server>-mcp-server.exe"
```

## Runtime dependency finding — NOT dependency-free / NOT fully bundled

The vendored `package.json`'s `"dependencies"` field is:

```json
"dependencies": {
  "pipenet": "^1.3.0"
}
```

This is a **real, unbundled runtime dependency**. Confirmed by inspecting
`dist/bin/mcp-proxy.mjs` directly — line 9 reads:

```js
import { pipenet } from "pipenet";
```

This is a bare-specifier ESM import (not inlined/bundled by `tsdown`), so Node's module
resolver requires an actual `pipenet` package to be resolvable from
`node_modules/` relative to `dist/bin/mcp-proxy.mjs` (or a parent `node_modules/`) at runtime.

**Implication for Task 3/5 (Windows install):** `node.exe dist/bin/mcp-proxy.mjs` will **not**
run standalone from this vendored copy alone — it needs `pipenet@^1.3.0` (and *its* transitive
dependencies, if any) present in a sibling `node_modules/` directory. This vendor directory as
currently populated (`npm pack` output only) does **not** include `node_modules/` — `npm pack`
never does, by design (it packs only the package's own files declared via `files`/default npm
pack rules, never dependencies).

**Resolved:** ran `npm install --omit=dev --no-audit --no-fund` inside this directory. This pulled
in 93 packages (7.8 MB) — `pipenet` plus its own dependency tree, which turned out to include a
full `koa`/`koa-router` HTTP stack, `axios`, `tldjs`, etc. (mcp-proxy is not the tiny single-file
tool its name suggests). Verified working end-to-end:

```
$ node dist/bin/mcp-proxy.mjs --help
mcp-proxy [options] -- <command> [args...]
... (full yargs help output, exit code 0)
```

`node_modules/` is checked into this vendor directory (not gitignored — it's a build input, same
as the rest of `installer/windows/vendor/`) so the eventual MSI payload can copy this whole
directory tree and run `node dist/bin/mcp-proxy.mjs` with zero network dependency at either build
or install/runtime.

## License note

The vendored `package.json` declares `"license": "MIT"`. However, the actual bundled `LICENSE`
file text is **BSD 2-Clause**, not MIT boilerplate — this is a discrepancy in the upstream
package itself (not introduced by vendoring), included here for the record:

```
BSD 2-Clause License

Copyright (c) 2024, Frank Fiegel <frank@glama.ai>
```

## Re-vendoring instructions

To update the pinned version:

```
npm pack mcp-proxy@<new-version>
tar -xzf mcp-proxy-<new-version>.tgz
rm -rf installer/windows/vendor/mcp-proxy/*
cp -R package/. installer/windows/vendor/mcp-proxy/
```

Update this file's version, bin-entry confirmation, and dependency finding accordingly.
