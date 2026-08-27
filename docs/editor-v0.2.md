# HandWriter Editor v0.2

## Goal

Turn the validated handwriting Variant Engine MVP into an editable handwriting document editor.

## Scope

### 1. Document model

The editor no longer treats the page as a single bitmap. A project contains editable objects:

```text
Document
├── Background
├── TextBlock[]
│   └── GlyphInstance[]
└── FreeGlyph[]
```

### 2. TextBlock

A TextBlock owns paragraph-level layout properties:

- x / y
- width
- rotation
- font size
- line height
- letter spacing
- alignment
- default color
- default pen style

TextBlocks can be moved and rotated as a whole. Individual glyphs remain independently editable.

### 3. GlyphInstance

Each character remains a first-class object so the current MVP capabilities are preserved:

- deterministic `variantSeed`
- non-rigid glyph deformation
- six candidate variants
- per-character x / y / rotation
- per-character scale
- color
- thickness
- size

### 4. Background

The editor will support an optional image background. The first implementation only places and transforms the image; paper/ink fusion is reserved for a later version.

### 5. Editing interactions

Target interactions for v0.2:

- double-click empty canvas to create a TextBlock
- click TextBlock to select it
- double-click TextBlock to enter text editing mode
- click a glyph to enter glyph editing mode
- Shift/Ctrl/Cmd multi-select glyphs
- drag selected objects
- rotate selected objects
- duplicate/delete selected objects
- undo/redo

### 6. Project persistence

Projects are serializable JSON. Generated geometry is reproducible from source text, style fields and seeds instead of storing a flattened bitmap.

## Non-goals for v0.2

- AI handwriting learning
- stroke trajectory reconstruction
- pen-pressure simulation
- realistic paper/ink compositing
- accounts/cloud sync
- collaboration

## Milestones

1. Project data model and serialization
2. Background layer
3. TextBlock creation and editing
4. Glyph/TextBlock mode switching
5. Alignment/copy/delete tools
6. Save/load project JSON
7. PNG export regression test

## Architecture rule

Do not permanently group selected glyphs in the data model. Selection is temporary editor state. This keeps glyphs individually addressable and prevents group transforms from destroying per-character editability.
