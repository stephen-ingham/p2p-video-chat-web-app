import React, {useEffect, useId, useRef} from 'react';
import ChatPanel from '@/components/chat-panel.tsx';

type ChatSheetProps = {
	messages: string[];
	participants: string[];
	onSend: (message: string) => void;
	onClose: () => void;
};

export default function ChatSheet({
	messages,
	participants,
	onSend,
	onClose,
}: ChatSheetProps) {
	const titleId = useId();
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	const sheetRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const opener =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: undefined;
		sheetRef.current?.focus();
		return () => {
			opener?.focus();
		};
	}, []);

	function keepFocusInSheet(event: React.KeyboardEvent) {
		const focusable = [
			...(sheetRef.current?.querySelectorAll<HTMLElement>(
				'button:not(:disabled), input:not(:disabled)',
			) ?? []),
		];
		const first = focusable.at(0);
		const last = focusable.at(-1);
		if (!first || !last) return;
		const active = document.activeElement;
		if (event.shiftKey && (active === first || active === sheetRef.current)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}

	return (
		<div
			className="fixed inset-0 z-10 flex flex-col justify-end"
			onKeyDown={(event) => {
				if (event.key === 'Escape') onClose();
				if (event.key === 'Tab') keepFocusInSheet(event);
			}}
		>
			<button
				type="button"
				aria-label="Close chat"
				tabIndex={-1}
				className="flex-1 bg-scrim motion-safe:animate-in motion-safe:fade-in"
				onClick={onClose}
			/>
			<div
				ref={sheetRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className="flex max-h-[75dvh] flex-col outline-none motion-safe:animate-in motion-safe:slide-in-from-bottom"
				data-testid="chat-sheet"
			>
				<ChatPanel
					variant="sheet"
					titleId={titleId}
					messages={messages}
					participants={participants}
					onSend={onSend}
					onClose={onClose}
				/>
			</div>
		</div>
	);
}
