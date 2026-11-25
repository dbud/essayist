# Melt

The melt draws the backgrounds of buttons, menus and other controls on a WebGL canvas, so close
shapes flow into each other like liquid. Text and icons stay plain HTML on top; only the shapes
behind them are drawn.

## Using it

A melted component has a root, rendered by `<Melt>`, and shapes inside it.

```tsx
import Melt from "#/components/ui/Melt.tsx";

<Melt class="inline-flex" ref={ref}>
  <button class="aq-btn">Settings</button>
  <div class="aq-dropdown">
    <div class="aq-menu">...</div>
  </div>
</Melt>;
```

- `<Melt>` renders a `div` with the `melt-root` class and draws its shapes on a canvas behind its
  content. It takes an optional `ref`, so it can stand in for a root that `useClickOutside` needs.
- A **shape** is an element with the `melt-shape` utility and a `--melt-fill` colour. The canvas
  draws it as a rounded box, using its border radius. `aq-btn`, `aq-menu`, the segmented control,
  toasts and the logo are shapes already.
- A **group** is a set of shapes that merge with each other. The root starts group 0, and every
  element with the `melt-group` utility starts a group of its own. Groups are drawn in document
  order, each over the ones before, so a menu row (its own group) sits on its panel without melting
  into it.

```css
.my-chip {
  @apply melt-shape melt-rim-white/50 melt-shadow;
  --melt-fill: var(--color-float);
}
```

Shapes are found by the CSS marker that `melt-shape` sets, even while their fill is transparent.
Pseudo-elements can't be measured, so a shape has to be a real element: the dropdown bridge and the
toggle knob are spans for that reason.

## Effects

Each effect is a registered property on the shape, so it transitions and reacts to `:hover` like the
fill. Along a melted edge, each effect is the average of the shapes nearby.

| Utility                                               | What it draws                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `melt-stroke-<colour>`                                | A line just inside the edge (`--melt-stroke-width`)                    |
| `melt-rim-<colour>`                                   | A light line on the edges facing the light                             |
| `melt-shade-<colour>`                                 | A soft band on the edges facing away from the light                    |
| `melt-glow-<n>`                                       | A halo outside the edge, in the colour of the shapes                   |
| `melt-shadow-flat`, `melt-shadow`, `-lifted`, `-none` | A shadow at one of three heights; touching shapes cast a single shadow |

The colour utilities take a theme colour (`melt-rim-white`), a theme colour with an opacity (`melt-
rim-white/50`), `transparent`, or any colour in brackets. `melt-glow-30` is a glow at 30%.

## Settings

- `--melt-light-angle` sets where the light comes from, clockwise from straight up, for the whole
  page. It is set on `:root` in `aq.css`.
- `--melt-light-elevation` sets how high the light is above the page (45deg).
- `--melt-rim-width` is half the thickness of each melted shape, lit as a slab with a half-round
  edge (4 CSS pixels): from above, its surface turns from facing out at the outline to level
  `--melt-rim-width` inside it. The distance to the outline is searched in the field, so the edge
  follows the melted outline. 0 makes it flat, with no rim.
- The rim is what the edge mirrors of the light: a broad glow (`--melt-rim-sheen`, 0.5) round a
  tight spot (`--melt-rim-highlight`, 1, its size set by `--melt-rim-shine`, 12, higher is smaller).
  Both fade round the edges that face away from the light. The shade darkens where the edge turns
  away from the light.
- A shape floats `--melt-height` above the page and casts two shadows in `--melt-shadow`. The shadow
  utilities set both from `--melt-shadow-color` and from `--melt-height-flat`, `--melt-height-rest`
  and `--melt-height-lifted`, which the page sets on `:root` in `aq.css`. `--melt-light-ambient`
  (0.6) is the share of the light that comes from all around: it casts the ambient shadow, a crease
  along the outline, darkest at it and falling fastest there, gone a pixel out on the page, about
  the height out as the shape rises, and never sooner than halfway across the penumbra of the key
  shadow, so the two blend. The rest casts the key shadow away from the light, further the lower the
  light is, with a penumbra that eases in from the full shadow and out to the page, as wide as twice
  the height times the tangent of `--melt-light-size` (45deg), and nothing past it. Both fade as the
  shape rises above its own size. `--melt-shadow-tint` mixes the darkened colour of the shape into
  its shadow (0.25). The box shadow without the canvas follows the same light.
