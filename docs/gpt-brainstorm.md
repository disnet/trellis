Yes. I think there is a fairly deep design break hiding here.

The mistake in most current "AI + notes" systems is that they assume the durable thing is still **the document**, and the agent is a feature that acts on documents. Chat systems make the opposite mistake: they assume the durable thing is **the conversation**, and everything the agent knows gets funneled through that conversation.

For a system designed around thinking with agents, I suspect neither should be primary.

The primary thing should be a **persistent graph of thought objects**, and both the human and the agent should manipulate that graph.

### The primitive shouldn't be the page

A page is an artifact inherited from paper. Even an Obsidian page is basically "a named bag of text."

Blocks get closer, but a block is still primarily a piece of text.

I'd want a primitive more like a **thought object**: something with stable identity whose current textual representation is only one property of it.

For example:

> **Agent-native PKB**
> 
> Current claim: The fundamental artifact should be a graph of persistent thought objects rather than documents or conversations.
> 
> Status: developing
> 
> Related: [[semantic zoom]], [[agent attention]], [[conversation as transient UI]]
> 
> Questions: How granular should objects be? Who decides when to split one?
> 
> Evidence: …
> 
> History: evolved from "pages aren't enough"

The important thing is that this isn't necessarily displayed as all that text. Most of the time you might just see:

**Agent-native PKB**  
_Persistent thought objects, not documents or conversations._

And expand it when needed.

The object has identity independent of the wording. I can rewrite it ten times without breaking references to it.

That feels significantly different from a Markdown block.

* * *

## Then the agent becomes an operator on thought

Instead of the interaction being:

**human → prompt → AI → response**

it becomes something more like:

**human + agent → operations on shared objects**

The basic vocabulary of agent behavior becomes things like:

- create a thought
- connect two thoughts
- split this thought
- merge these three
- challenge this claim
- find evidence for this
- identify contradictions
- compress this cluster
- expand this idea
- turn this question into an investigation
- promote this observation into a durable concept
- show me what changed in my thinking
- show me neglected questions related to what I'm working on

Those operations seem much closer to _thinking together_ than "send another message."

And crucially, the result of the operation is usually **not another paragraph for you to read**. It is a mutation to the shared knowledge structure.

The agent might say:

> Found 7 related notes. Proposed 3 connections and one merge.

You inspect the changes rather than reading a 1,500-word explanation.

* * *

# The central UI might be a working set, not a chat

Imagine opening the system and seeing something closer to a table covered in index cards than a text editor.

But unlike a canvas like Miro, the position isn't necessarily the knowledge structure. You're looking at a temporary **working set**.

Maybe you're currently thinking about:
    
    
                      ┌────────────────────────┐
                      │ Agent-native PKB       │
                      │                        │
                      │ persistent thought     │
                      │ objects                │
                      └───────────┬────────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               │                  │                  │
               ▼                  ▼                  ▼
     ┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐
     │ Semantic zoom   │ │ Agent attention  │ │ Nonlinear work   │
     │                 │ │                  │ │                  │
     │ information     │ │ what should the  │ │ threads rather   │
     │ density changes │ │ agent consider?  │ │ than sessions    │
     └─────────────────┘ └──────────────────┘ └──────────────────┘
               │
               ▼
     ┌─────────────────┐
     │ OPEN QUESTION   │
     │                 │
     │ Who controls    │
     │ summarization?  │
     └─────────────────┘

You can pull something into the working set because you want to think about it.

The agent can pull something in too:

> "This older idea seems directly relevant."

And it appears off to the side, perhaps visually marked as an agent suggestion.

No interruption. No giant message.

You can accept it, dismiss it, connect it, or ask why it was surfaced.

That last bit is important: **the agent's output can be spatial/structural rather than linguistic.**

* * *

# Semantic zoom seems especially important

This is probably one of the strongest answers to your "don't drown me in text" requirement.

