import {renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {shortcutLabel, useCallShortcuts} from '@/lib/use-call-shortcuts.ts';

function setup(enabled = true) {
	const handlers = {
		onToggleMic: vi.fn(),
		onToggleCamera: vi.fn(),
		onToggleChat: vi.fn(),
	};
	const hook = renderHook(
		(props: {enabled: boolean}) => {
			useCallShortcuts(props.enabled, handlers);
		},
		{initialProps: {enabled}},
	);
	return {handlers, ...hook};
}

function press(
	code: string,
	init: KeyboardEventInit = {},
	target: EventTarget = document.body,
) {
	const event = new KeyboardEvent('keydown', {
		code,
		ctrlKey: true,
		bubbles: true,
		cancelable: true,
		...init,
	});
	target.dispatchEvent(event);
	return event;
}

function stubPlatform(platform: string) {
	vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('useCallShortcuts', () => {
	it('toggles the mic, camera and chat, and blocks the browser shortcut', () => {
		const {handlers} = setup();

		const micEvent = press('KeyD');
		press('KeyE');
		press('KeyC', {altKey: true});

		expect(handlers.onToggleMic).toHaveBeenCalledTimes(1);
		expect(handlers.onToggleCamera).toHaveBeenCalledTimes(1);
		expect(handlers.onToggleChat).toHaveBeenCalledTimes(1);
		expect(micEvent.defaultPrevented).toBe(true);
	});

	it('ignores keys without the modifier, with Shift, or the wrong Alt', () => {
		const {handlers} = setup();

		const plain = press('KeyD', {ctrlKey: false});
		press('KeyD', {shiftKey: true});
		press('KeyD', {altKey: true});
		press('KeyC');

		expect(handlers.onToggleMic).not.toHaveBeenCalled();
		expect(handlers.onToggleChat).not.toHaveBeenCalled();
		expect(plain.defaultPrevented).toBe(false);
	});

	it('ignores held-down repeats but still blocks them', () => {
		const {handlers} = setup();

		const event = press('KeyD', {repeat: true});

		expect(handlers.onToggleMic).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(true);
	});

	it('ignores shortcuts while typing', () => {
		const {handlers} = setup();
		const input = document.createElement('input');
		const textarea = document.createElement('textarea');
		document.body.append(input, textarea);

		const event = press('KeyD', {}, input);
		press('KeyE', {}, textarea);

		expect(handlers.onToggleMic).not.toHaveBeenCalled();
		expect(handlers.onToggleCamera).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
		input.remove();
		textarea.remove();
	});

	it('does nothing until enabled, and stops when disabled', () => {
		const {handlers, rerender} = setup(false);

		press('KeyD');
		rerender({enabled: true});
		press('KeyD');
		rerender({enabled: false});
		press('KeyD');

		expect(handlers.onToggleMic).toHaveBeenCalledTimes(1);
	});

	it('uses ⌘ instead of Ctrl on macOS', () => {
		stubPlatform('MacIntel');
		const {handlers} = setup();

		press('KeyD');
		press('KeyD', {ctrlKey: false, metaKey: true});

		expect(handlers.onToggleMic).toHaveBeenCalledTimes(1);
	});
});

describe('shortcutLabel', () => {
	it('uses Ctrl outside macOS', () => {
		stubPlatform('Win32');

		expect(shortcutLabel('D')).toBe('Ctrl+D');
		expect(shortcutLabel('C', {alt: true})).toBe('Ctrl+Alt+C');
	});

	it('uses ⌘ and ⌥ on macOS', () => {
		stubPlatform('MacIntel');

		expect(shortcutLabel('D')).toBe('⌘D');
		expect(shortcutLabel('C', {alt: true})).toBe('⌥⌘C');
	});
});
