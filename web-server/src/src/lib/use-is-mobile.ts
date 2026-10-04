import {useSyncExternalStore} from 'react';

const query = '(max-width: 767.98px)';

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

function getSnapshot() {
	return getMediaQueryList()?.matches ?? false;
}

// The server renders the desktop layout; React re-renders after hydration
// if the viewport is narrower, without a hydration mismatch.
function getServerSnapshot() {
	return false;
}

export function useIsMobile() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
