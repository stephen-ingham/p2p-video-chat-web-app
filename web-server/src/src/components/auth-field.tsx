import React from 'react';
import {Eye, EyeOff} from 'lucide-react';
import {Input} from '@/components/ui/input.tsx';
import {cn} from '@/lib/utils.ts';

const inputClass =
	'h-12 px-3 text-base md:h-8 md:px-2.5 md:text-sm bg-surface-raised border-line-control text-ink placeholder:text-ink-muted focus-visible:ring-focus aria-invalid:border-danger dark:aria-invalid:border-danger';

type TextFieldProps = Omit<React.ComponentProps<'input'>, 'id'> & {
	label: string;
	id: string;
	error?: string;
	errorTestId?: string;
};

// A labelled input with its error message underneath, linked for screen
// readers.
export function TextField({
	label,
	id,
	error,
	errorTestId,
	className,
	children,
	...inputProps
}: TextFieldProps) {
	const errorId = `${id}-error`;
	return (
		<div className="space-y-1">
			<label htmlFor={id} className="text-sm font-medium text-ink-soft">
				{label}
			</label>
			<div className="relative">
				<Input
					aria-invalid={Boolean(error) || undefined}
					aria-describedby={error ? errorId : undefined}
					{...inputProps}
					id={id}
					className={cn(inputClass, className)}
				/>
				{children}
			</div>
			{error && (
				<p
					id={errorId}
					className="text-xs text-danger"
					data-testid={errorTestId}
				>
					{error}
				</p>
			)}
		</div>
	);
}

type PasswordFieldProps = Omit<TextFieldProps, 'type'> & {
	visible: boolean;
	onVisibleChange: (visible: boolean) => void;
	toggleTestId: string;
};

export function PasswordField({
	visible,
	onVisibleChange,
	toggleTestId,
	...props
}: PasswordFieldProps) {
	const Icon = visible ? EyeOff : Eye;
	return (
		<TextField
			{...props}
			type={visible ? 'text' : 'password'}
			className="pr-12 md:pr-8"
		>
			<button
				type="button"
				aria-label={visible ? 'Hide password' : 'Show password'}
				// Keeps focus (and the cursor) in the field when clicked.
				onMouseDown={(event) => {
					event.preventDefault();
				}}
				onClick={() => {
					onVisibleChange(!visible);
				}}
				className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-ink-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none md:w-8"
				data-testid={toggleTestId}
			>
				<Icon className="size-5 md:size-4" />
			</button>
		</TextField>
	);
}
