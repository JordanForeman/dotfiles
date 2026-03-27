---
name: inkscape-svg-cli
description: Uses Inkscape CLI actions to edit SVG files safely and repeatably (delete objects, transform, boolean ops, path conversion, cleanup, and exports).
injection: explicit
---

# Inkscape SVG CLI Skill

Use this skill when a user wants SVG edits automated via command line instead of manual GUI work.

## Goals

- Make SVG edits **reproducible** and scriptable
- Prefer **safe, non-destructive** workflows
- Keep original files intact unless user explicitly asks for in-place changes
- Support an **iterative demonstration loop** (show variants → pick → refine)

## When to Use

- Removing elements/sections from SVGs
- Converting shapes/text to paths
- Running boolean operations (union/difference/intersection)
- Batch transforms/cleanup/export tasks
- Automating repetitive edits across many SVG files

## Safety Rules

1. **Default to copy-on-write**
   - Input: `input.svg`
   - Working copy: `input.edited.svg`
2. Ask before destructive overwrite of originals.
3. Validate output SVG exists and is non-empty.
4. **Prove the edit is not a no-op** (hash or diff input vs output).
5. Preserve viewBox, dimensions, and IDs unless user asks otherwise.

## CLI Building Blocks

### Basic invocation
```bash
inkscape input.svg \
  --batch-process \
  --actions="<action1>;<action2>;...;FileSave;FileClose"
```

### In-place save (explicit)
```bash
inkscape input.svg --batch-process --actions="...;FileSave;FileClose"
```

### Save as new file
```bash
cp input.svg input.edited.svg
inkscape input.edited.svg --batch-process --actions="...;FileSave;FileClose"
```

### Inspect available actions (version-dependent)
```bash
inkscape --action-list
```

## Common Action Patterns

> Note: Exact action names can vary by Inkscape version. Check `inkscape --action-list` when an action fails.

### 1) Delete an object by ID
```bash
inkscape input.edited.svg --batch-process \
  --actions="select-by-id:OBJECT_ID;EditDelete;FileSave;FileClose"
```

### 2) Select all in a layer, then delete
```bash
inkscape input.edited.svg --batch-process \
  --actions="select-by-id:LAYER_ID;select-all:groups;EditDelete;FileSave;FileClose"
```

### 3) Convert selected object to path
```bash
inkscape input.edited.svg --batch-process \
  --actions="select-by-id:OBJECT_ID;object-to-path;FileSave;FileClose"
```

### 4) Boolean difference (top minus bottom)
```bash
inkscape input.edited.svg --batch-process \
  --actions="select-by-id:CUTTER_ID;select-by-id:BASE_ID;path-difference;FileSave;FileClose"
```

### 5) Cleanup document
```bash
inkscape input.edited.svg --batch-process \
  --actions="vacuum-defs;FileSave;FileClose"
```

## Recommended Workflow for Requests

1. **Read the SVG** and identify candidate IDs (`id="..."`) and structure.
2. If the request references a screenshot/mock, read it and translate to a concrete geometric operation.
3. If IDs are missing or unreliable, use a deterministic fallback:
   - clip/crop via `clipPath` or rectangular mask strategy,
   - or direct SVG edit of target `path d` / clip geometry when appropriate.
4. Build a minimal `--actions` chain.
5. Run on copied file.
6. Verify by re-reading SVG, comparing hash/diff to input, and (if needed) exporting a quick PNG preview.

## Iterative Demonstration Workflow (default for visual tuning)

Use this loop whenever the user says "close, but..." or provides visual references.

1. **Baseline render**
   - Export PNG preview of current state.
2. **Generate a small variant batch (3-6 options)**
   - Vary one parameter at a time (e.g., clip height, spacing, scale).
   - Keep other variables fixed so comparisons are meaningful.
3. **Present variants and capture user choice**
   - Ask user to choose a variant or provide a custom value.
4. **Apply chosen value to canonical output file**
   - Only after approval.
5. **Validate final output**
   - Ensure output differs from input and export a final preview.
6. **If composing multiple SVGs**
   - Prefix IDs in each source before merging to prevent collisions.
   - Align/space via explicit transform values, then iterate similarly.

## Useful Helpers

### Find IDs quickly
```bash
rg -o 'id="[^"]+"' input.svg | head -100
```

### Quick PNG preview export
```bash
inkscape input.edited.svg --export-type=png --export-filename=input.edited.preview.png
```

### No-op detection (required)
```bash
shasum input.svg input.edited.svg
# or
cmp -s input.svg input.edited.svg && echo "NO_CHANGES" || echo "CHANGED"
```

### Variant batch pattern (parameter sweep)
```bash
# Example: clip-height tuning
for h in 112 116 120 124; do
  cp input.edited.svg /tmp/input.cut${h}.svg
  # edit parameter deterministically (scripted edit)
  inkscape /tmp/input.cut${h}.svg --export-type=png --export-filename=/tmp/input.cut${h}.png
done
```

## Troubleshooting

- **Action not found**: run `inkscape --action-list` and map to your installed version.
- **Nothing changed**: selection likely failed (wrong ID/order). Verify IDs first.
- **Boolean op failed**: ensure both objects are paths; run `object-to-path` first.
- **Unexpected geometry changes**: check transforms and object stacking order.

## Limitations & Escalation

- Node-level micro-edits (specific bezier handles) are limited via CLI actions.
- For fine path surgery, combine:
  1. Inkscape CLI for object-level ops
  2. Direct SVG path `d` editing (scripted) when explicitly requested

Always explain this boundary to users and propose the most reproducible path.
