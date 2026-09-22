# Revealing cases: a workspace for discovering distinctions

**Status:** Exploratory brainstorm, not an implementation commitment.  
**Origin:** Discussion about tools for thought in the age of agents, September 2026.  
**Scope:** Synthesis of the shared vision, with experiments specific to Trellis. This does not change the canonical graph or ratification contract.

Read alongside [the design](design.md), [the post-prototype direction](post-prototype-direction.md), and [the perception-layer brainstorm](perception-layer-brainstorm.md). The companion brainstorm is in Strand at `docs/revealing-cases-brainstorm.md`.

## Starting point in Trellis

Trellis already offers persistent thought state, typed relations, explicit provenance, inspectable proposals, selection-scoped operations, bounded discussions and briefs, prose projections, and re-entry. Develop, Challenge, and Connect can improve an articulated model over time.

The opportunity is to return something the person thinks with as well as something they approve. A well-maintained graph may record sophisticated ideas without establishing that its owner can explain or apply them.

“Ratification friction is where thinking happens” should be treated as an experimental hypothesis. Review can mean endorsement without understanding. Preserve explicit control of canonical state while testing optional encounters that invite prediction, comparison, application, and revision.

## Shared ambition: delegation that increases human understanding

The motivating problem is a person trying to understand a field of inquiry and their own life. Chat can bury that work in a wall of text and require repeated backscroll to recover context. Persistent graphs and typed journal objects improve continuity, but a sophisticated stored record does not establish that its owner understands more.

The central design question is: **What can a person delegate that makes their next act of thinking more powerful?**

A promising division of labor: the agent searches, retrieves, compares, traces implications, and prepares encounters; the person predicts, distinguishes, interprets, experiments, and revises. The agent's primary craft becomes arranging good conditions for human discovery.

The working loop is:

**Question → current explanation → agent investigation → revealing encounter → revised explanation → later revisit.**

Three kinds of growth matter:

| Growth | What changes for the person |
|---|---|
| Understanding | I can explain, distinguish, predict, or apply something. |
| Attention | I notice something I previously passed over. |
| Agency | I can choose and act with a clearer account of why. |

Protect productive effort and delegate obstructive effort. Recovering a forgotten passage is usually a good thing to offload. Making a prediction or interpreting an exception may be precisely the work the person wants to retain. This boundary depends on their purpose; it should not become a compulsory tutoring mode.

## The museum of revealing cases

Picture a quiet worktable with a few concrete cases laid out around a live question. A case might be a personal episode, a historical event, an experiment, a passage, or a piece of software. The agent selects and prepares the material, while the person can rearrange it, annotate it, challenge the selection, and bring their own cases.

The first encounter should leave room for interpretation. Avoid immediately labeling cases with the explanation the agent hopes the person will discover. Give enough context to understand each case and direct access to the source.

The key moment is: **“I've seen all of these things before, but I've never seen them together.”**

The museum is a working metaphor, not a commitment to a gallery UI. A single table may be sufficient.

### A small vocabulary of thinking actions

- **Put together:** these cases share something; optionally name what.
- **Separate:** mark a meaningful difference.
- **Mark the hinge:** highlight the detail that changes an interpretation.
- **Predict, then reveal:** record an expectation before inspecting an outcome.
- **Find a difficult case:** ask for material that complicates a developing distinction.
- **Take outside:** choose something to observe or try beyond the app.

Gestures are provisional attention, not automatically endorsed beliefs. Reading without responding and leaving a collection unresolved must both be legitimate outcomes.

### Exhibit formats

| Format | Invitation |
|---|---|
| Similar cases, different outcomes | Find a consequential difference. |
| Different cases, similar outcomes | Look for a shared mechanism. |
| One case revealed in stages | Notice how an interpretation changes. |
| An apparent exception | Discover a boundary or revise a rule. |
| One case under several descriptions | Examine how framing directs attention. |
| Earlier and current interpretations | Recognize a change in one's own thinking. |

These are formats the agent can use, not a taxonomy the person must maintain.

### Curation is an argument, too

A selected handful of cases can make almost any explanation persuasive. Exact citations establish where material came from; they do not establish that the selection is representative or the interpretation is correct.

Make it possible to ask: “Why these cases?”, “What did you leave out?”, “Show the strongest case against this”, and “Find another explanation for the same examples.” Disclose the searched scope and distinguish retrieved evidence, agent interpretations, and invented illustrations. An agent should be able to say it found no revealing comparison.

Hypothetical cases and simulations may clarify implications, but cannot become independent evidence for their own assumptions. Missing journal mentions are not proof that something never happened. Changed circumstances and preferences are possible explanations for apparent contradictions.

## Other directions retained from the brainstorm

The museum sits inside a wider design space:

