import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// atproto OAuth redirects back to the IP literal (http://127.0.0.1:PORT/…),
	// which the spec requires for loopback clients. Vite's default `localhost`
	// binds IPv6 [::1] only, so that redirect would hit a closed port; bind the
	// IPv4 loopback so the app and the callback share one origin.
	server: { host: '127.0.0.1' },
	preview: { host: '127.0.0.1' },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		})
	]
});
