# Trellis beyond the prototype: thinking, decisions, and action

## Status

Exploratory product direction for after the prototype. This document does not expand the scope of the [canonical prototype design](design.md). The prototype should first establish whether shared thought state and inspectable agent proposals improve thinking.

## Ambition

Trellis could become the place a person returns to understand their life and steer it: a system that connects what they are thinking, what they have decided, and what they are doing.

That ambition does not require Trellis to own every category of personal information. Becoming a comprehensive life organizer risks an endless list of features without improving the core experience. The more distinctive opportunity is **continuity between reflection and action**.

The prototype's central idea—thinking needs durable, inspectable state—applies beyond intellectual work:

- What am I trying to change?
- Why did I commit to this?
- What remains undecided?
- What did I learn from trying?
- Does this plan still make sense?

Notes and tasks belong in Trellis insofar as they help answer those questions.

## The expanded loop

The prototype establishes a loop from messy input to proposed structure to ratified thought state. A broader Trellis could extend that loop into action and learning:

**Capture → develop understanding → decide → act → observe → revise understanding.**

Consider a person deciding whether to move cities:

1. They capture messy notes about work, friends, cost, and what they want from daily life.
2. They develop beliefs and questions: “Being near friends matters more than having more space”; “Could I keep my current job?”
3. They record a decision, its rationale, and its unresolved assumptions.
4. They create commitments: ask about remote work, price a trial stay, talk to their partner.
5. They bring the results back as observations that revise the plan.

Months later, Trellis helps them recover why they chose something and whether those reasons still hold. A completed task can contribute to learning; a note can change an actual commitment.

The product's value is in preserving and making use of those connections.

## How the design would evolve

### Durable capture before structure

Everyday use needs a durable capture inbox. A journal entry, meeting note, or half-written idea should be allowed to remain intact indefinitely. Saving something must not obligate the person to process it.

Extraction should create linked thoughts while preserving the original note and its context. Freeform material is useful in its own right, even when it never becomes a set of atomic thoughts.

This requires distinguishing captured material from accepted interpretations. Saving “I hate my job” as something written on a difficult Tuesday does not establish it as a current belief. The system should preserve the difference between:

- What the person recorded at a particular time.
- What they currently endorse as an interpretation or belief.
- What they have committed to doing.

The graph can connect these without flattening them into the same kind of state.

Everyday capture also constrains the platform. The moments this loop depends on — a thought on a walk, the result of a phone call — mostly occur away from a desktop. The prototype's local-first, single-machine stack is right for testing its thesis, but the thinking and commitment ambition eventually forces multi-device capture and sync. That work is not part of the next experiment; the constraint is named here so that capture friction during the experiment is read as a platform limitation, not as evidence against the thesis.

### Commitments with their own lifecycle

A task needs behavior beyond what the current thought model provides. Tasks can be completed, deferred, canceled, or blocked. Claims can be believed, contested, or retired.

These objects can share stable identity, history, provenance, and links while retaining distinct lifecycles. Adding `task` to the existing thought types would not, by itself, provide a useful task system.

The relationships are where Trellis could contribute something distinctive:

- This action tests that assumption.
- This commitment follows from that decision.
- This observation changes the rationale for that plan.

These are examples of useful semantics, not a proposed final ontology. The next experiment should establish which relationships earn their complexity.

### Decisions built on the prediction machinery

The prototype already gives predictions structured confidence and a calibration trail. Decisions are the natural consumer of that machinery. A decision is largely a bet on predictions — "I could keep my current job" — and a decision review is where calibration pays off: this choice rested on a prediction held at 80% that did not survive; what does that revise?

A decision is also unlike a claim. It is dated, it chose among alternatives, and its rationale links to beliefs that can later change. If `decision` becomes a first-class object, it likely wants structured fields the way `prediction` did — links to its rationale, alternatives considered, a review-by date — rather than only a new entry in the thought type list.

### The return leg needs an initiator

The loop's most distinctive segment — observe → revise understanding — does not run on its own. "Months later, Trellis helps them recover why they chose something" assumes the person thought to come back. Without a trigger, the loop in practice is capture → decide → forget.

Revision needs mechanisms that schedule it: a review-by date on a decision, staleness detection on commitments, and a proactive counterpart to the prototype's re-entry summary — "this decision's rationale rested on an assumption you have since contradicted." Which triggers earn their interruptions is itself an experimental question; a system that nags loses trust as quickly as one that stays silent. But some initiator must exist, or "does this plan still make sense?" is a question that never fires.

### Interfaces for different moments

The canvas is useful for exploring a question. Other situations call for other surfaces:

- A checklist while running errands.
- A writing surface while reflecting on a difficult conversation.
- A focused action list while working on a project.
- A review showing commitments, open questions, and changed assumptions.

“Views are projections” remains a strong foundation. In a mature product, those views need to support doing the work as well as displaying its structure. The person should not have to interact with a graph to perform every everyday action.

