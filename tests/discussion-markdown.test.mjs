import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { renderDiscussionMarkdown: renderMarkdown } = await server.ssrLoadModule('/src/lib/discussion-markdown.ts');

test('discussion markdown renders common agent formatting, nested lists, tables, and code', () => {
	const html = renderMarkdown('# A heading\n\n**Strong** and *emphasis*, ~~removed~~, `inline`.\nNext line.\n\n- First\n  - Nested\n\n1. Ordered\n2. Second\n\n> A quote\n\n```js\nconst value = "<unsafe>";\n```\n\n| Claim | Status |\n| --- | --- |\n| Test | Tentative |');
	for (const expected of ['<h1>A heading</h1>', '<strong>Strong</strong>', '<em>emphasis</em>', '<s>removed</s>', '<code>inline</code>', '<br>', '<ul>', '<ol>', '<blockquote>', '<table>', '<th>Claim</th>', '<td>Tentative</td>', '<pre><code class="language-js">']) assert(html.includes(expected), expected);
	assert.match(html, /<li>First\s*<ul>/);
	assert(html.includes('&lt;unsafe&gt;'));
});

test('links open separately and attributes are escaped', () => {
	const html = renderMarkdown('[Read this](https://example.com "A title") and https://example.org\n\n![A picture](https://example.com/picture.png)');
	assert.match(html, /href="https:\/\/example.com"/);
	assert.match(html, /target="_blank" rel="noopener noreferrer"/);
	assert.match(html, /href="https:\/\/example.org"/);
	assert.match(html, /loading="lazy" referrerpolicy="no-referrer"/);
	const escaped = renderMarkdown('[Link](https://example.com "&quot; onmouseover=&quot;alert(1)")');
	assert(!escaped.includes('title="" onmouseover="'));
	assert(escaped.includes('&quot;'));
});

test('raw HTML and executable URLs cannot become active markup', () => {
	const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://example.com"></iframe>\n\n[x](javascript:alert(1))\n\n[x](jav&#x61;script:alert(1))\n\n[x](vbscript:alert(1))\n\n[x](data:text/html;base64,PHNjcmlwdD4=)\n\n![x](javascript:alert(1))');
	assert(!/<(?:script|iframe|img)\b/.test(html));
	assert(!/(?:href|src)="(?:javascript|vbscript|data):/i.test(html));
	assert(html.includes('&lt;script&gt;'));
	assert(html.includes('&lt;img'));
	assert.equal(renderMarkdown(''), '');
});

test('the shared Svelte component renders markdown safely', async () => {
	const { render } = await server.ssrLoadModule('svelte/server');
	const { default: Markdown } = await server.ssrLoadModule('/src/lib/components/DiscussionMarkdown.svelte');
	const { body } = render(Markdown, { props: { body: '**A clarification**\n\n<script>bad()</script>' } });
	assert(body.includes('<strong>A clarification</strong>'));
	assert(body.includes('&lt;script&gt;bad()&lt;/script&gt;'));
	assert(!body.includes('<script>'));
});
