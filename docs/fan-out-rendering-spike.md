# Spike: rendering fan-out (multiple arrows out of one node)

Status: **tabled 2026-09-03**, revisit soon. Two other features go first.
Owner context: see `DESIGN.md` "Edge" bullet (the 2026-08-31 UI restriction
that only lets the connect-arrow button appear on tail nodes).

Fan-**in** is explicitly out of scope for this spike — it has its own set of
problems and stays deferred.

## The blocker today

`src/routes/b/[boardId]/+page.svelte`:

- `:450-456` — a flow is one `flex-wrap: wrap` row that iterates `nodeOrder`
  and drops `<span class="edge-arrow">&rarr;</span>` between consecutive
  entries. The arrow is purely positional: "position i-1 to position i."
- The `edges` map is **stored but never read for layout**.
- `mode: 'edge'` (`:508-516`, `:272-284`) only appends to the tail and only
  from the tail, so `nodeOrder` sequence always equals the real chain. That
  invariant is what breaks the moment a node has two children.

There is no second dimension to draw branching in.

## Proposed model for iteration 1

Lock these constraints so the structure stays a **tree** (much cheaper to
render than a general DAG):

- **Single root** per flow (the node with no incoming edge — enforce
  exactly one).
- **No fan-in** — every node has <= 1 incoming edge.
- **Fan-out capped at 3.**
- **Nesting depth capped at 1** — a branched node's children can't
  themselves branch. Keeps vertical growth bounded and the picture
  legible. (Open question below — could allow arbitrary depth instead.)

`edges` becomes the source of truth for structure. `nodeOrder` degrades to
sibling ordering (which branch renders on top). Likely wants an explicit
per-parent child order later (an `order` field on the edge, or reuse
`nodeOrder`); creation order is fine for iteration 1.

## One button, not two

Drop the tail-only restriction on the `&rarr;` button (`:452` `isTailNode`,
`:508`). Show it whenever `outgoingEdgeCount < 3`. It always does the same
thing: new child node + edge from this node.

- 1 outgoing edge -> renders inline exactly as today.
- 2-3 outgoing edges -> renders as a vertical stack.

No separate "extend chain" vs "branch" affordance — the layout adapts to the
edge count.

## Rendering

Replace the `nodeOrder` loop with a recursive Svelte snippet
(`{#snippet chain(nodeId)}` — Svelte 5 supports recursive snippets):

```
renderChain(A):
  draw node A
  children = outgoing edges of A, sorted
  0 -> done
  1 -> draw "->", renderChain(child)          // exactly today's look
  2-3 -> draw fork connector + vertical stack
         each stack row = renderChain(child)
```

```
                /--> [B1] --> [B2]
   [A] ---------+--> [C1]
                \--> [D1] --> [D2] --> [D3]
```

A branch group is `display: flex; align-items: center` with three parts:
`[parent] [fork gutter] [stack]`. `align-items: center` runs the trunk
spine through the vertical middle of the stack, matching the inspiration
charts.

### The fork connector — key simplification

Node height is fixed (2 rows x 2.75rem), so **every child row is the same
height** regardless of how long its chain is. Fork geometry is therefore
pure arithmetic:

- child *i* center = `i * (rowH + gap) + rowH / 2`
- parent center = `stackH / 2`

No DOM measurement pass, no `ResizeObserver`. A small inline `<svg>`
absolutely positioned in the gutter draws 2-3 bezier forks from those
constants.

A zero-JS CSS-border elbow-connector version is also possible (the classic
rotated org-chart trick — works here because child-row height is constant),
but it's blockier.

### Mobile

A 3-way fan-out with long child chains will overflow narrow screens.
Simplest for iteration 1: `overflow-x: auto` on the flow container.
`DESIGN.md` rules out pinch/pan, not scroll.

## Migration

None. Existing boards are all the "1 child" path and render identically.
(Firestore gets wiped before each feature test anyway.)

## Open questions to settle when this comes off the table

1. **Nesting depth** — hold at 1 for iteration 1, or allow arbitrary depth
   from the start? Depth 1 is much easier to keep legible and bounded.
2. **Connector style** — inline SVG bezier forks (leaning this way) vs
   CSS-border elbow connectors (zero JS, blockier).
3. **Sibling reorder** — up/down on branch groups; probably a later pass,
   creation order for iteration 1.