Every thought should have multiple resolutions.

At one zoom level:

**Agents should manipulate a persistent thought graph.**

Zoom in:

> Documents and chat histories are poor substrates for long-running human/agent cognition. Persistent concepts should instead have stable identity and relationships.

Zoom further:

You see arguments, objections, evidence, sources, previous formulations, agent activity, etc.

Zoom out:
    
    
    Agent-native knowledge systems
        ├── persistent concepts
        ├── working sets
        ├── agent attention
        └── semantic zoom

The agent could actively maintain these representations.

Humans are actually pretty good at navigating enormous bodies of information when they can continuously change abstraction level. File browsers, maps and IDEs all exploit this.

Chat has basically one zoom level: **everything that happened, in chronological order.**

That's almost maximally wrong for thought.

* * *

# And this changes what "memory" means

Today's agent memory is usually framed as:

> What facts about the user should the model remember?

But for a thinking system, memory is closer to:

> **What intellectual structures have we constructed together?**

The agent doesn't just remember that you "like X."

It knows that six months ago you developed:

**[[Agent attention model]]**

which depends on:

**[[Working sets]]** and **[[Explicit context boundaries]]**

and conflicts somewhat with:

**[[Ambient agent model]]**.

When you return six months later and start thinking about agent interfaces again, it doesn't tell you:

> "We discussed something similar previously…"

It simply surfaces those three objects into the edge of your workspace.

That's a much more powerful kind of memory because **the human can see the memory too**.

This is one of my biggest problems with current AI memory systems: they tend to make the agent's context richer while leaving the human's context impoverished.

A shared thinking system should do the opposite. **Agent memory should produce human-visible structure.**

* * *

# Conversation could become disposable

There would still be conversations. Sometimes language is exactly what you want.

But imagine a conversation appearing temporarily attached to an object:

**[[What should the knowledge primitive be?]]**

You and the agent discuss it for fifteen minutes.

At the end, the conversation collapses.

What remains might be:
    
    
    What should the knowledge primitive be?
    
        Current conclusion
        → Persistent typed object with stable identity
    
        New concepts
        → semantic zoom
        → representation vs identity
    
        Open questions
        → object granularity
        → automatic splitting
    
        Rejected direction
        → Markdown blocks as primitive

The transcript is still available as provenance, but **you never need to read it again**.

This is almost the inverse of ChatGPT today, where the transcript is the product and any lasting conceptual structure has to be extracted manually.

I'd make **chat an ephemeral editing surface over the knowledge base**.

* * *

# Threads should exist independently of conversations

This also solves the nonlinear thinking problem.

Suppose we're discussing agent-native PKBs and halfway through I say:

> Wait, this reminds me of how Git branches work.

Today we have three bad choices:

1. derail the current conversation;
2. start another chat and lose context;
3. mentally remember to come back to it.

Instead, the system could literally create a branch:
    
    
    Agent-native PKB
       │
       ├── Main thread
       │      agent attention
       │      semantic zoom
       │
       └── Side thread
              git as model for thought

You jump into the side thread for ten minutes.

The agent has inherited the relevant context, but not necessarily everything.

When you're done, you might promote one insight back into the main graph.

This resembles branching in software development more than branching in chat.

And I suspect **branch / merge** are extraordinarily useful cognitive primitives that PKBs haven't really embraced.
* * *

# One especially important primitive: explicit attention

There are actually two graphs here.

There is your huge durable knowledge graph:
    
    
    everything you've ever thought about

and a much smaller graph:
    
    
    what we're thinking about right now

Call the second one the **attention graph** or **working set**.

That distinction gives the agent a sane context model.

Instead of shoving 100,000 notes through retrieval and hoping semantic search finds the right ones, the system knows:

> We're currently working on A, B and C.  
D and E are explicitly background context.  
F is a side question.  
Ignore everything else unless it becomes relevant.

And both you and the agent can manipulate that attention.

