# Garden publishing (phase 1 of the public-garden direction)

The first build of [the public digital garden](public-garden-direction.md):
atproto publishing plus a public web renderer. Local state stays the source of
truth; publishing is a deliberate act on a reviewed diff.

## How it works

**Publish flow.** The graph menu's *Publish garden…* opens `/publish`:

1. **Account** — sign in with OAuth: enter a handle, authorize on your own
   PDS, and get redirected back. Trellis is an atproto *loopback client*
   (`client_id` of the `http://localhost?…` form), so no hosted client
   metadata is needed; `@atproto/oauth-client-node` handles PAR, PKCE, DPoP,
   and token refresh, with tokens in `data/oauth.json` (mode 0600, override
   with `TRELLIS_OAUTH_STORE`). The scope is granular — `atproto` plus one
   `repo:<nsid>` per published collection, which grants create/update/delete
   on that collection alone. The old `transitional:generic` blanket scope is
   refused by servers on the granular permission model (`Missing required
   scope "repo:<nsid>?action=create"`). Because the scope is part of the
   client_id, adding a collection invalidates stored sign-ins: the account
   has to be reconnected.
   The client_id embeds the app's port, so the sign-in origin is stored and
   reused for refresh; running on a new port just means signing in again.
   Because the redirect targets `127.0.0.1`, OAuth works only for the local
   app — and the loopback flow is untested in the desktop webview. The dev
   server is bound to `127.0.0.1` in `vite.config.ts` for this reason: Vite's
   default `localhost` binds IPv6 `[::1]` only, so the redirect back to the
   IPv4 literal would hit a closed port. Browse the app at
   `http://127.0.0.1:5173`, not `localhost`.

   The fallback for a PDS without OAuth is an app password, verified with
   `com.atproto.server.createSession`. Either way the resolved DID is stored
   so previews can build at-uris; credentials live in `data/publish.json`
   (mode 0600, override with `TRELLIS_PUBLISH_SETTINGS`), never in the graph
   database and never sent back to the client unredacted.
   `TRELLIS_ATPROTO_SERVICE`, `TRELLIS_ATPROTO_IDENTIFIER`, and
   `TRELLIS_ATPROTO_APP_PASSWORD` override the file and force the password
   path.
2. **The release** — a garden title, its address, an optional hand-written
   introduction, and optionally one approved essay draft as the front door.
   The selection is the whole graph: every thought and every relation between
   them. Groups organize local work and are what essays are written from;
   they never carve up what goes public, because a partial graph publishes
   edges pointing at thoughts readers cannot see.

   Each graph publishes its own garden, and they live side by side in one
   repository: the address (a lowercase slug — `self` for the first garden)
   is both the garden record's rkey and the last segment of its public URL,
   stored per graph so it stays stable when the title changes. Two graphs may
   not share an address, and because thought, revision, and relation rkeys are
   local ids shared across one repo, a release that would overwrite another
   garden's record is refused at preview rather than silently clobbering it.
   Changing a published garden's address republishes it at the new one and
   withdraws the old record, so existing links stop working.
3. **Review** — the exact diff against what is live: thoughts going public,
   thoughts getting a public revision (each with an optional author-written
   change note that publishes with the revision), records coming down, and
   the raw record JSON for inspection.
4. **Publish** — records are written one at a time with per-record results.
   The garden record (front door + release manifest) is always written last,
   so an interrupted release leaves the old manifest intact; deletions wait
   for the new manifest. Publishing again retries only what is missing.

**Withdrawal.** *Withdraw the whole garden* deletes the garden record first,
then every other record. Third-party copies cannot be recalled.

**The renderer.** `/garden/<handle-or-did>` server-renders by resolving the
identity (appview `resolveHandle`, then the PLC directory or did:web
document) and reading records from the owner's PDS with the public
`com.atproto.repo.*` endpoints — no index service, no client JavaScript. That
page lists every garden published under the identity; each garden reads at
`/garden/<handle-or-did>/<address>`, with the front door (essay with inline
thought links, pinned thoughts, recent changes, the full index), thought
permalinks under `…/<address>/thought/<rkey>` (statement, source, provenance,
connections, public revision history), and `…/<address>/changes`. A garden
record whose rkey could not be a URL segment is skipped by the list.
`TRELLIS_PLC_URL` and `TRELLIS_APPVIEW_URL` point identity resolution at a
dev directory for testing.

**Deploying the renderer.** The workspace has no auth, so a public deployment
must set `TRELLIS_RENDERER_ONLY=1`: everything except `/garden` and the built
assets returns 404. The renderer fetches hosts derived from the request (a
did:web domain, the handle well-known fallback, the PDS endpoint in the DID
document), so every outbound host is DNS-resolved and refused if it lands in
loopback, private, link-local, or carrier-NAT space, and plain http is
refused. `TRELLIS_GARDEN_ALLOW_PRIVATE=1` disables that guard for local
development against a dev PDS (never set it on a public deployment).

## The records

Lexicon documents live in [`lexicons/`](../lexicons); the namespace constant
(`com.disnetdev.trellis`, one place to change) and the shared TypeScript
shapes in [`src/lib/garden/lexicon.ts`](../src/lib/garden/lexicon.ts).

- **thought** — current public state; rkey = the local thought id, so
  identity and prose references survive releases.
- **revision** — a selected public version, immutable once published and
  retained until withdrawn, with `prev` links, authorship (who wrote the
  words; ratification precedes publication), and the optional change note.
  Local history is not public history: each release publishes at most the
  current state.
- **relation** — every relation in the graph, pinning the revisions engaged
  at first publish. Data keeps the precise type; rendering softens it
  ("contradicts" → "in tension with", "supersedes" → "rethought as").
- **treatment** — the approved essay, visibly agent-authored, pinned to exact
  source revisions. Writing guidance never publishes. A published essay whose
  sources move on renders as stale until a newer draft is approved; a
  *new* draft that no longer matches the thoughts it was written from is
  refused at preview.
- **garden** (rkey = the garden's address) — title, introduction, pins, the
  essay, and the release manifest. One per published graph, so a repository
  can hold several. Renderers show manifest members only.

Confidence values publish as decimal strings — the atproto data model has no
float type.

## The publication boundary

A release carries the graph's thoughts, their selected revisions, its
relations, one treatment, and the garden record. Conversations, scratch and canvas notes,
proposed operations, writing guidance, rejected proposals, and unpublished
revision history have no code path into a record; `tests/publish-release.test.mjs`
pins the exact allowed field set per record type.

Publishing state lives in the `published_records` table (the record JSON last
written per graph and rkey) plus per-graph `meta` keys for the release
configuration and last outcome. A release diffs and withdraws only the records
of the graph it was built from, which is what lets several gardens share a
repository. The diff is computed locally against that table — content
hashes ignore publish timestamps so retries converge.
