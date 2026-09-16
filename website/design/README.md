# Design concepts

Static, self-contained design explorations for the public website. Nothing
here is wired into the Next.js app — open the files directly in a browser.
They live outside `public/` on purpose so they aren't served in production.

## `hexfield.html`

A dark reinvention of the site around a faceted pink-on-black honeycomb,
from a background reference Jim supplied.

The hero background is not an image. It's a perspective renderer in the
page's own `<script>`: a wavy plane of extruded hexagonal tiles, coloured
magenta or black by clustered value noise, lit by a diagonal band, and
drawn far-row-first with a painter's algorithm. It re-renders on resize
rather than per frame, so it costs nothing to keep on screen; the ambient
movement over it is CSS.

The rest of the page carries the same geometry down to component scale —
hexagon stat cells, team avatars, step markers, service-card corner cuts,
and a hex lattice texture on the tinted sections.

Both logos and the team photo are referenced as `../public/...`, so the
file only renders correctly from this directory.

### The hero: the team as honeycomb

The hero's right-hand side carries the five vets as hexagonal portraits, and
the headline steps down a size to give them the room. They appear here and
nowhere else on the page — the section further down covers the reception,
nursing and admin team instead.

Two arrangements ship in the same file, switched by the `data-layout` attribute
on `.docs` (a floating control in the page toggles it, and dials the spacing —
that control is a preview affordance, not part of the design):

- **comb** — three cells over two. Pointy-top, 1.4846 aspect. The chosen one.
- **column** — flat-top cells stacked into a vertical ribbon. 0.6736, tall.

The cells do not touch. Each one is positioned by its *centre* and sized
`calc(pitch - var(--gap))`, so it shrinks about its own centre while the comb
keeps its shape. That gives an even gap in every direction for free: in a
honeycomb each neighbour — sideways and diagonal alike — sits exactly one pitch
from centre to centre, so one shrink opens all six gaps equally. `--gap` is a
share of the container width; 3.5% is the default.

Each container's aspect ratio is derived from its packing, so a layout stays a
true comb at any width. Cells are `container-type: inline-size`, so the name,
role and placeholder initial are sized in `cqi` and scale with the cell rather
than the viewport.

Two things are easy to get wrong here. A pointy-top hexagon ends in a point, so
a caption pinned to its bottom edge lands where the cell has no width left —
those labels need lifting into the full-width band between 25% and 75% of the
height. And a square portrait covering a taller-than-wide cell has no vertical
slack at all, so `object-position` does nothing until the image is overscaled.

Portraits are placeholders: initials on a plum gradient. Swapping in a real
photo is one line per doctor — replace `<span class="doc-ph">` with an `<img>`.

### The logo

The page uses `public/logo.png` as drawn, unmodified, in both the nav and the
footer. The navigation bar is sized around it rather than the other way round:
a stacked mark-over-wordmark logo squeezed into a short bar leaves the type a
few pixels tall, so the bar runs `clamp(4.6rem, 6vw, 5.7rem)` and the logo
`clamp(3.4rem, 4.6vw, 4.3rem)`.

Known tradeoff, chosen deliberately: the artwork sets EUROPETS in near-black
and CLINIC plus the Arabic line in slate, so on this ground that type is close
to invisible. The mark itself reads fine — the cross is pink and the dog
carries a white keyline.

`make-dark-logo.js` still builds two dark-ground alternatives into `public/`
should that tradeoff stop being acceptable:

- `logo-on-dark.png` — the same stacked logo with *only* the wordmark
  recoloured to chalk and soft grey. The cross, dog and cat are untouched, and
  alpha is preserved so the type keeps its antialiasing.
- `logo-lockup-dark.png` — the mark and wordmark relocked side by side, for
  placements that are wide and short.

The other way to keep the file unmodified is to stop the surface behind it
being black — a light plate or band behind the logo, as earlier versions had.

### The veterinary layer

The honeycomb isn't decoration borrowed from a wallpaper — it's doing three
jobs at once, which is what lets the medical content sit inside the geometry
rather than on top of it.

**The mark is the logo, rebuilt cell by cell.** `build-marks.js` reads
`public/logo.png` and emits `marks.json` — the mark as hexagonal cell maps at
three grid resolutions (coarse 23x26, medium 35x40, fine 53x61). Three things
decide whether the result reads as a dog and a cat, and only one of them is
grid size:

1. The artwork strokes both animals in a white keyline to lift them off the
   cross. Classifying that stroke as "not a shape" erodes both silhouettes, so
   a breadth-first flood pushes it back into whichever animal it outlines.
2. Where an animal overlaps the cross, the animal wins the cell. The
   silhouette is the recognisable part; the cross is backdrop.
3. Every cell carries a coverage level, and partial cells are drawn smaller
   and dimmer. That is what turns a hard grid into something that reads as a
   curve, and it matters far more than adding cells.

`mark-study.html` compares the three against the original and at working sizes
(200 / 112 / 64 / 40px), on either ground, with or without the cross layer, and
with an adjustable cell gap. Run `node build-marks.js` after any logo change —
it prints an ASCII proof per grid (`proof-*.txt`) so a bad extraction is
obvious before anything is rendered.

Whatever the grid, the logo's value structure has to survive: solid pink cross,
dark dog, grey cat, light keyline between them. Inverting any of those — a
lattice cross with rim-lit animals, say — makes the dog read as a pink dog on a
dark cross, which is backwards.

The same data drives the dog-and-cat mark in the strays band (cross channel
filtered out) and the species glyphs in the vitals table (one channel each).

**An ECG leads the page.** A resting trace with a travelling QRS complex runs
full width directly under the hero, above the numbers — the first thing below
the fold and the page's clearest medical signal. It replaces a vitals table of
canine and feline reference ranges that sat further down; the trace carries the
same idea in a tenth of the space, so the table came out.

**The glyphs encode which kind of section they mark.** A hex-built paw for
animal-facing sections, the chamfered brand cross for clinical ones, a plain
hexagon for everything else. The service plates carry proper veterinary line
icons: syringe, tooth, microscope, scalpel, IV drip, paw. Between the vitals
and equipment bands runs an ECG trace with a travelling QRS complex.

A paw print pressed into the hero field itself was tried and cut: the only
depth band where a paw spans enough tiles to read is the same band the mark
occupies.
