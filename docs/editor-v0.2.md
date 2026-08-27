# HandWriter Editor v0.2

## Goal

Turn the validated handwriting Variant Engine MVP into an editable handwriting document editor.

## Baseline

The validated MVP remains available as `standalone.html` on `main`. New editor functionality is developed separately so the working MVP is not broken during migration.

## Architecture

```text
Document
├── BackgroundLayer
├── TextBlock[]
│   └── GlyphInstance[]
└── FreeGlyph[]
```

### BackgroundLayer

Implemented in the current branch:

- local image upload
- `contain / cover / stretch` fit modes
- opacity control
- clear background
- object URL lifecycle cleanup
- serializable background metadata

The selected image stays in the browser in this prototype.

### TextBlock

Planned paragraph-level properties:

- x / y
- width
- rotation
- font size
- line height
- letter spacing
- alignment
- default color
- default pen style

TextBlocks will move and rotate as a whole while glyphs remain independently editable.

### GlyphInstance

The existing MVP capabilities will be preserved:

- deterministic `variantSeed`
- non-rigid glyph deformation
- six candidate variants
- per-character x / y / rotation
- scale, color, thickness and size

## Editing target

- double-click empty canvas to create a TextBlock
- click TextBlock to select it
- double-click TextBlock to enter text editing mode
- click a glyph to enter glyph editing mode
- Shift/Ctrl/Cmd multi-select glyphs
- drag / rotate selected objects
- duplicate / delete
- undo / redo

## Project persistence

Projects will be serializable JSON. Generated geometry should be reproducible from source text, styles and seeds rather than storing only a flattened bitmap.

## Implementation order

1. Project data model and serialization
2. Background layer — **in progress / first prototype implemented**
3. Arbitrary-position TextBlock creation
4. TextBlock selection / drag / rotation
5. Port Variant Engine into Glyph children
6. Glyph/TextBlock mode switching
7. Alignment / copy / delete tools
8. Save/load project JSON
9. PNG export regression
10. Ink-paper fusion

## Architecture rule

Do not permanently group selected glyphs in the data model. Selection is temporary editor state so every glyph remains independently addressable.
