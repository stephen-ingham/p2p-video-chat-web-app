import React from 'react';
import type {LucideIcon} from 'lucide-react';

// A small in-house toast (Figma "Solo, chat closed": "Call ID copied").
// The live region is always rendered so screen readers announce changes;
// the visible chip only appears while there's a message. The caller
// positions it.
export default function Toast({
	message,
	icon: Icon,
	className,
}: {
	message: string | undefined;
	icon?: LucideIcon;
	className?: string;
}) {
	return (
		<div role="status" aria-live="polite" className={className}>
			{message && (
				<div
					className="flex items-center gap-2 rounded-[10px] bg-surface-raised px-3 py-2 text-sm text-ink shadow-md"
					data-testid="toast"
				>
					{Icon && <Icon aria-hidden className="size-3.5" />}
					{message}
				</div>
			)}
		</div>
	);
}
