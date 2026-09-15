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

**The vitals table is real.** Adult canine and feline reference ranges —
temperature, heart rate, respiration, capillary refill, body condition —
set in mono with tabular figures. It is the page's clinical anchor, and the
caption says plainly that puppies, kittens and seniors sit outside them.

**The glyphs encode which kind of section they mark.** A hex-built paw for
animal-facing sections, the chamfered brand cross for clinical ones, a plain
hexagon for everything else. The service plates carry proper veterinary line
icons: syringe, tooth, microscope, scalpel, IV drip, paw. Between the vitals
and equipment bands runs an ECG trace with a travelling QRS complex.

A paw print pressed into the hero field itself was tried and cut: the only
depth band where a paw spans enough tiles to read is the same band the mark
occupies.
