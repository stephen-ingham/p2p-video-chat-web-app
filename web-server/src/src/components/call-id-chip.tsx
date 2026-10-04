import React from 'react';
import {Check, Copy} from 'lucide-react';
import Toast from '@/components/toast.tsx';
import {useCopyToClipboard} from '@/lib/use-copy-to-clipboard.ts';

// Figma "Call ID chip": caption, the ID in mono and a copy button. The
// toast sits under the header's right edge, so the header must be
// `relative`.
export default function CallIdChip({callId}: {callId: string}) {
	const {status, copy} = useCopyToClipboard();

	return (
		<>
			<div className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-line-control bg-surface pr-1.5 pl-3.5">
				<span className="shrink-0 text-xs text-ink-muted">Call ID</span>
				<span
					className="min-w-0 truncate font-mono text-xs text-ink-soft"
					data-testid="call-id"
				>
					{callId}
				</span>
				<button
					type="button"
					aria-label="Copy call ID"
					className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink outline-none hover:bg-surface-active focus-visible:ring-3 focus-visible:ring-focus"
					data-testid="copy-call-id"
					onClick={() => {
						void copy(callId);
					}}
				>
					{status === 'copied' ? (
						<Check aria-hidden className="size-3.5" />
					) : (
						<Copy aria-hidden className="size-3.5" />
					)}
				</button>
			</div>
			<Toast
				className="pointer-events-none absolute top-full right-6 z-40 mt-4"
				icon={status === 'copied' ? Copy : undefined}
				message={
					status === 'copied'
						? 'Call ID copied'
						: status === 'failed'
							? "Couldn't copy. Select the ID instead."
							: undefined
				}
			/>
		</>
	);
}
