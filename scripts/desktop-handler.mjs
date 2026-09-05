// adapter-node reads ORIGIN during module initialization and otherwise assumes
// HTTPS. Load it only after the OS assigns our loopback HTTP server its port.
export async function loadDesktopHandler(origin) {
  process.env.ORIGIN = origin;
  return (await import('./build/handler.js')).handler;
}