### Ratification matched to the change

Deliberate review remains valuable when an agent proposes a belief, revises a decision's rationale, or infers a commitment. These changes affect the person's account of what they think or intend.

The leading hypothesis is that direct human actions—writing a note, creating a task, checking it off—apply immediately, with authorship and provenance preserved, so routine use never becomes a proposal-review queue. That is a hypothesis, not a settled rule: the prototype has not yet shown where ratification friction actually produces ownership, and dogfooding may complicate the boundary — a direct human edit can silently invalidate a relation the agent maintains.

The post-prototype questions are therefore two. First, which kinds of agent changes require deliberate ratification, and which assistance can be made lightweight without weakening ownership. Second, which changes the agent may *initiate*. The prototype's agent acts only when invoked on a selection; the return leg of the loop implies an agent that notices things unprompted, across time. That is a qualitatively different trust posture and should be introduced deliberately, not arrive as a side effect of adding triggers. The prototype should still test its stricter review model before any of these rules are relaxed.

### Context across life, with boundaries

The prototype's isolated graphs protect against irrelevant context. Broader use may eventually benefit from explicit bridges between spaces: a work decision can affect a personal goal, for example.

Those bridges should remain visible and controllable. Opening a work project should not implicitly pull private journal entries into the agent's context. “Selection is context” could evolve into an explicit working context assembled from several spaces, with the person able to inspect and adjust its sources.

Life-wide usefulness does not imply universal context on every operation.

The stakes of the data change too, and that is a product problem, not a technical one. A thinking workspace holds work ideas; a thinking and commitment system holds journal entries about a marriage, a job, health. Two consequences follow. Privacy, durability, and longevity become trust prerequisites rather than infrastructure details — people will not journal into a system they are not confident will exist, and stay private, in five years. And agent-proposed interpretations of a person's life ("this suggests you have already decided to leave") carry different weight than proposed claims about a design document. Ratification helps, but the sensitivity of inference *within* a space deserves the same explicit attention as context boundaries *between* spaces.

## Scope options

| Direction | Promise | Main risk |
|---|---|---|
| Focused thinking workspace | Help develop and revisit difficult ideas | Used only during occasional deep work |
| Thinking and commitment system | Connect notes, decisions, actions, and outcomes | Requires excellent everyday capture and review |
| Comprehensive life organizer | Manage every category of personal information | Utility features consume the product's attention |

The recommended ambition is the **thinking and commitment system**, while keeping the prototype narrowly focused on its existing thesis.

This leaves room for native notes and tasks where they strengthen the loop. It also leaves room for connections to other tools when replacing them would add little value. Trellis does not need to own every record to help a person understand how their thinking and commitments fit together.

## The next experiment

After the prototype proves useful, use Trellis for one real project that requires both thought and action over several weeks.

Add only enough capability to support that project:

- Durable freeform notes, with links to thoughts extracted from them.
- A way to record a decision and its rationale, linked to the predictions it rests on, with a review-by date.
- A small action list linked to the relevant decisions, questions, or assumptions.
- A review experience that brings actions and observations back into the person's understanding — scheduled by the system, not left to memory.

Two cautions about the experiment's design. It will compete with the person's existing task manager and notes app, so a null result can measure switching costs rather than the thesis; the review should distinguish "the connections did not help" from "capture happened elsewhere out of habit." And the evidence below consists of one-off subjective events that will be unrecoverable at review time unless recorded when they happen — keep a lightweight log of loop events (a rationale revisited, a commitment invalidated by a note) during the experiment.

The review should answer:

> What was I trying to accomplish, what did I do, what did I learn, and what should change?

The experiment is about whether connecting these activities improves the next decision or action. It is not yet a mandate to build a complete note-taking or task-management product.

### Evidence for expanding

- Revisiting a decision's rationale changes current priorities.
- Completing an action produces an observation that updates understanding.
- A new note reveals that an existing commitment no longer makes sense.
- Returning to a project requires less reconstruction of its purpose and current state.
- The connections are useful enough that the person wants to preserve them during ordinary use.

### Evidence for staying focused

- Notes and tasks are mostly used independently of the thinking workspace.
- Maintaining connections feels like additional administration.
- Review produces summaries without affecting decisions or actions.
- Ordinary capture becomes slower because the system expects structure.
- Building task and note features displaces improvements to the thinking loop without increasing its usefulness.

The likely outcome is mixed evidence, so decide now what it resolves to: if the connections helped but maintaining them was an irritant, that argues for reducing the cost of maintenance and re-running the experiment — not for expanding as if the friction were absent, and not for abandoning the direction. Only clear evidence on both lists' terms should move the ambition in either direction.

If the connections help the person make a better next move, the broader system has earned its next expansion. If they do not, Trellis can remain a valuable focused thinking workspace and connect to existing tools where useful.
