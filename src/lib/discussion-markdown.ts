import MarkdownIt from 'markdown-it';

// Discussion text is untrusted. Keep raw HTML disabled and retain markdown-it's
// URL validation; only the parser's escaped output may reach Svelte's HTML sink.
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });

markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
	tokens[index].attrSet('target', '_blank');
	tokens[index].attrSet('rel', 'noopener noreferrer');
	return renderer.renderToken(tokens, index, options);
};

const renderImage = markdown.renderer.rules.image!;
markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
	tokens[index].attrSet('loading', 'lazy');
	tokens[index].attrSet('referrerpolicy', 'no-referrer');
	return renderImage(tokens, index, options, env, renderer);
};

export function renderDiscussionMarkdown(body: string): string {
	return markdown.render(body);
}
