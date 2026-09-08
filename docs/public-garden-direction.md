# Trellis as a public digital garden

## Status

Exploratory product direction, developed from dogfooding. This document does not expand the scope of the [canonical prototype design](design.md), and it sits alongside — not on top of — the [thinking and commitment direction](post-prototype-direction.md) as a second candidate for where Trellis goes after the prototype. The two directions are compared at the end.

## The idea

Give people a public place to do their thinking.

Publish a Trellis graph to the open web — using atproto, so the graph lives in the person's own data repository under their own identity — and render it as something anyone can browse: a digital garden whose front door is readable prose and pinned thoughts rather than a canvas. Gardens can link to each other; those links are visible to agents, which can use a followed garden as disclosed context for making new connections. The status of thoughts (tentative, contested, retired, superseded) stays prominent throughout, so what a reader sees is not a feed of positions but the evolution of a person's thinking.

The motivating contrast is with social media. The structure of social platforms incentivizes the combat model of public discourse: positions harden, engagement rewards the dunk, and changing your mind reads as losing. A garden structured around evolving thoughts and connections between them could support developing ideas in public, engaging with a position at a point in its development, and treating a reversal as growth rather than defeat. Whether those affordances change behavior is a separate thesis to test.

There are three bets here: publishing helps the author; structured, evolving thought helps readers; and interconnected gardens improve discourse. The first experiment tests the first two. Its success would justify exploring the third, without establishing it in advance.

## The first audience and payoff

The initial audience hypothesis is someone already explaining an evolving position to a small, recurring audience: an independent researcher, technical writer, or practitioner developing an approach. The recurring job is concrete: **"I can send someone my current understanding without rewriting the whole explanation, and they can inspect the uncertainty and see what changed."** A garden should earn its keep with five readers and no cross-garden network.

The reader's job is to understand the author's current view, inspect its reasons and unresolved objections, and return to meaningful changes. Public thinking is a broad ambition; this is the narrower exchange the first experiment should make useful.

## Why this direction is credible

### It builds on what dogfooding validated

What dogfooding has confirmed is the prototype's core: pulling apart ideas with an agent and recording them in the graph is genuinely useful. The thinking-and-commitment direction bets on a second, unproven thesis (connections between decisions and actions improve the next action) and carries a brutal competitive requirement (beating an incumbent task manager on everyday capture). The garden direction takes the already-validated core and asks a shorter question: what if the output of this thinking were shareable?

### Ratification makes thinking accountable and inspectable

Trellis's hard constraint — model output never becomes accepted state without an explicit human action — provides a useful basis for public accountability. Readers can inspect which material came from an agent, what the person retained or changed, and how their position evolved. The promise is **"see what I currently think, why, and what changed."**

Acceptance into the workspace, belief, and publication are distinct decisions. A person may accept an objection because it deserves consideration without believing it, or believe something without wanting it public. Ratification records deliberate inclusion in the workspace; status and context communicate the person's stance. It does not certify truth, careful review, or sincerity. Public provenance should preserve those distinctions rather than present a blanket badge of credibility.

### The opportunity is maintaining the thinking behind the publication