- Shadows take away a share of the light, so they are turned into the sRGB value of the light left
  on a white page before they are drawn: dark right at the edge with a long, faint tail, rather than
  the dark body with an edge that blending in sRGB gives.
- Every pixel of the canvas gets noise of a level up and down, so soft gradients don't band, and
  `--melt-grain` varies how much light each pixel of a shadow takes by that share (0), so shadows
  read as falling on paper. The shapes stay smooth.
- All of these are set on `:root` in `aq.css`, and a root can override them.
- `--melt-sigma`, `--melt-gain` and `--melt-bias` on a root tune the melt itself: how far shapes
  reach to merge (6px), and how sharp the outline is (18 and -6).
- `meltEnabled` in `Melt.tsx` turns the canvas off for the whole page.

## Without the canvas

Every shape paints its fill as an ordinary background and its shadow as a box shadow, so the page
stays usable without the melt: without WebGL2 or float render targets, and while the context is
lost. A root adds `data-melt-drawn` while its canvas draws, which turns those backgrounds off. The
server renders roots with `data-melt-pending`, which hides them until hydration, so the first paint
never shows them unmelted.

## How it works

Each root runs a small pipeline on every frame in which something moves:

1. `discover.ts` finds the shapes and groups under the root, again whenever children or classes
   change.

2. `measure.ts` reads their rects, radii, fills, effects and opacity, in the CSS pixels of the
   root, so transforms on the root or its ancestors apply to the canvas like to the content.

3. `layout.ts` turns them into a frame: the area to draw and the shapes in it, sorted by group.

4. `pack.ts` packs the frame for the shaders, in device pixels: a float texture with a column per
   shape and a row per value, and the area of each group.

5. `multipass.ts` draws it group by group, as below, through a single WebGL context that every
   root shares (`context.ts`), and each root copies the result into its own 2D canvas.

`loop.ts` and `motion.ts` keep drawing while a transition or animation moves a shape, and stop once
everything is still. `attach.ts` wires the pipeline to a root.

Each shape spreads a soft field: its rounded box smoothed with a Gaussian. The fields of a group
add up, and the outline is where the sum passes a threshold, so close shapes join where their fields
overlap. The rim, shade and stroke are measured from that outline.

## Rendering

Each shape is drawn only where it reaches, and the field, the expensive part, at a quarter of
the resolution of the canvas (`FIELD_SCALE` in `targets.ts`), while the edges are cut at full
resolution, so they stay sharp. For each group in order, in its area only (its shapes and their
reach, scissored):

1. Field passes, at the lower resolution (`field.frag`). Each shape is a quad over its box and its
   reach (`reachOf`), drawn instanced, adding into 16-bit float targets:

   - pass A, four targets: the field weighted by colour, and the rim, shade and stroke colours
     weighted by it.
   - pass B, four targets: the stroke width and glow weighted by the field, the key shadow field,
     the key shadow colours, the key shadow blur with the ambient shadow field and blur, and the
     ambient shadow colours.

   Four targets is the most WebGL2 guarantees in one pass, so the values take two passes. Each group
   clears its area of the targets with a margin, as the next pass reads past its edge.

2. Fill pass, at full resolution (`fill.frag`): each shape is a quad over its box, drawn
   instanced, later shapes over earlier ones. These are the crisp edges.

3. Resolve pass, at full resolution (`resolve.frag`): a quad over the group reads the field targets,
   filtered so they scale up smoothly, and the fills. It cuts the outline, colours the space between
   shapes, and draws the rim, shade, stroke, glow and shadow, with the slope of the field taken a
   pixel to either side. It draws the group over the groups before it.

Rim, shade, stroke, glow and shadow blend between shapes where they melt. While debugging, a last
pass outlines the measured box of every shape (`outline.frag`).

The field targets are RGBA16F, which can be blended on every platform that renders to float,
including iOS, where 32-bit float can't be blended; the fill target is RGBA8. They belong to the
single WebGL context and only grow, like its canvas, so roots of different sizes don't reallocate
them.

## Limits

- At most 256 shapes per root are drawn (`MAX_SHAPES` in `layout.ts`); the rest keep their own
  background and shadow.
- The cost grows with the area each shape reaches and the area of each group, not with the number
  of shapes a pixel sees.
- A rotated root isn't supported; scaled and translated roots are.
- A `<Melt>` inside another draws its own shapes; the outer one skips them.
