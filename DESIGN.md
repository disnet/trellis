---
name: Trellis
description: An agent-native thinking workspace — a shared graph of thought, on paper.
colors:
  fountain-pen-blue: "#3b5bdb"
  ink: "#2c2921"
  ink-soft: "#4d473c"
  ink-faded: "#5a523f"
  ink-muted: "#6d675c"
  ink-quiet: "#8a8375"
  paper: "#f6f3ec"
  paper-panel: "#fbf9f3"
  paper-raised: "#fffdf8"
  card-white: "#ffffff"
  parchment-cream: "#fdf8ec"
  hairline: "#e0dbcf"
  card-border: "#c9c4b8"
  control-border: "#d5d0c4"
  divider: "#eae5d9"
  dot-grid: "#ddd8cc"
  edge-ink: "#a89f8d"
  proposal-gold: "#b08a3e"
  proposal-gold-soft: "#c9a860"
  proposal-ink: "#8a6a1f"
  moss: "#e3ecdf"
  moss-ink: "#3d5537"
  violet: "#e5e1f2"
  violet-ink: "#4a4174"
  slate: "#dfe9ef"
  slate-ink: "#35586b"
  clay: "#f2e6df"
  clay-ink: "#6b4a35"
  plum: "#f2dfe7"
  plum-ink: "#6b3550"
  ochre: "#ece5c8"
  ochre-ink: "#635417"
  surfaced-slate: "#6b7f8a"
  rust: "#8a3a2a"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    letterSpacing: "0.02em"
  card-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.06em"
  section:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    letterSpacing: "0.08em"
rounded:
  chip: "4px"
  control: "6px"
  card: "8px"
  floating: "12px"
  dock: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  xxl: "16px"
components:
  button-outline:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    padding: "5px 12px"
  button-outline-hover:
    textColor: "{colors.fountain-pen-blue}"
  chip-claim:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.moss-ink}"
    rounded: "{rounded.chip}"
    padding: "1px 6px"
  status-pill:
    backgroundColor: "#faf7f0"
    textColor: "{colors.ink-faded}"
    rounded: "{rounded.pill}"
    padding: "1px 7px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.card}"
    padding: "8px 10px"
  card-proposed:
    backgroundColor: "{colors.parchment-cream}"
    rounded: "{rounded.card}"
    padding: "8px 10px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.parchment-cream}"
    rounded: "{rounded.card}"
    padding: "10px 14px"
---

# Design System: Trellis

## Overview

**Creative North Star: "The Naturalist's Field Desk"**

Trellis looks like a working desk of specimen cards on warm paper: thought cards are labeled, tagged, and pinned; relations are penned between them; agent proposals arrive as dashed, gold-edged specimens awaiting examination. The mood is calm, papery, scholarly, and warm — the interface recedes so the thinking is loud. Nothing is decorative: every hue, border style, and label carries epistemic meaning (what kind of thought, what state, who wrote it, whether it is ratified yet).

Density is compact but breathable: small system type on a resizable scale, hairline warm borders, generous panel structure. The single point of saturation is Fountain-Pen Blue, which appears only where attention or interaction is — selection, focus, hover, work in progress. Everything else is muted botanical pigment on parchment.

**Key Characteristics:**
- Warm paper neutrals everywhere; no pure grays, no pure black surfaces.
- One saturated accent (Fountain-Pen Blue) reserved for interaction states.
- Muted two-tone chips encode the six thought types; gold encodes "proposed."
- Border *style* (solid / dashed / dotted) encodes epistemic state, never color alone.
- Small, quiet, uppercase micro-labels for all metadata.
- A full-window dot-grid canvas as the field of work; controls and optional panels float above it.

## Colors

A parchment field written on with warm inks and muted botanical pigments, with one working blue.

