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
