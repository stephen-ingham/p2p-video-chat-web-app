import React, {useId} from 'react';
import {Video} from 'lucide-react';
import {Button} from '@/components/ui/button.tsx';
import {Input} from '@/components/ui/input.tsx';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card.tsx';

type MobileCallSetupProps = {
	joinInput: string;
	joinInputError: string;
	isJoinInputValid: boolean;
	loading: 'create' | 'join' | undefined;
	error: string;
	onJoinInputChange: (value: string) => void;
	onCreate: () => void;
	onJoin: () => void;
};

const cardClass = 'bg-surface border-line ring-0 border';
const titleClass = 'text-ink text-lg font-semibold';

// Create or join a call below the md breakpoint, matching the mobile app's
// CallScreen (mobile-app/src/screens/call-screen.tsx): the desktop's one-row
// controls bar becomes two stacked, full-width cards, for thumbs.
export default function MobileCallSetup({
	joinInput,
	joinInputError,
	isJoinInputValid,
	loading,
	error,
	onJoinInputChange,
	onCreate,
	onJoin,
}: MobileCallSetupProps) {
	const joinInputId = useId();

	return (
		<main className="flex flex-col gap-4 p-4">
			<Card className={cardClass}>
				<CardHeader>
					<CardTitle className={titleClass}>Start a call</CardTitle>
					<CardDescription className="text-ink-muted">
						Create a call, then share its ID with the people you want to talk
						to.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						onClick={onCreate}
						disabled={loading !== undefined}
						className="h-12 w-full gap-2 bg-action text-base text-on-action hover:bg-action-hover [&_svg:not([class*='size-'])]:size-5"
						data-testid="create-call-button"
					>
						<Video aria-hidden />
						{loading === 'create' ? 'Creating…' : 'Create call'}
					</Button>
				</CardContent>
			</Card>

			<Card className={cardClass}>
				<CardHeader>
					<CardTitle className={titleClass}>Join a call</CardTitle>
					<CardDescription className="text-ink-muted">
						Paste the call ID someone shared with you.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<label
							htmlFor={joinInputId}
							className="text-sm font-medium text-ink-soft"
						>
							Call ID
						</label>
						<Input
							id={joinInputId}
							value={joinInput}
							onChange={(event) => {
								onJoinInputChange(event.target.value);
							}}
							placeholder="e.g. a1b2c3d4-e5f6-…"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
							className="h-12 bg-surface-raised border-line-control px-3 text-base text-ink placeholder:text-ink-muted focus-visible:ring-focus"
							data-testid="join-call-input"
						/>
						{joinInputError && (
							<p
								className="text-[13px] text-danger"
								data-testid="join-call-input-error"
							>
								{joinInputError}
							</p>
						)}
					</div>
					<Button
						onClick={onJoin}
						disabled={loading !== undefined || !isJoinInputValid}
						variant="outline"
						className="h-12 w-full border-line-control bg-transparent text-base text-ink hover:bg-surface-raised hover:text-ink"
						data-testid="join-call-button"
					>
						{loading === 'join' ? 'Joining…' : 'Join call'}
					</Button>
				</CardContent>
			</Card>

			{error && (
				<p role="alert" className="text-[13px] text-danger">
					{error}
				</p>
			)}
		</main>
	);
}
