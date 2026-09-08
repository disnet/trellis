# Trellis as a public digital garden

## Status

Exploratory product direction, developed from dogfooding. This document does not expand the scope of the [canonical prototype design](design.md), and it sits alongside — not on top of — the [thinking and commitment direction](post-prototype-direction.md) as a second candidate for where Trellis goes after the prototype. The two directions are compared at the end.

## The idea

Give people a public place to do their thinking.

Publish a Trellis graph to the open web — using atproto, so the graph lives in the person's own data repository under their own identity — and render it as something anyone can browse: a digital garden whose front door is readable prose and pinned thoughts rather than a canvas. Gardens can link to each other; those links are visible to agents, which can use a followed garden as disclosed context for making new connections. The status of thoughts (tentative, contested, retired, superseded) stays prominent throughout, so what a reader sees is not a feed of positions but the evolution of a person's thinking.

The motivating contrast is with social media. The structure of social platforms incentivizes the combat model of public discourse: positions harden, engagement rewards the dunk, and changing your mind reads as losing. A garden structured around evolving thoughts and connections between them could incentivize the opposite — developing ideas in public, engaging with a position at a point in its development, and treating a reversal as growth rather than defeat.

## Why this direction is credible

### It builds on what dogfooding validated

What dogfooding has confirmed is the prototype's core: pulling apart ideas with an agent and recording them in the graph is genuinely useful. The thinking-and-commitment direction bets on a second, unproven thesis (connections between decisions and actions improve the next action) and carries a brutal competitive requirement (beating an incumbent task manager on everyday capture). The garden direction takes the already-validated core and asks a shorter question: what if the output of this thinking were shareable?

### Ratification becomes a credibility primitive

Privately, ratification is where thinking happens. Publicly, it becomes something else: a stamp. In a web filling with generated content, "every thought here was deliberately accepted by a human, with provenance showing what the agent proposed and what the person endorsed" is a real claim to credibility. Trellis's hard constraint — model output never becomes accepted state without an explicit human action — is exactly the property a trustworthy public garden needs, and almost nothing else has it structurally. This could be the positioning.

### The appetite exists; the tooling does not

