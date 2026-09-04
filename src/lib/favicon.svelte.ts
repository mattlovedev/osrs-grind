// Cross-module reactive override for the site favicon (default set in
// +layout.svelte). Board pages set .href to the first entity's icon once
// the board has content, and clear it back to null on unmount so
// navigating elsewhere doesn't leave a stale board favicon behind.
export const favicon = $state({ href: null as string | null });
