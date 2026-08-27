# HandWriter

HandWriter is a browser-based Chinese handwriting editor. The MVP has validated the core direction: deterministic non-rigid glyph variation, six selectable variants per character, and per-character editing.

## Current development

Development has moved to **Editor v0.2** on `feature/editor-v0.2`.

The goal of v0.2 is to turn the Variant Engine demo into a document editor with:

- editable `TextBlock` objects
- individually editable glyphs inside each TextBlock
- optional image backgrounds
- arbitrary-position text creation
- move / rotate / duplicate / delete interactions
- project JSON save/load
- PNG export

See [`docs/editor-v0.2.md`](docs/editor-v0.2.md) for the implementation plan.

## Architecture

```text
Document
├── Background
├── TextBlock[]
│   └── GlyphInstance[]
└── FreeGlyph[]
```

Selection is editor state rather than a permanent data group, so every character remains independently editable after multi-select transforms.

## Roadmap

- v0.2 — editorization: Background, TextBlock, project persistence
- v0.3 — realism: correlated randomness, ink renderer, paper fusion, pen styles
- v0.4 — personal handwriting: glyph extraction, personal glyph library, sample-to-variants
- later — AI missing-glyph generation and context-aware handwriting lines
