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

| Utility                                  | What it draws                                        |
| ---------------------------------------- | ---------------------------------------------------- |
| `melt-stroke-<colour>`                   | A line just inside the edge (`--melt-stroke-width`)  |
| `melt-rim-<colour>`                      | A light line on the edges facing the light           |
| `melt-shade-<colour>`                    | A soft band on the edges facing away from the light  |
| `melt-glow-<n>`                          | A halo outside the edge, in the colour of the shapes |
| `melt-shadow`, `melt-shadow-sm`, `-none` | A drop shadow; touching shapes cast a single shadow  |

The colour utilities take a theme colour (`melt-rim-white`), a theme colour with an opacity (`melt-
rim-white/50`), `transparent`, or any colour in brackets. `melt-glow-30` is a glow at 30%.

## Settings

- `--melt-light-angle` sets where the light comes from, clockwise from straight up, for the whole
  page. It is set on `:root` in `aq.css`.
- `--melt-sigma`, `--melt-gain` and `--melt-bias` on a root tune the melt itself: how far shapes
  reach to merge (6px), and how sharp the outline is (18 and -6).
- `meltEnabled` in `Melt.tsx` turns the canvas off for the whole page.

## Without the canvas

Every shape paints its fill as an ordinary background and its shadow as a box shadow, so the page
stays usable without WebGL2 and while the context is lost. A root adds `data-melt-drawn` while its
canvas draws, which turns those backgrounds off. The server renders roots with `data-melt-pending`,
which hides them until hydration, so the first paint never shows them unmelted.

## How it works

Each root runs a small pipeline on every frame in which something moves:

1. `discover.ts` finds the shapes and groups under the root, again whenever children or classes
   change.
2. `measure.ts` reads their rects, radii, fills, effects and opacity, in the CSS pixels of the
   root, so transforms on the root or its ancestors apply to the canvas like to the content.
3. `layout.ts` turns them into a frame: the area to draw and the shapes in it, sorted by group. 4.
   `pack.ts` packs the frame into the arrays the shader reads, in device pixels. 5. `renderer.ts`
   draws it with `melt.frag`, through a single WebGL context that every root shares (`context.ts`),
   and each root copies the result into its own 2D canvas.

`loop.ts` and `motion.ts` keep drawing while a transition or animation moves a shape, and stop once
everything is still. `attach.ts` wires the pipeline to a root.

In the shader, each shape spreads a soft field: its rounded box smoothed with a Gaussian. The fields
of a group add up, and the outline is where the sum passes a threshold, so close shapes join where
their fields overlap. The rim, shade and stroke are measured from that outline.

## Limits

- At most 32 shapes per root are drawn. The shader takes eight arrays of 32 vectors, more than
  the WebGL minimum but well within what browsers report.
- A rotated root isn't supported; scaled and translated roots are.
- A `<Melt>` inside another draws its own shapes; the outer one skips them.
