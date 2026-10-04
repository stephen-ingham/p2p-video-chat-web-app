import React, {useEffect, useState} from 'react';
import {
	MessageSquare,
	Mic,
	MicOff,
	PhoneOff,
	Video,
	VideoOff,
} from 'lucide-react';
import CallControlButton from '@/components/call-control-button.tsx';
import ChatSheet from '@/components/chat-sheet.tsx';
import {
	LocalVideo,
	StreamVideo,
	type RemoteStream,
} from '@/components/video-grid.tsx';
import {cn} from '@/lib/utils.ts';

type MobileInCallViewProps = {
	callId: string;
	email: string;
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	localVideoRef: React.RefObject<HTMLVideoElement | null>;
	remoteStreams: RemoteStream[];
	participants: string[];
	messages: string[];
	micOn: boolean;
	cameraOn: boolean;
	onToggleMic: () => void;
	onToggleCamera: () => void;
	onSendChat: (message: string) => void;
	onHangUp: () => void;
};

// The in-call UI below the md breakpoint, matching the mobile app's
// InCallView (mobile-app/src/screens/in-call-view.tsx): everyone else's video
// fills the screen, yours sits in a corner, the controls run along the bottom
// within thumb reach, and chat opens as a sheet.
export default function MobileInCallView({
	callId,
	email,
	localVideoRef,
	remoteStreams,
	participants,
	messages,
	micOn,
	cameraOn,
	onToggleMic,
	onToggleCamera,
	onSendChat,
	onHangUp,
}: MobileInCallViewProps) {
	const [chatOpen, setChatOpen] = useState(false);
	const [seenMessages, setSeenMessages] = useState(0);

	// Messages count as read while the sheet is open.
	useEffect(() => {
		if (chatOpen) setSeenMessages(messages.length);
	}, [chatOpen, messages.length]);
	// Your own lines (including the server's echo of your join) aren't news.
	const unread = chatOpen
		? 0
		: messages
				.slice(seenMessages)
				.filter((message) => !message.startsWith(`${email}: `)).length;

	return (
		<div className="fixed inset-0 overflow-hidden bg-canvas text-ink">
			<div className="absolute inset-0 flex flex-col gap-0.5">
				{remoteStreams.length === 0 ? (
					<p className="flex flex-1 items-center justify-center p-6 text-center text-base text-ink-muted">
						Share the call ID so others can join.
					</p>
				) : (
					remoteStreams.map(({peerUser, stream}, index) => (
						<div key={peerUser} className="relative min-h-0 flex-1 bg-surface">
							<StreamVideo
								stream={stream}
								testId={`remote-video-${peerUser}`}
							/>
							{/* The bottom tile's label sits above the controls, beside your
							    own tile, rather than under them. */}
							<span
								className={cn(
									'absolute left-2 truncate rounded-[5px] bg-scrim px-2 py-0.5 text-[13px] text-ink',
									index === remoteStreams.length - 1
										? 'bottom-[calc(env(safe-area-inset-bottom,0px)+6rem)] max-w-[calc(100%-8.5rem)]'
										: 'bottom-2 max-w-[80%]',
								)}
							>
								{peerUser}
							</span>
						</div>
					))
				)}
			</div>

			<div className="absolute inset-x-0 top-0 flex flex-col gap-0.5 bg-scrim px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
				<p className="font-mono text-[13px] leading-[18px] text-ink-soft break-all select-text">
					Call ID: <span data-testid="call-id">{callId}</span>
				</p>
				<p
					aria-live="polite"
					className="text-[13px] leading-[18px] text-ink"
					data-testid="call-status"
				>
					{participants.length > 0
						? `On the call: ${participants.join(', ')}`
						: 'Waiting for others to join…'}
				</p>
			</div>

			<div className="absolute right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+6rem)] flex h-32 w-24 items-center justify-center overflow-hidden rounded-[10px] border border-line-control bg-surface">
				<LocalVideo mirror videoRef={localVideoRef} cameraOn={cameraOn} />
			</div>

			<div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-scrim px-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
				<div className="flex gap-3">
					<CallControlButton
						icon={micOn ? Mic : MicOff}
						label="Microphone"
						checked={micOn}
						testId="mic-toggle"
						onClick={onToggleMic}
					/>
					<CallControlButton
						icon={cameraOn ? Video : VideoOff}
						label="Camera"
						checked={cameraOn}
						testId="camera-toggle"
						onClick={onToggleCamera}
					/>
					<CallControlButton
						icon={MessageSquare}
						label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
						badge={unread}
						testId="chat-open"
						onClick={() => {
							setChatOpen(true);
						}}
					/>
				</div>
				<CallControlButton
					danger
					icon={PhoneOff}
					label="Hang up"
					testId="hang-up-button"
					onClick={onHangUp}
				/>
			</div>

			{chatOpen && (
				<ChatSheet
					messages={messages}
					participants={participants}
					onSend={onSendChat}
					onClose={() => {
						setChatOpen(false);
					}}
				/>
			)}
		</div>
	);
}
