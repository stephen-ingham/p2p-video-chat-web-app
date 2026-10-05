import React, {useEffect, useRef, useState} from 'react';
import {LogOut, Video} from 'lucide-react';
import {Button} from '@/components/ui/button.tsx';
import {useTokenWorker} from '@/lib/use-token-worker.ts';
import {
	connectToCall,
	sendChatMessageToCall,
	closeConns,
	closeWebSocketServerConn,
	setLocalTrackEnabled,
	startLocalMedia,
	stopLocalMedia,
} from '@/lib/rtc-utils.ts';
import {useIsMobile} from '@/lib/use-is-mobile.ts';
import {useIsDesktop} from '@/lib/use-is-desktop.ts';
import {cn} from '@/lib/utils.ts';
import {useUnreadCount} from '@/lib/use-unread-count.ts';
import VideoGrid, {type RemoteStream} from '@/components/video-grid.tsx';
import ChatPanel from '@/components/chat-panel.tsx';
import CallControlBar from '@/components/call-control-bar.tsx';
import CallIdChip from '@/components/call-id-chip.tsx';
import DesktopCallSetup from '@/components/desktop-call-setup.tsx';
import MobileCallSetup from '@/components/mobile-call-setup.tsx';
import MobileInCallView from '@/components/mobile-in-call-view.tsx';

type CallScreenProps = {
	email: string;
	username: string;
	onLogout: () => void;
};

function isValidCallId(value: string) {
	return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iv.test(
		value,
	);
}

