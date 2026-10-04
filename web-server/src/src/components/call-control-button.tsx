import React from 'react';
import type {LucideIcon} from 'lucide-react';
import {cn} from '@/lib/utils.ts';

// Extra button props (and ref) are forwarded, so it can be a tooltip trigger.
export default function CallControlButton({
	icon: Icon,
	label,
	danger = false,
	active = false,
	checked,
	badge,
	testId,
	className,
	...props
}: {
	icon: LucideIcon;
	label: string;
	danger?: boolean;
	// Highlighted while its panel is open (e.g. chat).
	active?: boolean;
	checked?: boolean;
	badge?: number;
	testId?: string;
} & Omit<React.ComponentProps<'button'>, 'children'>) {
	return (
		<button
			type="button"
			{...props}
			role={checked === undefined ? undefined : 'switch'}
			aria-checked={checked}
			aria-label={label}
			className={cn(
				'relative size-14 shrink-0 rounded-full flex items-center justify-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-focus disabled:opacity-50 disabled:pointer-events-none',
				danger
					? 'bg-danger text-on-action active:opacity-85'
					: 'bg-surface-active text-ink hover:bg-surface-active-hover active:bg-surface-active-hover',
				active && !danger && 'bg-surface-active-hover',
				className,
			)}
			data-testid={testId}
		>
			<Icon aria-hidden className="size-6" />
			{badge ? (
				<span
					aria-hidden
					className="absolute top-0 right-0 min-w-5 h-5 px-1 rounded-full bg-action text-on-action text-[11px] leading-5 text-center"
					data-testid={testId ? `${testId}-badge` : undefined}
				>
					{badge > 9 ? '9+' : badge}
				</span>
			) : undefined}
		</button>
	);
}
