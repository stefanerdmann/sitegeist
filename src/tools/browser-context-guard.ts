const ALLOWED_PROTOCOLS = ["http:", "https:", "file:"];
const PROTECTED_CONTEXT_MESSAGE =
	"Browser and extension pages are protected. Agent tools cannot operate Sitegeist's permission or file-save dialogs.";

export function assertAutomatableTabUrl(url: string | undefined): void {
	let protocol: string | undefined;
	try {
		protocol = url ? new URL(url).protocol : undefined;
	} catch {
		// Invalid or unavailable URLs do not establish a safe page context.
	}
	if (!protocol || !ALLOWED_PROTOCOLS.includes(protocol)) throw new Error(PROTECTED_CONTEXT_MESSAGE);
}

/** Check the actual execution context too, not just the URL observed before debugger attachment. */
export function guardBrowserExpression(code: string): string {
	return `if (!${JSON.stringify(ALLOWED_PROTOCOLS)}.includes(location.protocol)) { throw new Error(${JSON.stringify(PROTECTED_CONTEXT_MESSAGE)}); }\n${code}`;
}