export default function CallScreen({
	email,
	username,
	onLogout,
}: CallScreenProps) {
	const {createCall, joinCall, leaveCall, logout, getIceServers} =
		useTokenWorker();
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	const localVideoRef = useRef<HTMLVideoElement | null>(null);
	const remoteVideoRefs = useRef<HTMLVideoElement[]>([]);

	const [callId, setCallId] = useState<string | undefined>(undefined);
	const [joinInput, setJoinInput] = useState('');
	const [messages, setMessages] = useState<string[]>([]);
	const [participants, setParticipants] = useState<string[]>([]);
	const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
	const [loading, setLoading] = useState<'create' | 'join' | undefined>(
		undefined,
	);
	const [error, setError] = useState('');
	const [micOn, setMicOn] = useState(true);
	const [cameraOn, setCameraOn] = useState(true);
	const [chatOpen, setChatOpen] = useState(true);
	const unread = useUnreadCount(messages, chatOpen, email);
	// Mirrors micOn/cameraOn for async callbacks, which would otherwise see
	// the values from the render that started them.
	const mediaChoices = useRef({micOn: true, cameraOn: true});
	const [previewError, setPreviewError] = useState('');
	const isMobile = useIsMobile();
	const isDesktop = useIsDesktop();
	const inCall = Boolean(callId);

	// Desktop lobby: preview the camera before a call. The same stream is sent
	// once a call starts, so the mic/camera choices made here carry into it.
	useEffect(() => {
		if (inCall || isMobile) return;
		let cancelled = false;
		startLocalMedia()
			.then(async (stream) => {
				if (cancelled) return;
				setPreviewError('');
				if (localVideoRef.current && !localVideoRef.current.srcObject)
					localVideoRef.current.srcObject = stream;
				await setLocalTrackEnabled('audio', mediaChoices.current.micOn);
				await setLocalTrackEnabled('video', mediaChoices.current.cameraOn);
			})
			.catch(() => {
				if (!cancelled)
					setPreviewError(
						"Couldn't access your camera or mic. Check your browser's permissions.",
					);
			});
		return () => {
			cancelled = true;
		};
	}, [inCall, isMobile]);

	// Turns the camera light off on logout.
	useEffect(
		() => () => {
			void stopLocalMedia();
		},
		[],
	);

	const trimmedJoinInput = joinInput.trim();
	const joinInputError =
		trimmedJoinInput.length > 0 && !isValidCallId(trimmedJoinInput)
			? 'Enter a valid call ID (UUID format).'
			: '';
	const isJoinInputValid = isValidCallId(trimmedJoinInput);

	function addChatMessage(message: string) {
		setMessages((previous) => [...previous, message]);
	}

	function addParticipant(name: string) {
		setParticipants((previous) =>
			previous.includes(name) ? previous : [...previous, name],
		);
	}

	function removeParticipant(name: string) {
		setParticipants((previous) => previous.filter((p) => p !== name));
	}

	function isParticipant(name: string) {
		return participants.includes(name);
	}

	function getCurrentUser() {
		return email;
	}

	function addRemoteVideo(peerUser: string, stream: MediaStream) {
		setRemoteStreams((previous) => {
			if (previous.some((s) => s.peerUser === peerUser)) return previous;
			return [...previous, {peerUser, stream}];
		});
	}

	function updateRemoteVideo(peerUser: string, stream: MediaStream) {
		setRemoteStreams((previous) => {
			return previous.map((s) =>
				s.peerUser === peerUser ? s : {peerUser, stream},
			);
		});
	}

	function getRemoteVideo(peerUser: string) {
		return remoteStreams.find((s) => s.peerUser === peerUser);
	}

	// Undefined (-> rtc-utils' public-STUN default) if the API call fails, so a
	// hiccup fetching TURN credentials degrades the call rather than blocking it.
	// Toggles made before the stream existed only changed state, so apply them
	// once the call has its tracks.
	async function applyMediaChoices() {
		await setLocalTrackEnabled('audio', mediaChoices.current.micOn);
		await setLocalTrackEnabled('video', mediaChoices.current.cameraOn);
	}

	async function fetchIceServers(): Promise<RTCIceServer[] | undefined> {
		try {
			const result = await getIceServers();
			return typeof result === 'string' ? undefined : result;
		} catch {
			return undefined;
		}
	}

	async function handleCreate() {
		setError('');
		setLoading('create');
		try {
			const result = await createCall();
			console.log('result of createCall:', result);
			if (typeof result === 'string') throw new Error(result);
			const {callID: newCallId} = result;
			// Chat starts open beside the grid on desktop; on tablets it would
			// cover the video, so it starts closed there.
			setChatOpen(isDesktop);
			setCallId(newCallId);

			await connectToCall(
				newCallId,
				email,
				username,
				localVideoRef,
				remoteVideoRefs,
				addChatMessage,
				addParticipant,
				removeParticipant,
				addRemoteVideo,
				isParticipant,
				getCurrentUser,
				await fetchIceServers(),
			);
			await applyMediaChoices();
		} catch {
			setError('Failed to create a call.');
		} finally {
			setLoading(undefined);
		}
	}

	async function handleJoin() {
		if (!isJoinInputValid) return;
		setError('');
		setLoading('join');
		try {
			const joinResult = await joinCall(trimmedJoinInput);
			if (joinResult === 'Join new call failed')
				throw new Error('Join new call failed');
			setChatOpen(isDesktop);
			setCallId(trimmedJoinInput);
			await connectToCall(
				trimmedJoinInput,
				email,
				username,
				localVideoRef,
				remoteVideoRefs,
				addChatMessage,
				addParticipant,
				removeParticipant,
				addRemoteVideo,
				isParticipant,
				getCurrentUser,
				await fetchIceServers(),
			);
			await applyMediaChoices();
		} catch {
			setError('Failed to join the call. Check the call ID.');
		} finally {
			setLoading(undefined);
		}
	}

	async function handleLeave() {
		setError('');
		setLoading('create');

		try {
			if (!callId) {
				throw new Error("Can't access active callID");
			}

			await leaveCall(callId);
			await closeConns(
				remoteVideoRefs,
				updateRemoteVideo,
				getRemoteVideo,
				callId,
				email,
			);
			await closeWebSocketServerConn(callId);

			setCallId(undefined);
			setRemoteStreams([]);
			setParticipants([]);
			setMessages([]);
			setMicOn(true);
			setCameraOn(true);
			mediaChoices.current = {micOn: true, cameraOn: true};
			// Phones have no lobby preview, so release the camera; the desktop
			// lobby keeps showing it.
			await (isMobile ? stopLocalMedia() : applyMediaChoices());
		} catch (error_) {
			setError('Failed to leave the call. Please try again.');
			console.error(error_);
		} finally {
			setLoading(undefined);
		}
	}

	function toggleMic() {
		mediaChoices.current.micOn = !micOn;
		setMicOn(!micOn);
		void setLocalTrackEnabled('audio', !micOn);
	}

	function toggleCamera() {
		mediaChoices.current.cameraOn = !cameraOn;
		setCameraOn(!cameraOn);
		void setLocalTrackEnabled('video', !cameraOn);
	}

	async function handleLogout() {
		await logout();
		onLogout();
	}

	function sendChat(message: string) {
		if (callId) sendChatMessageToCall(message, callId, email);
	}

	if (isMobile && callId) {
		return (
			<MobileInCallView
				callId={callId}
				email={email}
				localVideoRef={localVideoRef}
				remoteStreams={remoteStreams}
				participants={participants}
				messages={messages}
				micOn={micOn}
				cameraOn={cameraOn}
				onToggleMic={toggleMic}
				onToggleCamera={toggleCamera}
				onSendChat={sendChat}
				onHangUp={() => {
					void handleLeave();
				}}
			/>
		);
	}

	return (
		<div
			className={cn(
				'min-h-dvh bg-canvas text-ink flex flex-col',
				// In a call the video stage fills the viewport, never scrolls it.
				inCall && 'h-dvh',
			)}
		>
			{/* Header */}
			<header className="relative flex items-center justify-between gap-3 px-4 py-2 md:px-6 md:py-3 border-b border-line shrink-0">
				<div className="flex shrink-0 items-center gap-2">
					<Video className="h-5 w-5 text-ink-soft" />
					<span className="font-semibold text-ink">Voneo</span>
				</div>
				<div className="flex min-w-0 items-center gap-3">
					{callId && <CallIdChip callId={callId} />}
					<span
						className="min-w-0 truncate text-[13px] md:text-sm text-ink-muted"
						data-testid="username"
					>
						{username}
					</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							void handleLogout();
						}}
						className="h-12 gap-2 px-3 text-base md:h-7 md:gap-1 md:px-2.5 md:text-[0.8rem] text-ink-muted hover:text-ink hover:bg-surface-raised"
						data-testid="logout-button"
					>
						<LogOut className="size-5 md:size-4" />
						Log out
					</Button>
				</div>
			</header>

			{isMobile && (
				<MobileCallSetup
					joinInput={joinInput}
					joinInputError={joinInputError}
					isJoinInputValid={isJoinInputValid}
					loading={loading}
					error={error}
					onJoinInputChange={setJoinInput}
					onCreate={() => {
						void handleCreate();
					}}
					onJoin={() => {
						void handleJoin();
					}}
				/>
			)}

			{!inCall && !isMobile && (
				<DesktopCallSetup
					localVideoRef={localVideoRef}
					previewError={previewError}
					micOn={micOn}
					cameraOn={cameraOn}
					joinInput={joinInput}
					joinInputError={joinInputError}
					isJoinInputValid={isJoinInputValid}
					loading={loading}
					error={error}
					onToggleMic={toggleMic}
					onToggleCamera={toggleCamera}
					onJoinInputChange={setJoinInput}
					onCreate={() => {
						void handleCreate();
					}}
					onJoin={() => {
						void handleJoin();
					}}
				/>
			)}

			{/* Main area — the chat sidebar only exists during a call */}
			{inCall && !isMobile && (
				<div className="relative flex min-h-0 flex-1 overflow-hidden">
					<div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
						{error && (
							<p role="alert" className="text-sm text-danger">
								{error}
							</p>
						)}
						<VideoGrid
							localVideoRef={localVideoRef}
							remoteStreams={remoteStreams}
							cameraOn={cameraOn}
						/>
						<CallControlBar
							micOn={micOn}
							cameraOn={cameraOn}
							chatOpen={chatOpen}
							unread={unread}
							onToggleMic={toggleMic}
							onToggleCamera={toggleCamera}
							onToggleChat={() => {
								setChatOpen(!chatOpen);
							}}
							onHangUp={() => {
								void handleLeave();
							}}
						/>
					</div>

					{/* Chat sidebar */}
					{chatOpen && (
						<div
							className={cn(
								'flex w-[340px] flex-col',
								// Tablet (md–lg): a card floating over the video, stopping
								// above the control bar so Hang up stays reachable.
								'absolute top-4 right-4 bottom-[114px] z-30 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_12px_32px_rgb(0_0_0/0.5)]',
								// Desktop (lg+): a sidebar the grid reflows around.
								'lg:static lg:z-auto lg:shrink-0 lg:rounded-none lg:border-0 lg:border-l lg:bg-canvas lg:shadow-none',
							)}
							data-testid="chat-panel"
						>
							<ChatPanel
								messages={messages}
								participants={participants}
								currentUser={email}
								onSend={sendChat}
								onClose={() => {
									setChatOpen(false);
								}}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
