import {useSyncExternalStore} from 'react';

// Tailwind's lg breakpoint: the desktop layout (chat as a sidebar). Below it,
// tablets get the chat as an overlay.
const query = '(min-width: 1024px)';

function getMediaQueryList() {
	return typeof globalThis.matchMedia === 'function'
		? globalThis.matchMedia(query)
		: undefined;
}

function subscribe(onChange: () => void) {
	const mediaQueryList = getMediaQueryList();
	mediaQueryList?.addEventListener('change', onChange);
	return () => {
		mediaQueryList?.removeEventListener('change', onChange);
	};
}

// Desktop when matchMedia is unavailable (jsdom), as on the server.
function getSnapshot() {
	return getMediaQueryList()?.matches ?? true;
}

function getServerSnapshot() {
	return true;
}

export function useIsDesktop() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