Epistemic-status tags (Gwern) and digital-garden growth stages (Maggie Appleton's seedling → budding → evergreen) suggest an appetite for publishing thinking-in-progress with honest confidence labels. [Obsidian Publish](https://obsidian.md/publish) and [Quartz](https://quartz.jzhao.xyz/) already publish connected notes with graph exploration. Trellis's potential distinction is maintaining explicit claims, typed relationships, and revisions through the thinking process, then making that structure readable in public.

Structural status helps keep views consistent, but it does not eliminate neglect: a thought can remain `believed` after its author stopped tending it. Public thoughts should distinguish when they were edited, published, and last deliberately reviewed. An edit or a regenerated treatment must not silently refresh that last-reviewed date. Whether this makes a garden easier to maintain than an ordinary essay or connected notes is part of the experiment.

## Why atproto specifically

- **Identity and provenance map cleanly.** DIDs give persistent account identity, and Trellis's authorship and acceptance provenance can travel with published records. Signed repository data authenticates publication by the account; it does not prove a human performed Trellis's acceptance interaction. Another client can write equivalent records, so provenance remains an attributed claim about the workflow. The [repository model](https://atproto.com/specs/repository) provides the integrity boundary.
- **Data lives in the person's PDS.** "Your graph is in your repo; Trellis is one app that renders it" is a useful portability story. It is not a guarantee of permanence: hosting, backups, recovery, and readable exports still matter. Trellis also needs an operated web renderer and, when useful, an indexing service; a PDS does not itself provide the garden's reading experience.
- **Cross-repo links are the native pattern.** A cross-user relation is a record in *my* repo whose object is an at-uri in *yours* — structurally identical to a Bluesky like or follow. Federation does not need to be invented.
- **strongRefs identify the version a link engaged with.** An at-uri + CID can identify exact content, but it does not guarantee that old content remains retrievable. The [repository specification](https://atproto.com/specs/repository) does not require a retained commit-history chain. Trellis needs an explicit public revision model to show both the historical reference and the current position.
- **The firehose supplies a transport for subscriptions.** "Show me what the gardens I follow have published this week, and propose connections to my graph" can build on Jetstream and the existing Connect operation. Follow selection, catch-up, deduplication, relevance, and agent context budgets remain application work.

The author has built several atproto apps, so publishing records is a modest addition to this experiment. Start with atproto-backed publishing and a web renderer together. There is no need for a separate static-export-only stage; cross-garden interaction can still wait for evidence of reader and author value.

### The publication boundary

Records published in an atproto repository are public. Local remains the source of truth, with per-graph opt-in publishing of a selected public representation. The initial flow is **review a publication diff → publish a snapshot**. Ratifying a thought changes local state; publication is a separate deliberate action. Even a public garden needs room to work through a revision before releasing it. Automatic publishing could later be an explicit preference.

Isolated graphs help separate a sensitive journal from a public garden, but do not make every field inside the latter publishable. The [existing JSON export](../src/lib/server/store.ts) includes conversations, scratch notes, proposed operations, revision history, and all prose drafts. A public export needs an allowlist of intended thoughts, relations, selected public revisions, and approved treatments. Private discussions, rejected proposals, writing guidance, and unpublished history stay local unless separately selected for publication; a provenance reference must not accidentally expose them. Public links and prose references must resolve within the released material or to deliberately included external sources.

The release should identify a coherent set of record revisions so readers do not see a newly published essay paired with half-published source changes. The author needs to see what is live and whether a publication failed, with a retry path. This is one-way publishing from local state and does not require solving multi-device editing.

Retirement preserves a public change of view; withdrawal removes material the author no longer wants hosted. Both need a path. Deletion should propagate through Trellis's renderer and caches, while making clear that third-party copies cannot be recalled. See the protocol's [content-deletion expectations](https://atproto.com/specs/account).

## Lexicon sketch

The graph model provides the starting point, with publication and public history made explicit. Roughly:

- **thought** — stable identity, title, statement, type (claim / question / concept / example / prediction / evidence), status, source citations where applicable, creation and review dates, and authorship/acceptance provenance. Accepted means included in the workspace; status expresses stance.
- **public revision** — a selected version of a thought, linked to its stable identity and prior public revision, with an optional reviewed explanation of a meaningful change. The leading approach is to publish separate revision records and retain them until deliberately withdrawn, rather than depend on old repository commits remaining available. Local history is not automatically public history.
- **relation** — subject ref, object ref (possibly in another repo), relation type from the existing vocabulary, and provenance. `supersedes` retains its existing relation semantics; ordinary edits also need revision history.
- **graph / publication** — title, summary, pinned thoughts, publication date, and a release manifest identifying the selected revisions and front-door prose.
- **treatment** — a selected, publication-approved prose view with authorship, exact source revision refs, and generation/publication dates. Generated treatments remain visibly agent-authored derived views.

Predictions are a promising later use case: structured confidence, resolution criteria and dates, and retained public revisions could make a useful calibration trail. That requires honest handling of edits, withdrawals, and unresolved predictions; it should not expand the first publishing experiment into a prediction registry.

Open design questions:

- Do relations pin revisions or track the living thought? Leading answer: retain the stable thought identity and pin the engaged revision at creation, then render whether the current position differs. Missing or withdrawn targets need an explicit unavailable state.
- What happens when a thought is retired? Leading answer: publish a status change with its history and, where useful, a successor link. Withdrawal remains a separate operation, including decisions about retained revisions and dependent treatments.
- How are public revisions and release manifests represented in the lexicons? Choose a minimal schema for the first release that preserves coherent publication and deliberate withdrawal.
- An NSID domain is needed for the lexicon namespace.

## The front door

The canvas is the explorer, not the landing page. The leading front-door hypothesis is **prose backed by the graph**: an essay that reads naturally, where inline references open the underlying thoughts. The generated Overview machinery already exists, but whether authors want generated prose to represent their public voice needs testing. Human-written introductions should be possible too.

A reader's progression, each layer optional:

1. A readable essay.
2. They notice a claim is marked tentative.
3. They click through and see the supporting and contradicting structure.
4. They follow a link into someone else's garden.

Pinned thoughts complement this as direct entry points into the structure. Treatments are visibly agent-authored derived views and never the canonical artifact, but readers will still attribute a homepage to its owner. The author therefore selects and approves the particular treatment for publication. Accepting its source thoughts does not approve every connective claim or rhetorical choice the model adds.

Published treatments identify their exact source revisions. When newly published sources change, the existing treatment becomes visibly stale until the author approves a replacement; regeneration never silently replaces the public essay. Its references should let readers inspect the version it used and the current position.

### Make the evolution readable

The important reader question is **"What changed your mind?"** A wording diff or a `supersedes` link does not necessarily answer it. A meaningful revision can carry a short, optional author-reviewed explanation of the evidence or reasoning behind the change, with links to the relevant thoughts and sources.

A reader arriving through an old citation should see the historical claim and a clear route to the current position. A returning reader should be able to find meaningful changes without inspecting every revision. These are reading tasks to support in the first experiment; a canvas or a complete event log is not required to accomplish them.

## The hard part: links between gardens without recreating combat

`contradicts` across users is one UI decision away from being a quote-dunk. The anti-combat goal needs mechanism design, not just intent. Levers that look promising:

- **Softened rendering vocabulary.** The relation type stays `contradicts` in the data, while the public rendering can say **"in tension with."** This may direct attention toward ideas rather than people, but is a small lever whose effect needs testing. A label does not imply either party agrees with the relation. The same experiment may apply elsewhere (e.g. `supersedes` rendering as "rethought as").
- **Asymmetric visibility.** My relation to your thought lives in my repo. Whether it renders on *your* garden is your choice — accepting inbound links is a ratification-shaped act, consistent with the rest of the product. No notification-driven reply pressure.
- **Status gives disagreement context.** A tentative objection can communicate exploration, and visible reversals can make changing one's mind easier to understand. Neither guarantees humility or good faith; the effect on actual engagement is an experimental question.
- **No velocity mechanics.** No counts, no trending, no reply chains. An agent surfacing "a garden you follow connects to this" during your own thinking session is a fundamentally different rhythm than a mentions tab.
- **Agent-mediated reading.** Other gardens enter a person's world mainly as context for their own Connect and Challenge operations. External material is untrusted source content, even from a followed account with ratification metadata. It must not acquire instruction authority or tool permissions. Retrieval is disclosed, and proposed changes still require review; human acceptance alone is not a prompt-injection defense.
- **A deliberate return path.** Without notifications or a feed, useful engagement still needs a way back to the author. A connections review the author chooses to open could surface relevant published changes and inbound links, with bounded agent suggestions. Test whether it helps the next thinking session without becoming another inbox.

These mechanisms govern Trellis's surfaces. Another renderer can show declined inbound links, rank disagreements, or recirculate old material. The product promise is to support a slower, more considered interaction pattern in Trellis; better discourse across an open network remains a separate hypothesis.

## Sequencing

Start with atproto records and a readable garden in the same experiment. Network features still depend on evidence that individual gardens are useful:

1. **Atproto publishing + web reader.** Define minimal lexicons, publish a reviewed selection from one dogfood graph to the author's PDS, and render it as a browsable website. Include a reviewed essay, thought permalinks, visible status and sources, retained public revisions, and a readable account of a meaningful change. Include publication preview, release status/retry, and withdrawal. Keep the canvas optional and defer a general indexing service unless the reader requires it. This tests reader value and whether the author actually wants to keep publishing, while producing an artifact early testers can experience.
2. **Cross-garden links + agent subscription.** After the first experiment shows repeated author and reader value, test with a small set of willing garden authors. Add deliberate inbound visibility, followed-garden context, and the connections review. Evaluate interaction quality separately from publishing utility.

The aim is a small first build that produces a shareable artifact, followed by several publication cycles. Scope the build around publication review, revision behavior, and rendering; protocol familiarity keeps the atproto integration manageable, while repeated use supplies the product evidence.

### The first experiment

Use one topic and a handful of intended readers. Publish a reviewed essay with linked thoughts, statuses, sources, and at least one meaningful revision story. Compare it with an ordinary essay containing the same material. Ask readers to explain the author's current view, uncertainty, and reason for changing it; observe whether the structure helps them answer or adds work.

Repeat over several publication cycles. Record preparation time, editorial corrections, useful reader exchanges, reuse of published links, and whether public exposure changes what the author is willing to explore locally. Dogfooding establishes usefulness for this author; a second author publishing repeatedly would be stronger evidence of a broader product.

### Evidence for continuing

- Readers understand the current view, uncertainty, and reasons for change better than with the ordinary-essay comparison, or can inspect them with less effort.
- The author keeps publishing after the novelty fades, with acceptable preparation effort, and reuses the garden to explain their thinking.
- Readers return to meaningful changes or use thought links in useful exchanges; the evolution earns attention beyond novelty.
- A second person publishes and returns to maintain a garden of their own. Expressed interest is an early signal, not equivalent evidence.

Time spent in the graph and click-through rates are diagnostic, not success criteria. More navigation can mean confusion, and effective prose may make drilling down unnecessary. The structure can earn its keep by making inspection possible when needed.

### Evidence for stopping

- The published garden produces worse understanding or more work than an ordinary essay of the same material, without a compensating benefit from inspection or reuse.
- Publishing pressure distorts local thinking (objections left uncaptured, tentative status avoided), or preparing a release becomes enough work that the author stops.
- Readers mistake accepted objections for beliefs, generated prose for reviewed canonical claims, or old views for current ones despite the presentation.
- Cross-garden links, once available, are used mostly adversarially despite the mechanisms above. That argues against expanding the network features; it does not by itself invalidate useful individual publishing.

Mixed results should guide the next change. If authors keep publishing and readers benefit while graph exploration stays rare, keep improving the reading experience. If the boundary or presentation causes confusion, revise it and repeat the experiment before expanding the network.

## The two directions, side by side

| | Thinking and commitment system | Public digital garden |
|---|---|---|
| Direction of ambition | Inward: private life context | Outward: thinking commons |
| Trust posture | Deep privacy as prerequisite | Deliberate publicness |
| New thesis to prove | Connections between decisions and actions improve the next action | Readers and thinkers get value from published, evolving thought graphs |
| Depends on | Excellent everyday capture; beating incumbent task/notes tools | Rendering quality; eventually network effects |
| Cheapest probe | Weeks-long real project with capture, decisions, review | Publish one dogfood topic through atproto and a web reader; repeat over several releases |

The directions are compatible through isolated graphs and deliberate publication boundaries, but they pull product attention in different directions, and whichever gets the next experiment will shape what Trellis is. The tentative lean of this document is to test the garden next: it extends the useful thinking loop into a shareable demonstration, and the author's atproto experience makes direct record publishing practical. Its candidate distinction is a public account of current thinking, reasons, and change maintained through the thinking process. Reader understanding and repeated author use must establish whether that distinction matters. The commitment direction remains written up on its own terms while that experiment runs.
