import {useEffect, useEffectEvent} from 'react';

type CallShortcutHandlers = {
	onToggleMic: () => void;
	onToggleCamera: () => void;
	onToggleChat: () => void;
};

// Macs (and iPads with a keyboard) use ⌘ where everything else uses Ctrl.
export function isApplePlatform() {
	if (typeof navigator === 'undefined') return false;
	const {userAgentData} = navigator as Navigator & {
		userAgentData?: {platform: string};
	};
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- the fallback where userAgentData is missing (Firefox, Safari)
	const platform = userAgentData?.platform ?? navigator.platform;
	return /mac|iphone|ipad/iv.test(platform);
}

// Tooltip text for a shortcut, e.g. "Ctrl+D", "⌘D" or "⌥⌘C".
export function shortcutLabel(key: string, {alt = false} = {}) {
	if (isApplePlatform()) return `${alt ? '⌥' : ''}⌘${key}`;
	return `Ctrl+${alt ? 'Alt+' : ''}${key}`;
}

function isTyping(target: EventTarget | undefined) {
	return (
		target instanceof HTMLElement &&
		(target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target.isContentEditable)
	);
}

// Google Meet's shortcuts: Ctrl/⌘+D (mic), Ctrl/⌘+E (camera) and
// Ctrl/⌘+Alt+C (chat). Ignored while typing, so they don't fire mid-message.
export function useCallShortcuts(
	enabled: boolean,
	handlers: CallShortcutHandlers,
) {
	const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
		const modifier = isApplePlatform() ? event.metaKey : event.ctrlKey;
		if (!modifier || event.shiftKey || isTyping(event.target ?? undefined))
			return;

		// Physical keys, since Alt changes event.key on macOS (⌥C types "ç").
		let action: (() => void) | undefined;
		if (!event.altKey && event.code === 'KeyD') action = handlers.onToggleMic;
		else if (!event.altKey && event.code === 'KeyE')
			action = handlers.onToggleCamera;
		else if (event.altKey && event.code === 'KeyC')
			action = handlers.onToggleChat;
		if (!action) return;

		// Ctrl+D (bookmark) and Ctrl+E (search) are browser shortcuts too.
		event.preventDefault();
		if (!event.repeat) action();
	});

	useEffect(() => {
		if (!enabled) return;
		globalThis.addEventListener('keydown', onKeyDown);
		return () => {
			globalThis.removeEventListener('keydown', onKeyDown);
		};
	}, [enabled]);
}
