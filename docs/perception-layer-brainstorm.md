# A perception layer for Trellis: brainstorm on System One judgments

## Status

Brainstorm, not commitment. Nothing here expands the scope of the [canonical design](design.md), and none of it is scheduled. The document exists to record a line of thinking so it can be argued with later: what becomes possible when a cheap, fast, calibrated *judgment* model sits beside the expensive generative agent, and which of those possibilities Trellis should actually want.

The concrete trigger was evaluating TypeSafe's Jev (a "System One" model: it takes natural-language state plus typed questions and returns answers and calibrated probabilities, never prose). The ideas are written against that shape but do not depend on that vendor. Any model that returns typed judgments cheaply enough to run continuously would do.

## The shift: from invoked proposals to ambient perception

Everything the agent does today is expensive and invoked. The person selects, clicks Decompose or Connect, waits several seconds, and reviews a change set. That loop is the point of the prototype and should not change.

A judgment model changes the economics of a *different* kind of work. Asking "do these two thoughts contradict each other?" costs a fraction of a cent and returns in well under a second. Many independent questions can go in one request. That makes it reasonable to run perception over the whole graph, on every ratification or even every keystroke, and render the result as ambient signal rather than as a proposal.

This is a second kind of agent Trellis does not have: one that can **notice** but structurally **cannot write**. There is no text to ratify because it produces none. It fits the trust model unusually well:

| | Generative agent (today) | Perception layer (proposed) |
|---|---|---|
| Output | Structured change sets | Probabilities, scores, choices |
| Trigger | Person invokes on a selection | Continuous, or on state change |
| Can alter thought state | Only through ratification | Never |
| Cost per call | Cents to tens of cents | Fractions of a cent |
| Rendered as | Proposal tray | Markers, weights, orderings, nudges |

The [post-prototype direction](post-prototype-direction.md) worries about the "return leg" of the loop, where the agent notices something unprompted, and calls that a qualitatively different trust posture that should be introduced deliberately. A perception layer is one deliberate way to introduce it: the agent gets eyes before it gets hands.

### How it relates to the principles

- **State over transcript.** Perception outputs are derived, like prose treatments. They are never thoughts, never relations, and never enter revision history. They can be recomputed and discarded.
- **The agent proposes; the human ratifies.** Unchanged. Perception cannot propose. When a signal leads to a change (accepting a tension line as a relation), that is a direct human action, exactly like adding a relation manually today.
- **Selection is context.** This is the principle that needs extending. Continuous perception over the whole graph *is* graph-wide retrieval. The rule "no invisible retrieval" becomes: **perception is always rendered where it applies, and anything from the perception layer that reaches a generative operation lands in `consulted`.** The input to perception is always the person's own graph; it never retrieves outside material.
- **Structure without premature bureaucracy.** Several ideas below are exactly "capture freely, propose structure afterward," made lightweight enough to happen without a tray.
- **Legible to a newcomer.** Ambient signals must be explainable in one sentence and dismissable. A canvas covered in unexplained glyphs fails this harder than no signals at all.

## Judgment shapes we would use

Three primitives cover everything below. Naming them once so the ideas can be terse.

- **Noul**: probability that a yes/no condition holds. "Does thought B's statement undercut thought A's?"
- **Choice**: pick one of a defined set, with a probability per option and a confidence. "Which relation type best describes A → B?"
- **Score**: position on ordered, described levels. "How strongly does this evidence bear on this claim: irrelevant / weakly / directly / decisively?"

Every question carries the relevant thought titles and statements as state. Question text must be self-contained; the model sees no ids. Answers come back with probabilities, so code (not the model) decides thresholds, and thresholds can be tuned without re-running inference.

## Ideas

Grouped by which surface they touch. Each has: what the person sees, what is asked, and the open question that would decide whether it earns its place.

### Epistemics: features only Trellis could have