### Primary
- **Fountain-Pen Blue** (#3b5bdb): the ink you work with. Selection borders, focus outlines (`#3b5bdb33` glow ring), hover text/border on controls, busy-state pulses, active-view indicators. It marks where attention is, never what content is.

### Secondary
- **Proposal Gold** (#b08a3e, soft #c9a860, text #8a6a1f): exclusively the color of unratified agent content — dashed card borders, change-set frames, proposed edges, the "◇ proposed" badge, pin flags. Backed by **Parchment Cream** (#fdf8ec) fills.

### Tertiary — the specimen tags (bound pairings)
Each thought type owns a muted background/ink pair, used together, always:
- **Moss / claim** (#e3ecdf on #3d5537) — also the logo's green.
- **Violet / question** (#e5e1f2 on #4a4174)
- **Slate / concept** (#dfe9ef on #35586b) — the surfaced-thought family (#6b7f8a borders, #f0f4f6 fill) is its dotted-border cousin.
- **Clay / example** (#f2e6df on #6b4a35)
- **Plum / prediction** (#f2dfe7 on #6b3550) — confidence pills reuse this family.
- **Ochre / evidence** (#ece5c8 on #635417)
- **Rust** (#8a3a2a): errors and destructive hovers only.

### Neutral
- **Ink** (#2c2921): titles, primary text, and the toast's dark surface.
- **Ink Soft** (#4d473c): statements and control text. **Ink Faded** (#5a523f): chip/status text. **Ink Muted** (#6d675c): badges, section labels. **Ink Quiet** (#8a8375): hints, placeholders, provenance marks.
- **Paper** (#f6f3ec): app and canvas ground, dotted with **Dot Grid** (#ddd8cc, 24px spacing). **Paper Panel** (#fbf9f3): side panels. **Paper Raised** (#fffdf8): toolbar. **Card White** (#fff): cards and controls.
- **Hairline** (#e0dbcf): panel borders. **Card Border** (#c9c4b8). **Control Border** (#d5d0c4). **Divider** (#eae5d9): inner rules. **Edge Ink** (#a89f8d): accepted relation strokes.

### Named Rules
**The One Ink Rule.** Fountain-Pen Blue is the only saturated color in the system and it means "the work is here": selection, focus, hover, busy. It never fills surfaces, never labels content, and never appears at rest.

**The Gold Means Proposed Rule.** The proposal-gold family appears only on agent content awaiting ratification. When a proposal is accepted, every trace of gold leaves it. Gold is a state, not a decoration.

**The Specimen Tag Rule.** The six type→hue pairings are invariant. New surfaces reuse them exactly, background with its matching ink, and never introduce a seventh content hue.

## Typography

**Body Font:** System stack (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif)
**Display Font:** none — the system speaks in one voice at small sizes.

**Character:** Quiet, utilitarian, and small — a labeling hand, not a headline voice. Hierarchy comes from weight, case, and letter-spacing rather than size jumps.

Every font-size in the app is a `--fs-*` token (`--fs-9` … `--fs-17`, base px × `--font-scale`), so the whole interface resizes from the appearance control (0.8–1.5×). Never hardcode a px font-size.

### Hierarchy
- **Title** (800, 16px/--fs-16, 0.02em): the wordmark and top-level identity only.
- **Card Title** (600, 13px/--fs-13, lh 1.25): thought titles, op labels — the workhorse emphasis.
- **Body** (400, 12–13px/--fs-12–13, lh 1.4): statements, rationale (italic), hints.
- **Section Label** (uppercase, 0.08em, 11–13px/--fs-11–13, ink-muted): panel headers ("Proposals", "Library").
- **Micro Label** (700, uppercase, 0.06em, 10px/--fs-10): type chips, action tags, badges, statuses.

### Named Rules
**The Quiet Caps Rule.** Uppercase + letter-spacing marks metadata (types, statuses, sections, actions) — never content. A thought's own words are always sentence-case.

## Layout

A continuous, full-window canvas is the base surface. Navigation floats at the top in three distinct clusters: graph and group scope; Canvas, Outline, Browse, and Prose views; and Library, Proposals, Inspector, Activity, and Appearance. The graph's menu holds creation, rename, and export. The searchable group picker lists groups vertically, shows membership counts and the current group, and keeps rename, empty, and delete beside the group they affect. Deleting a group uses an explicit label and confirmation, never a tab-close icon.

The bottom dock is for work on thoughts: New note and Undo; agent operations with visible selection and group context; and the model choice. The canvas's own controls — arrangement, radial focus, search, display options (card detail, connections, group colors), and camera zoom — form a single bar centered directly above the dock, with the camera set off by a hairline as its own segment. The bottom is two deliberate stacked rows, never clusters scattered into the corners. Outline and Browse retain their own thought-detail control beside view navigation. Menu positions stay within the viewport and support outside-click dismissal, Escape, and keyboard focus return.

Activity is a tool, not one of the four thought views: it is reached from the workspace-bar tools, takes over the center, and must give the center back. It names itself in a header and carries a labelled return to the view it covered; its toolbar button toggles back to that same view.

Library occupies a collapsible left panel; Proposals and Inspector share a collapsible right panel. Both retain independent resize controls. Opening a panel never resizes or shifts the canvas. Panels begin closed, with new pending change sets opening Proposals for explicit review. On narrow windows, opening one panel closes the other. Drafts and inspector edits survive hiding their panels. Panels and alternate views follow the measured navigation and dock heights as controls wrap or text scales.

Keep the existing small, scalable system typography, warm paper palette, and semantic proposal styling. Floating chrome uses restrained warm shadows and 12–14px corners, with air between each surface and the window edge. Outline and Browse retain reading space below the workspace controls and above the dock.

## Elevation & Depth

Mostly flat, with gentle ambient depth permitted. Cards rest with a soft warm hairline shadow; panels and menus may carry a quiet ambient shadow; shadows strengthen in response to state — dragging lifts a card, selection adds the blue ring, overlays and toasts float highest. Depth stays subtle enough that the desk reads as one paper surface.

### Shadow Vocabulary
- **Rest** (`0 1px 3px rgba(60, 50, 30, 0.12)`): thought cards at rest.
- **Lift** (`0 6px 16px rgba(60, 50, 30, 0.2)`): a card being dragged.
- **Selection ring** (`0 0 0 3px rgba(59, 91, 219, 0.18)`): selected cards and focused inputs — attention, not depth.
- **Ambient menu** (`0 6px 24px #382f201f`): dropdowns, popovers, panels that float over the desk.
- **Toast** (`0 4px 14px rgba(0, 0, 0, 0.25)`): the one near-black shadow, under the one dark surface.
- **Modal** (`0 10px 40px rgba(40, 33, 18, 0.3)`): dialogs.

### Named Rules
**The Warm Shadow Rule.** Shadows are tinted with ink (rgba(60, 50, 30, …) family), never neutral black — light on this desk is warm.

## Shapes

Softly squared paper: 8px radius for cards, trays, and toasts; 6px for buttons and controls; 4px for chips and tags; full pills (999px) for statuses, confidence, and inline actions. Borders are thin (1–1.5px, 2px only for selection) and always warm-toned.

Border *style* is semantic: **solid** = accepted knowledge and ordinary chrome; **dashed** = proposed, unratified agent content; **dotted** = an existing thought surfaced provisionally into view. Grouped controls (the view switcher) join into a segmented bar with collapsed inner radii.

### Named Rules
**The Border Speaks Rule.** Epistemic state is carried by border style plus a text badge (◇ proposed, ↖ existing, ✳ agent, ✎ you) — never by color alone. This is an accessibility invariant.

## Components

### Thought Card (signature)
- **Character:** a specimen card — labeled, tagged, movable by hand.
- **Shape:** 8px radius, 1.5px Card Border (#c9c4b8), white, rest shadow; padding 8px 10px.
- **Anatomy:** head row (type chip, badges, hidden ✕ remove), 600-weight title, and in reading zoom a statement, source, and relation summary over Divider rules; foot row (status pill, confidence pill).
- **States:** selected = 2px Fountain-Pen Blue border + selection ring; dragging = grabbing cursor + lift shadow; proposed = dashed Proposal Gold border on Parchment Cream; surfaced = dotted Surfaced Slate border on #f0f4f6.

### Buttons
- **Shape:** 6px radius, 1px outline, white background — there is no filled primary button.
- **Default:** Control/Card Border with Ink Soft text, 5px 10–12px padding, 600 weight for operations.
- **Hover / Focus:** border and text turn Fountain-Pen Blue; busy state pulses blue (`busy-pulse` 1.2s); disabled = 45% opacity.
- **Destructive hover:** text turns Rust.

### Chips (type tags)
- **Style:** Micro Label type on the bound type→hue pair, 4px radius, 1px 6px padding.
- **Action tags** (tray): Proposal Ink on #f5e9c9.

### Pills
- **Status:** 1px Control Border, #faf7f0 fill, Ink Faded text, 999px, 1px 7px.
- **Confidence:** plum family (#faf2f6 fill, #ddb8c8 border, Plum Ink text), 700 weight.
- **Inline action** ("+ add to working set"): slate outline pill that turns blue on hover.

### Cards / Containers (tray, panels)
- **Change set:** 1.5px dashed Proposal Gold Soft frame, Parchment Cream fill, 8px radius; operations inside as white 6px cards whose border shifts green-tinted (#7fa876 on #f4f8f2) when accepted, muted and 75% opacity when rejected.
- **Panels:** Paper Panel surfaces separated by Hairline borders; 12px padding.

### Inputs / Fields
- **Style:** white, thin warm border, 6px radius, inherited font.
- **Focus:** Fountain-Pen Blue border plus a soft blue glow ring (`outline: 2px solid #3b5bdb33`).

### Navigation (toolbar)
- Paper Raised floating clusters with warm hairline borders; moss-green 800-weight wordmark; named scope controls and a searchable group list; clearly selected view buttons. The separate action dock uses outlined operation buttons and a visible selection hint. Controls wrap responsively while keeping view and operation labels readable.

### Canvas & Edges
- Paper ground with the 24px Dot Grid; accepted relation edges in Edge Ink (1.5px) with small uppercase edge labels; proposed edges dashed in Proposal Gold Soft; faint construction lines #cfc8b8.

## Do's and Don'ts

### Do:
- **Do** use `--fs-*` tokens for every font-size so the appearance scale reaches it; never a raw px.
- **Do** pair each type hue with its bound ink (#e3ecdf with #3d5537, etc.) — background and text travel together.
- **Do** mark proposed/surfaced state with border style *and* a text badge, then remove every gold trace on acceptance.
- **Do** keep controls white and outlined, answering with Fountain-Pen Blue on hover/focus.
- **Do** keep shadows warm-tinted and quiet; reserve strong shadows for state (drag, overlay, toast).

### Don't:
- **Don't** introduce a filled, saturated primary button — the system has no loud call-to-action at rest.
- **Don't** use pure black, pure white backgrounds outside cards/controls, or neutral grays; every neutral is warm.
- **Don't** add a seventh content hue or reassign the six type pairings.
- **Don't** use Fountain-Pen Blue, Proposal Gold, or Rust for decoration — each is a reserved signal (attention, unratified, error).
- **Don't** encode any state by color alone.