You drag something into the working set.

The agent proposes adding something.

You say "don't consider implementation yet."

A whole subtree fades out.

So **context itself becomes a manipulable UI object** rather than hidden prompt engineering.

That strikes me as one of the biggest unexplored areas.

* * *

# The agent should mostly propose changes rather than emit answers

This may be the other major departure.

Imagine selecting this:

**[[Pages are the wrong knowledge primitive]]**

and invoking an agent.

Instead of a chat box, perhaps you get actions like:

**Develop · Challenge · Connect · Research · Decompose · Reframe**

You choose _Challenge_.

A moment later:
    
    
    Pages are the wrong knowledge primitive
              ↓
            CHALLENGED
    
    Agent found 3 objections
    
    + Pages provide useful cognitive boundaries
    + Stable URLs are valuable
    + Arbitrary granularity creates management overhead

Those appear as little neighboring objects.

You can:

**keep · delete · develop · connect**

You are manipulating a model of the argument, rather than reading an essay about it.

Language becomes something the system produces **inside the structure**, not the structure itself.

* * *

# Provenance becomes much more important once agents are involved

If agents are constantly modifying your knowledge base, you need to know:

**Who thinks this?**

A thought might have provenance like:
    
    
    Authorship
    Human
    
    Agent contribution
    Reworded for clarity
    
    Sources
    3
    
    Confidence
    developing
    
    History
    12 revisions

Or perhaps something is clearly marked:

◇ **Agent hypothesis**

until you adopt it.

There should probably be an explicit transition from:

**agent suggestion → accepted thought**

rather than quietly allowing machine-generated material to become indistinguishable from your own thinking.

That boundary feels philosophically important for a PKB.

* * *

# Views become projections, not containers

Obsidian effectively says:

> This thing _is a Markdown document._

An agent-native system might say:

> This thing is a collection of semantic objects. Here is one useful representation.

The same set of objects could be rendered as:

**outline**
    
    
    Agent-native PKBs
      Persistent objects
      Agent operations
      Attention
        working sets
        retrieval

**argument map**
    
    
                   Pages are inadequate
                    /              \
               because            but
                 /                  \
     chronological text       boundaries useful

**board**
    
    
    Questions        Developing       Solid
    ------------------------------------------------
    Granularity      Working sets     Semantic zoom
    Permissions      Branching

**document**

> An agent-native PKB should treat concepts rather than documents as its fundamental primitive…

None of these is canonical.

That means you get something Notion and Obsidian struggle with: **structure doesn't have to be encoded into presentation**.

The agent can also generate temporary views:

> "Show me the unresolved disagreements in this area."

And suddenly you have a board consisting only of contested ideas.

Close it and nothing is lost because the underlying objects remain.

* * *

# I think this leads to a very different product metaphor

Not:

**AI notebook**

and not:

**AI chatbot with memory**

and probably not even:

**AI knowledge graph.**

More like a **shared cognitive workspace**.

You and the agents jointly manipulate a persistent world of concepts.

Documents, conversations, canvases, outlines, searches and dashboards become temporary lenses over that world.

If I were boiling the architecture down, I'd probably start with roughly six primitives:

**Thought** -- a durable unit with stable identity.  
**Relation** -- typed connections between thoughts.  
**Thread** -- a branch of inquiry with history and unresolved state.  
**Working set** -- what human + agent are attending to right now.  
**View** -- a temporary representation of some subset of the graph.  
**Operation** -- something a human or agent does to the graph.

And then one meta-property running through everything:

**Provenance** -- where every object and change came from.

That feels to me like a much more promising ground floor than "let's make Obsidian and add a chatbot sidebar."

There's also an interesting next question hiding underneath this: **what exactly should a "thought object" contain, and what should cause one thought to become two?** I think solving that well is probably the equivalent of figuring out what the "file" was for early computing--it determines almost everything above it.