Epistemic-status tags (Gwern), digital-garden growth stages (Maggie Appleton's seedling → budding → evergreen) — these conventions exist because people want to publish thinking-in-progress with honest confidence labels. But they are hand-maintained blog metadata that rot the moment the author stops tending them. In Trellis, status is structural: tentative or retired is the actual state of the thought, and `supersedes` relations are the actual history of the thinking. The positioning writes itself: a digital garden where the garden is the native data model, not a blog convention.

## Why atproto specifically

- **Identity and provenance map cleanly.** DIDs give durable authorship. Trellis already records who authored and who accepted each revision; that provenance can travel with the published record.
- **Data lives in the person's PDS.** The commitment direction's own analysis holds that durability and longevity are trust prerequisites — people will not invest in a thinking system they doubt will exist in five years. "Your graph is in your repo; Trellis is one app that renders it" is the right durability story.
- **Cross-repo links are the native pattern.** A cross-user relation is a record in *my* repo whose object is an at-uri in *yours* — structurally identical to a Bluesky like or follow. Federation does not need to be invented.
- **strongRefs answer the mutability question.** A cross-garden link can pin the exact revision it engaged with (at-uri + CID), and a renderer can show "this thought has since been superseded." That staleness is not a bug; watching thinking evolve is the product.
- **The firehose gives agents a subscription model for free.** "Show me what the gardens I follow have ratified this week, and propose connections to my graph" falls out of jetstream plus the existing Connect operation.

### The constraint to respect

Everything published on atproto is public, full stop; private data there is unsolved. So publishing must be per-graph opt-in **export**, never sync. Local remains the source of truth; ratifying a change in a published graph pushes records. This conveniently sidesteps the multi-device sync problem rather than entangling the direction in it, and the existing isolated-graphs model already provides the boundary: the sensitive-journal graph and the public garden are different graphs.

## Lexicon sketch

The graph model translates almost one-to-one. Roughly:

- **thought** — statement, type (claim / question / concept / example / prediction / evidence), status, createdAt, optional `supersedes` strongRef, provenance (agent-proposed vs. human-authored; always human-accepted).
- **relation** — subject ref, object ref (an at-uri, possibly in another repo), relation type from the existing vocabulary.
- **graph** — a descriptor record: title, summary, pinned thoughts (the front door).
- possibly **treatment** — published prose views, visibly agent-authored, with source refs.

Predictions deserve special attention: published predictions with structured confidence and resolution dates are a genre people already love (prediction registries, Manifold), and a public calibration trail is very garden-native.

Open design questions:

- Do relations pin revisions (CID) or track the living thought? Leading answer: pin at creation, render staleness.
- What happens to a published record when a thought is retired — tombstone or status flip? Leading answer: status flip. Retirement *is* content in this model; deleting it would erase the evolution the garden exists to show. (True deletion must still exist for the person who wants something gone.)
- An NSID domain is needed for the lexicon namespace.

## The front door

The canvas is the explorer, not the landing page. The strongest front door is **prose treatments backed by the graph**: a generated Overview that reads naturally, where inline references open the underlying thoughts. The machinery already exists.

A reader's progression, each layer optional:

1. A readable essay.
2. They notice a claim is marked tentative.
3. They click through and see the supporting and contradicting structure.
4. They follow a link into someone else's garden.

Pinned thoughts complement this as direct entry points into the structure. One rule carries over with extra force in public: treatments are visibly agent-authored derived views and never the canonical artifact.

## The hard part: links between gardens without recreating combat

`contradicts` across users is one UI decision away from being a quote-dunk. The anti-combat goal needs mechanism design, not just intent. Levers that look promising:

- **Softened rendering vocabulary.** The relation type stays `contradicts` in the data — the graph semantics need precision — but the public rendering says **"in tension with."** "Contradicts" reads as a verdict on a person; "in tension" describes a relationship between ideas that both parties can stand behind while the tension is worked out. The same move may apply elsewhere (e.g. `supersedes` rendering as "rethought as").
- **Asymmetric visibility.** My relation to your thought lives in my repo. Whether it renders on *your* garden is your choice — accepting inbound links is a ratification-shaped act, consistent with the rest of the product. No notification-driven reply pressure.
- **Status softens disagreement structurally.** A `contradicts` from a thought marked tentative reads as "I'm thinking against this," not "you're wrong." Engagement is with a position at a point in its development, and everyone's own history displays their reversals — which is humility-inducing in a way social platforms structurally are not.
- **No velocity mechanics.** No counts, no trending, no reply chains. An agent surfacing "a garden you follow connects to this" during your own thinking session is a fundamentally different rhythm than a mentions tab.
- **Agent-mediated reading, not feed-mediated.** Other gardens enter a person's world mainly as context for their own Connect and Challenge operations. The existing no-invisible-retrieval constraint covers disclosure. The new issue is that other people's ratified thoughts become quasi-trusted input to your agent — a prompt-injection and quality surface that deserves an explicit boundary: consulted and disclosed, never auto-accepted, like everything else.

## Sequencing

The full vision has a network-effects dependency — linking gardens needs gardens — so stage it to produce value at every step:

1. **Static publish, no atproto.** Render one graph from the existing JSON export to a browsable static site: treatments as front door, status-prominent thought pages, canvas as explorer. Publish the author's own dogfood graph. This tests the two riskiest assumptions cheaply: do readers get value, and does the author actually want their thinking public? It also makes the whole vision legible to the early testers about to onboard.
2. **Lexicons + PDS publishing.** The same rendered experience, but records live in the person's repo. Valuable even with zero network: durable identity, permanence, other apps can render the data.
3. **Cross-garden links + agent subscription.** Only after stages 1–2 show a pulse.

Stage 1 is on the order of a week of work and produces a shareable artifact either way.

### Evidence for continuing

- Readers spend time in the graph layer, not just the essay layer — the structure, not only the prose, is what they came for.
- The author keeps publishing after the novelty fades; ratify-then-push feels like part of thinking, not a chore.
- Status and supersession draw comment — people engage with the *evolution*, not just the positions.
- A second person wants a garden of their own after seeing one.

### Evidence for stopping

- The published garden reads worse than a blog post of the same material — structure subtracts rather than adds for readers.
- Publishing pressure distorts the private thinking (thoughts written for an audience, tentative status avoided).
- Cross-garden links, once available, are used mostly adversarially despite the mechanisms above.

## The two directions, side by side

| | Thinking and commitment system | Public digital garden |
|---|---|---|
| Direction of ambition | Inward: private life context | Outward: thinking commons |
| Trust posture | Deep privacy as prerequisite | Deliberate publicness |
| New thesis to prove | Connections between decisions and actions improve the next action | Readers and thinkers get value from published, evolving thought graphs |
| Depends on | Excellent everyday capture; beating incumbent task/notes tools | Rendering quality; eventually network effects |
| Cheapest probe | Weeks-long real project with capture, decisions, review | Static publish of an existing dogfood graph |

The directions are not incompatible — isolated graphs plus per-graph opt-in publishing keep both live indefinitely — but they pull product attention in genuinely different directions, and whichever gets the next experiment will shape what Trellis is. The tentative lean of this document: the garden direction is more differentiated (many tools chase the life organizer; nothing offers a human-ratified, provenance-carrying public thought graph), more energizing as a demonstration, and cheaper to test. The commitment direction remains written up on its own terms and loses nothing by waiting for that test.
