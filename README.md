# It's Not Easy Being Bjorn

Local Astro source for beingbjorn.com. Preserves the whimsical starter's paper,
lettering and simple navigation. No taglines or corporate cards.

## Run on your Mac

Use Node.js 24 or newer with npm (MacPorts can install these).

```sh
cd ~/Downloads/bjorn-astro
npm ci
npm run dev
```

Open the address printed by Astro. Python's HTTP server cannot build Astro.
Both initial strips are drafts; the site shows “Strips coming soon” until
you add the intended artwork and publish one.

## Publish a strip

1. Put the original PNG in `artwork/`, e.g. `the-offense.png`.
2. Run `npm run panels` and open http://localhost:4322.
3. Open that PNG and drag a rectangle around each panel **in reading order**.
   Include speech bubbles and borders; exclude gutters if you prefer. Add any
   bottom aphorism/caption as a final crop so it is not lost on mobile.
4. Copy the YAML into `content/strips/001-the-offense.md`, replacing
   `sourceWidth`, `sourceHeight` and `panels`. The included coordinates
   are examples, NOT measurements of your strips.
5. Give each panel useful alt text, including its dialogue. Optional text below
   the frontmatter becomes a collapsed transcript (displayed as plain text).
6. Set `draft: false`. Restart `npm run dev` to regenerate crops, or run
   `npm run build`.

For the second strip use `002-the-latrine.md` and `artwork/the-latrine.png`.
For future strips copy a Markdown file, change its title, unique number, slug,
image and rectangles. Number determines chronology; newest number is homepage.

Coordinates are integers measured from the **top-left of the original PNG**:
`x` rightwards, `y` downwards, `width` and `height` in pixels.
Never measure a resized preview or resize the source without remeasuring.
Panels can have unequal sizes and need not be a regular grid.

## What the build does

Markdown + original PNG → validate dimensions and bounds → lossless WebP full
strip and individual crops → homepage, archive and previous/next strip pages.
Generated assets live in `public/comics/`; static output lives in `dist/`.
Drafts are excluded from pages, crops and navigation.

At 900px and wider the original composition is shown. From 600–899px the
cropped panels use two columns. Below 600px they form one vertical column.
Array order is reading order. Each image retains its aspect ratio. Crops use
responsive image sizes with no upscaling; the reader needs no JavaScript.
If an individual panel itself has very small lettering, use a larger export or
split that panel into additional carefully chosen crops.

## CI and hosting

Commit the Markdown, artwork, source and package-lock.json to a GitHub repository.
The included `.github/workflows/build.yml` runs `npm ci` and `npm run build`
on main pushes and pull requests, rejecting invalid published crops and
uploading `dist/` as a downloadable artifact. It does not deploy anywhere yet.
The same build can feed a static host; domain/DNS and hosting are separate setup.
For an optional GitHub Pages deployment, see `deploy-pages.yml.example`.

No finished comic artwork is bundled: several latrine versions were available
and the intended Offense PNG was not identified. This avoids assigning
coordinates to the wrong edition.