**1. A second opinion on your own bets.**
Predictions carry a human probability and a calibration trail. A calibrated judgment model can answer the same question, using only the evidence in the graph. The Inspector shows both: "You hold this at 0.80. Read from the graph's evidence, the model puts it at 0.55." The disagreement itself is the thinking prompt, more than either number.
- Ask: one Noul per prediction, state = the prediction's statement plus every thought related to it by `supports` / `contradicts` / `depends_on`, with their statements and statuses.
- Constraints: input is the person's own graph, so selection-is-context holds. The model's number is never written to the prediction; it is a derived reading. Needs a clear label that this is a reading of *the graph's* evidence, not world knowledge, or the comparison is misleading.
- Open question: is a model's probability on an arbitrary personal prediction meaningful enough to show? The calibration guarantee is over populations, not single answers. Worth testing on a handful of resolved predictions before believing it.
- Variant: **falsifiability check**. Noul on whether the prediction as written has a criterion that could actually resolve it. Surfaces "this is a hope, not a prediction" at authoring time.

**2. Tension lines.**
Contradictions that have no `contradicts` relation are invisible today unless Challenge happens to find them. Run a contradiction Noul across thought pairs that share no relation. Where probability is high, draw a faint dashed line on the canvas. Click to make it a real relation, or dismiss (and remember the dismissal).
- Ask: one Noul per candidate pair. Pairs are shortlisted in code (same graph, no existing relation, some term overlap or shared neighborhood) to keep the count manageable; the model only judges the shortlist.
- Constraints: rendered on the canvas, so disclosed by construction. Dismissals must stick, or it nags.
- Open question: at what graph size does this stop being noise? On thirty thoughts it may find nothing; on three hundred it may be the most useful thing on screen.

**3. Support strength as edge weight.**
Relations are typed but binary. A Score per `supports` / `contradicts` relation on how strongly the evidence actually bears on the claim gives two things: line weight on the canvas, and a diagnostic, "this believed claim rests on two relations the model reads as weak."
- Ask: Score with levels like *not actually related / tangential / directly bears / near decisive*, state = both statements plus the relation type.
- Constraints: strength is a perception attribute, stored beside the relation like a canvas coordinate, never in the relation record itself. Card coordinates and layout already live in projections; this belongs with them.
- Open question: does judged strength agree with the person often enough to trust as a default line weight, or should it only appear on hover?

**4. Status drift.**
Status (`tentative` / `developing` / `believed` / `contested` / `retired`) is set by hand and goes stale. A check of whether a `believed` claim's status still matches its evidence produces a quiet marker, never a change.
- Ask: Choice over the status vocabulary given the claim, its relations, and their statements; compare to the current status; mark when the model's top choice differs *and* its confidence is high.
- Constraints: marker only. Status changes remain a human edit in the Inspector.

**5. Questions that now have answers.**
For each `question` thought, ask whether the graph now contains an answer. Re-entry gets a line it cannot compute structurally today: "Two open questions became answerable while you were away." The Inspector on a question shows the candidate answering thoughts.
- Ask: Noul per question over the question's neighborhood plus new or revised thoughts since last visit; a second Choice picks the most likely answering thought from the candidates so the person can jump to it.
- Constraints: this is a retrieval over the graph. The result is rendered on the question, so it is disclosed. If the person then invokes Develop on the question, the candidates should be in `consulted`.

### Composition: making capture lighter

**6. Scratch that knows what it is.**
While the person types in Scratch, a speculative fan-out asks several things at once: how many distinct claims are here (Score), is this a question (Noul), is this a reaction to an existing thought (Choice over recent or pinned thoughts, with a *none* option). The composer suggests Decompose, Develop, or "reply on *Working memory is not a buffer*" before the person chooses.
- Constraints: suggestions, never automatic routing. Debounced so it is not a call per keystroke. Should degrade to nothing without network.
- Open question: is the suggestion useful, or does the person already know what they want by the time they have typed it? Cheap to test, easy to remove.

