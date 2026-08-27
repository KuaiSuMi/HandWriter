# Fonts

HandWriter keeps font assets separate from the editor source.

Expected local font filenames:

- `云烟体.ttf`
- `华阳手写体.ttf`
- `李国夫手写体.ttf`
- `神韵英子楷书.ttf`
- `青叶手写体.ttf`

Runtime loading order is:

1. `./fonts/<font-file>`
2. the matching file from the `14790897/handwriting-web` jsDelivr mirror
3. manual local TTF/OTF/WOFF selection in the UI

`presets.js` contains only font metadata and the fallback source URL. Font binary files are intentionally not committed here. Before redistributing any third-party font binary, verify its original license separately from the repository license.
