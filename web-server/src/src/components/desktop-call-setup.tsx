import React, {useId} from 'react';
import {Mic, MicOff, Video, VideoOff} from 'lucide-react';
import {Button} from '@/components/ui/button.tsx';
import {Input} from '@/components/ui/input.tsx';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card.tsx';
import {LocalVideo, ParticipantTile} from '@/components/video-grid.tsx';
import CallControlButton from '@/components/call-control-button.tsx';

type DesktopCallSetupProps = {
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	localVideoRef: React.RefObject<HTMLVideoElement | null>;
	previewError: string;
	micOn: boolean;
	cameraOn: boolean;
	joinInput: string;
	joinInputError: string;
	isJoinInputValid: boolean;
	loading: 'create' | 'join' | undefined;
	error: string;
	onToggleMic: () => void;
	onToggleCamera: () => void;
	onJoinInputChange: (value: string) => void;
	onCreate: () => void;
	onJoin: () => void;
};

// Figma "Desktop · Lobby": 640px preview, 48px gap, 360px column of cards
// with 20px padding.
const cardClass =
	'bg-surface border-line ring-0 border [--card-spacing:--spacing(5)]';
const titleClass = 'text-ink text-lg font-semibold';

export default function DesktopCallSetup({
	localVideoRef,
	previewError,
	micOn,
	cameraOn,
	joinInput,
	joinInputError,
	isJoinInputValid,
	loading,
	error,
	onToggleMic,
	onToggleCamera,
	onJoinInputChange,
	onCreate,
	onJoin,
}: DesktopCallSetupProps) {
	const joinInputId = useId();

	return (
		<main className="flex flex-1 items-center justify-center p-6">
			<div className="grid w-full max-w-[1048px] items-center gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
				<section aria-label="Camera preview" className="flex flex-col gap-4">
					<ParticipantTile label="You">
						<LocalVideo mirror videoRef={localVideoRef} cameraOn={cameraOn} />
					</ParticipantTile>
					<div className="flex items-center justify-center gap-3">
						<CallControlButton
							icon={micOn ? Mic : MicOff}
							label="Microphone"
							checked={micOn}
							onClick={onToggleMic}
							testId="lobby-mic-toggle"
						/>
						<CallControlButton
							icon={cameraOn ? Video : VideoOff}
							label="Camera"
							checked={cameraOn}
							onClick={onToggleCamera}
							testId="lobby-camera-toggle"
						/>
					</div>
					<p className="text-center text-[13px] text-ink-muted">
						{previewError || 'Check your camera and mic before you join'}
					</p>
				</section>

				<div className="grid gap-4 md:grid-cols-2 lg:flex lg:flex-col">
					<Card className={cardClass}>
						<CardHeader>
							<CardTitle className={titleClass}>Start a call</CardTitle>
							<CardDescription className="text-ink-muted">
								Create a call, then share its ID with the people you want to
								talk to.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button
								onClick={onCreate}
								disabled={loading !== undefined}
								className="w-full gap-2 bg-action text-on-action hover:bg-action-hover"
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
							<div className="flex flex-col gap-1.5">
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
									onKeyDown={(event) => {
										if (
											event.key === 'Enter' &&
											isJoinInputValid &&
											loading === undefined
										)
											onJoin();
									}}
									placeholder="e.g. 7be50146-a0d6-…"
									spellCheck={false}
									className="h-12 bg-surface-raised border-line-control px-3 text-base md:text-base text-ink placeholder:text-ink-muted focus-visible:ring-focus"
									suppressHydrationWarning={true}
									data-testid="join-call-input"
								/>
								{joinInputError && (
									<p
										className="text-xs text-danger"
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
								className="w-full border-line-control bg-transparent text-ink hover:bg-surface-raised hover:text-ink"
								data-testid="join-call-button"
							>
								{loading === 'join' ? 'Joining…' : 'Join call'}
							</Button>
						</CardContent>
					</Card>

					{error && (
						<p role="alert" className="text-sm text-danger md:col-span-2">
							{error}
						</p>
					)}
				</div>
			</div>
		</main>
	);
}