**7. Type suggestion on manual thoughts.**
The person writes a thought without picking a type. A Choice over the six types offers one when confident and stays silent otherwise. Same for status. Structure proposed afterward, no tray.
- Constraints: silence below a confidence threshold is the feature. A wrong suggestion on every card is worse than none.

**8. Semantic quick search.**
Quick search today is substring matching. One request can score every thought against a plain-language query: "the place where I argued against embodiment." Results interleave with substring hits, marked so the person knows which is which.
- Ask: one Choice whose options are all thought ids (titles as state), plus a Noul on whether the graph contains a match at all, so an empty result is honest rather than a low-probability guess.
- Constraints: on small graphs substring search may already be enough. Worth it once titles stop being memorable.

**9. Working set candidates.**
When a lens is active, faintly highlight thoughts outside it that likely belong. Membership stays a direct human action; the highlight is an invitation.
- Ask: Noul per non-member thought against the working set's name and a sample of its members.
- Constraints: attention state is never routed through the tray; this respects that. Highlight must be visually distinct from the lens itself.

### Review: making ratification sharper

**10. Tray triage.**
Proposals arrive as a list in the model's order. Score each proposed thought on novelty against the existing graph, on atomicity (one idea that can be independently challenged), and on specificity. Sort or badge the tray so the proposals that need real attention come first, and near-duplicates of existing thoughts are flagged as such.
- Ask: per proposal, a Noul for "restates an existing thought" (with the top-k similar thoughts as state), a Score for atomicity, a Score for specificity.
- Constraints: the badges explain why the tray is ordered this way. Ordering the tray by anything opaque violates legibility.

**11. Relation type sanity check.**
The generative model proposes `supports`; ask a Choice over the six relation types given the two statements. When the answer disagrees with high confidence, badge the proposal. The person still decides.
- Ask: one Choice per proposed relation.
- Constraints: a low-confidence disagreement should not badge; several relation types are often defensible.

**12. Reply that wants to be a proposal.**
Side conversations extend discussion without touching state. A Noul on each agent reply, "does this reply implicitly propose a change to thought state?", nudges "Turn this into a proposal" when it does. Keeps the reply-versus-propose boundary visible without policing it.

### Re-entry and continuity

**13. Changes that matter.**
Re-entry lists new and revised thoughts. A Score per change on how much it alters meaning (cosmetic / clarifies / shifts the claim / reverses it) orders the list and lets the panel say "one revision reversed a claim you pinned."
- Ask: Score with the previous and current statements as state.
- Constraints: derived, recomputed per visit, never stored on the revision.

**14. Prose staleness that means something.**
Treatments are marked stale when any source thought changes. A Noul on whether the change materially affects the treatment's content (previous statement, new statement, and the treatment's relevant passage as state) distinguishes "a typo was fixed" from "the argument moved." The stale badge becomes two badges.

**15. Meaning drift across revisions.**
In the Inspector's revision history, a Score between the first ratified statement and the current one shows how far a thought has travelled. Useful when a thought has been revised by the agent several times and the person wants to know whether it still says what they originally meant.

### Beyond the current scope

**16. Visible bridges between graphs.**
Graphs are isolated by design. If that loosens, the cheapest safe bridge is a Noul, on titles only, asking whether a new thought bears on another graph, and offering a bridge the person can see and refuse. The post-prototype doc wants bridges "visible and controllable"; a perception signal with no statement text crossing the boundary is a minimal version.

**17. Assumption staleness on decisions.**
If decisions become first-class objects with linked rationale, the return-leg trigger the post-prototype doc asks for is a Noul per rationale link on ratification of any change: "does the revised thought undercut this decision's rationale?" This is the contradiction detector (idea 2) pointed at a specific structure.

### Development, not product

