<script lang="ts">
	import { renderDiscussionMarkdown } from '$lib/discussion-markdown';
	let { body }: { body: string } = $props();
	const rendered = $derived(renderDiscussionMarkdown(body));
</script>

<div class="discussion-markdown">{@html rendered}</div>

<style>
	.discussion-markdown { min-width: 0; margin-top: 6px; color: var(--ink-soft); font-size: var(--fs-13); line-height: 1.55; overflow-wrap: anywhere; }
	.discussion-markdown :global(p) { margin: 8px 0; }
	.discussion-markdown :global(h1), .discussion-markdown :global(h2), .discussion-markdown :global(h3), .discussion-markdown :global(h4), .discussion-markdown :global(h5), .discussion-markdown :global(h6) { margin: 16px 0 8px; color: var(--ink); font-size: var(--fs-13); font-weight: 600; line-height: 1.3; }
	.discussion-markdown :global(h1) { font-size: var(--fs-16); }
	.discussion-markdown :global(h2) { font-size: var(--fs-15); }
	.discussion-markdown :global(ul), .discussion-markdown :global(ol) { margin: 8px 0; padding-left: 24px; }
	.discussion-markdown :global(li) { margin: 4px 0; }
	.discussion-markdown :global(li > p) { margin: 4px 0; }
	.discussion-markdown :global(blockquote) { margin: 12px 0; padding-left: 12px; border-left: 1px solid var(--card-border); color: var(--ink-muted); }
	.discussion-markdown :global(code) { font-family: monospace; font-size: .9em; background: var(--inset-fill); border-radius: 3px; padding: 1px 4px; }
	.discussion-markdown :global(pre) { max-width: 100%; box-sizing: border-box; overflow-x: auto; margin: 12px 0; padding: 12px; border: 1px solid var(--hairline); border-radius: 6px; background: var(--inset-fill); }
	.discussion-markdown :global(pre code) { padding: 0; border-radius: 0; background: none; overflow-wrap: normal; white-space: pre; }
	.discussion-markdown :global(a) { color: var(--blue); text-underline-offset: 2px; }
	.discussion-markdown :global(a:focus-visible) { outline: 2px solid var(--blue); outline-offset: 2px; }
	.discussion-markdown :global(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; margin: 12px 0; font-size: var(--fs-12); }
	.discussion-markdown :global(th), .discussion-markdown :global(td) { padding: 6px 8px; border: 1px solid var(--hairline); text-align: left; }
	.discussion-markdown :global(th) { font-weight: 600; background: var(--inset-fill); }
	.discussion-markdown :global(hr) { margin: 16px 0; border: 0; border-top: 1px solid var(--hairline); }
	.discussion-markdown :global(img) { max-width: 100%; height: auto; }
	.discussion-markdown :global(> :first-child) { margin-top: 0; }
	.discussion-markdown :global(> :last-child) { margin-bottom: 0; }
</style>