- **Studio for live questions:** persistent inquiries with current explanations, uncertainties, and bounded agent investigations. Re-entry begins where human judgment is needed, without reconstructing a conversation.
- **Wind tunnel for ideas:** vary conditions around an explanation to discover its limits, using explicit thought experiments or inspectable simulations.
- **Personal observatory:** choose what to notice next and connect expectations to later experience. Some questions concern values and commitments rather than empirically testable claims.
- **Adjustable apprenticeship:** explicitly retain the intellectual skill the person wants to develop while delegating supporting work. Scaffolding can change as competence grows.
- **Navigable understanding:** routes through examples, objections, and connections that lead back to the original question with a changed view.
- **Shared inquiry:** compare two people's explanations to locate differences in observations, causal models, expectations, or values. Clearer disagreement can be a useful outcome.

These are alternatives and extensions, not a combined feature roadmap. Keep Strand and Trellis distinct while testing their respective strengths; a shared conceptual loop does not require merging the products.

## A concrete Trellis encounter

The following is an illustrative inquiry; actual exhibits would need verified sources.

A person is exploring “What makes a system decentralized?” They select relevant thoughts and choose **Try this idea**. A temporary table presents a few systems with comparable evidence about who can change rules, exclude participants, or continue operating after failure.

The person groups the cases according to their current understanding. A difficult case has many independently operated servers but a single authority controlling participation. The person separates “distributed operation” from “distributed authority.” Another case tests the boundary of that distinction.

The resulting thought is grounded in examples the person inspected and an intellectual move they made. Its record could retain two revealing cases and a boundary case they still find difficult. Re-entry restores the reasoning behind the distinction, not only its final wording.

## Explore consequences as well as collecting cases

Select a claim such as “Small teams work better because communication is easier.” The agent prepares explicit scenarios varying task coupling, expertise, decision authority, or size. The person predicts and compares outcomes or implications.

Where a real simulation is appropriate, expose the assumptions and distinguish modeled consequences from observed evidence. For conceptual material, a carefully constructed contrast may suffice. The durable result might be a qualification: “I thought X held generally; now I think it holds under Y.”

This could become a new operation that produces a temporary reasoning surface before any graph proposal. It should not be forced into a set of newly generated thoughts just to fit the existing output format.

## Broader delegation through inquiry briefs

Current briefs route into bounded graph operations. An exploratory extension is a brief such as:

> Investigate this uncertainty. Bring back the strongest case that would force me to reconsider, with enough source material to judge it.

A return encounter could contain:

1. The inquiry and the person's starting explanation.
2. One consequential case or observation.
3. An optional prediction before revealing the outcome.
4. Evidence, sources, searched scope, and limitations.
5. A place for the person to revise or leave the question open.

The agent may do substantial research backstage, but the return should remain small enough to examine closely. Distinguish an agent's recommendation about what to inspect from a claim that the selected material settles the question.

## Relationship to durable thought state

An encounter is a workspace or projection, not automatically a thought, relation, or accepted explanation. Case arrangements, highlights, and reveal state belong to that workspace. They should not silently mutate canonical graph state.

A person can deliberately save their own formulation or request a proposed change set. Agent-authored changes still go through ordinary inspectable ratification. Preserve consulted sources and link the resulting distinction to the cases that motivated it. Do not interpret a drag gesture as a `supports` relation or a prediction exercise as an endorsed belief without an explicit step.

Potential durable outcomes include:

- A qualified or revised claim.
- A new distinction with concrete examples.
- A difficult case linked to an unresolved question.
- A prediction or observation to revisit.
- An unresolved case collection with no conclusion yet.

Avoid making every interaction produce graph growth. A successful encounter may simplify a model, retire a claim, or help the person use an existing idea.

## Smallest worthwhile experiment

Start from one selected claim or question. Present three source-backed cases on a table, with grouping, passage highlighting, a short formulation field, and **Find a case that complicates my explanation**. Offer an explicit route back into existing thought revision or proposals.

For a first evaluation, manually curated cases could isolate whether the interaction helps before automating curatorial quality. Then test agent selection around the same bounded inquiries. Broad ambient perception, a gallery of every topic, a generated curriculum, and cross-project synchronization can wait.

The perception-layer brainstorm mostly asks how to make existing graph structure visible. This experiment asks how to produce an encounter through which the person develops a new distinction. A relevance score or tension marker may help select material, but it is not the learning interaction itself.

## What to learn from the prototype

In addition to grounding and proposal quality, examine whether the person can:

- Explain the distinction in their own words afterward.
- Apply it to a new case several days later.
- Identify a boundary or counterexample.
- Describe what changed in their view and which evidence mattered.
- Challenge the agent's curation instead of merely accepting its framing.

Compare ordinary Challenge proposals with a case encounter on similar inquiries. An articulate immediate explanation is suggestive, not proof of durable understanding. Avoid turning tentative observations into a numerical mastery claim.

## Open questions

- Which inquiries benefit from cases, and which need derivation, practice, dialogue, or direct action instead?
- How should an exhibit expose comparable facts while preserving source-specific context?
- Can the person inspect curation choices without being overwhelmed by retrieval logs?
- How much staging is useful before it starts to feel like a quiz or a predetermined lesson?
- Should a saved distinction reopen its original encounter or only reference selected cases?
- How can exploratory gestures remain fluid while the boundary with endorsed state stays clear?
- If Strand supplies personal episodes later, what explicit bridge preserves provenance and the boundary between a past utterance and a current belief?