**18. Semantic evals.**
The eval harness compares shape and size (thought count, type distribution, relation count, latency) because semantic grading has been expensive and inconsistent. Cheap typed judgments make it repeatable:
- **Faithfulness**: per proposed thought, a Choice over "supported by the source text / plausible extension / not in the source," following the citation-check pattern.
- **Atomicity**: Score per thought.
- **Coverage**: per source paragraph, a Noul on whether some proposed thought captures it.
- **Relation sanity**: idea 11, run over the whole export.

This one is worth pursuing regardless of whether any product feature ships, because it makes the others measurable and gives the model matrix in `evals/` something to say beyond "Fable produced more thoughts than Sonnet."

**19. Effort routing.**
A Score on scratch input density could pick reasoning effort automatically. Probably premature: the model switcher exists precisely so the person can steer this, and hiding it contradicts legibility.

## Cross-cutting constraints

**Determinism.** The context builder promises identical requests for identical graph state. Perception outputs are not deterministic across model versions. Two mitigations: cache every judgment keyed on the exact statements it was asked about (a revision changes the key), and keep perception out of the generative request path except through `consulted`, where it is recorded anyway. Idea 5 and any reranking of Connect/Challenge retrieval are where this bites.

**Offline and fixtures.** Trellis runs offline with deterministic fixtures and that stays the desktop default. Every perception feature needs a null path: no signal, no marker, not an error. The existing term-overlap retrieval is the natural fallback where a judgment would have reranked.

**Another credential.** A second cloud API means a second key in settings and a second thing for early testers to configure. Perception should be off until configured, and the app should be complete without it. It may make sense to gate all of it behind a single "perception" toggle in the model switcher rather than per-feature settings.

**Noise budget.** Ambient signals compete for attention. A rule of thumb: every perception feature should be individually dismissable, and the canvas should never show more than one class of perception marker at a time by default. Start with everything in the Inspector, where it is asked for, and promote to the canvas only what proves useful.

**Storage.** Perception results are projections. They live beside canvas layout and working-set membership, never on thoughts, relations, or revisions. Export should omit them or mark them clearly as derived.

**Privacy.** Statements leave the machine for judgment, as they already do for generation. The post-prototype doc notes that the stakes change once graphs hold journal-grade material. Perception runs more often over more of the graph than generation does, so it sends more. That should be visible in the Activity view like every other model call.

## What this does not do

- It does not replace the generative adapters. Decompose, Develop, Challenge, Connect, discussion, and prose need a model that writes.
- It does not decide anything. Every threshold lives in code and every action remains the person's.
- It does not make the graph smarter on its own. It makes what is already in the graph more visible.

## Sequencing, if any of this is pursued

1. **Semantic evals (18).** Development-only, no UI, no trust questions, and it calibrates our own expectations about how reliable the judgments are on Trellis-shaped content before any of it reaches the person.
2. **Retrieval reranking for Connect and Challenge.** Not a new feature, an improvement to an existing one, isolated to one function, disclosed through `consulted` already, with term overlap as fallback. Tests the determinism and caching story.
3. **Prediction second opinion (1).** Inspector-only, unique to Trellis, directly tests the calibration thesis the design already cares about.
4. **Tension lines (2)** once graphs are large enough for it to find something.

Everything else waits on evidence from those four. Several ideas above (6, 7, 9, 12) are cheap to try and cheap to delete, which is a reason to try them late rather than early: they are the ones most likely to add noise before the noise budget is understood.

## Open questions

- Is a calibrated probability from a general model meaningful on a single personal prediction, or only in aggregate? Idea 1 depends on the answer.
- Where does perception state live in the schema: a `perceptions` table keyed on statement hashes, or a JSON column on the canvas projection?
- How should the "no invisible retrieval" principle be reworded in `design.md` to cover rendered perception? Proposed wording is above; it should be argued with before anything ships.
- Does a person want to be told their graph disagrees with them, or does that erode the sense that the graph is theirs? This is the same ownership question ratification friction was designed around, and dogfooding is the only way to answer it.
