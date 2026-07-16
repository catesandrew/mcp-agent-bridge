# NSSM (Non-Sucking Service Manager) — vendored binary

- **Version:** 2.24 (current stable release as of vendoring)
- **Download URL:** https://nssm.cc/release/nssm-2.24.zip
- **Vendored file:** `nssm.exe` — the **64-bit** build, extracted from the zip's `win64/` subfolder (the zip also contains a `win32/` build, not vendored here since the MSI targets x64 only)
- **SHA-256 (vendored `nssm.exe`, win64 build):**
  `f689ee9af94b00e9e3f0bb072b34caaf207f32dcb4f5782fc9ca351df9a06c97`
- **SHA-256 (win32 build, not vendored, recorded for completeness):**
  `472232ca821b5c2ef562ab07f53638bc2cc82eae84cea13fbe674d6022b6481`
- **SHA-256 (source zip, `nssm-2.24.zip`):**
  `727d1e42275c605e0f04aba98095c38a8e1e46def453cdffce42869428aa674`

## License

Quoted verbatim from `README.txt` inside `nssm-2.24.zip` (section "Licence"):

> NSSM is public domain. You may unconditionally use it and/or its source code
> for any purpose you wish.

This confirms the public-domain claim directly against the upstream distribution rather than assuming it.

## Re-vendoring instructions

To update to a newer NSSM release:

```
curl -fsSL -o nssm-<version>.zip https://nssm.cc/release/nssm-<version>.zip
unzip nssm-<version>.zip
cp nssm-<version>/win64/nssm.exe installer/windows/vendor/nssm/nssm.exe
shasum -a 256 installer/windows/vendor/nssm/nssm.exe
```

Update this file's version, URL, and SHA-256 accordingly.
