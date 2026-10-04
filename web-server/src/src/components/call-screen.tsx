import React, {useRef, useState} from 'react';
import {LogOut, Mic, MicOff, PhoneOff, Video, VideoOff} from 'lucide-react';
import {Button} from '@/components/ui/button.tsx';
import {Input} from '@/components/ui/input.tsx';
import {Badge} from '@/components/ui/badge.tsx';
import {Separator} from '@/components/ui/separator.tsx';
import {useTokenWorker} from '@/lib/use-token-worker.ts';
import {
	connectToCall,
	sendChatMessageToCall,
	closeConns,
	closeWebSocketServerConn,
	setLocalTrackEnabled,
} from '@/lib/rtc-utils.ts';
import {useIsMobile} from '@/lib/use-is-mobile.ts';
import VideoGrid, {type RemoteStream} from '@/components/video-grid.tsx';
import ChatPanel from '@/components/chat-panel.tsx';
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
	const isMobile = useIsMobile();

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
		} catch (error_) {
			setError('Failed to leave the call. Please try again.');
			console.error(error_);
		} finally {
			setLoading(undefined);
		}
	}

	function toggleMic() {
		setMicOn(!micOn);
		void setLocalTrackEnabled('audio', !micOn);
	}

	function toggleCamera() {
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

	// Below the md breakpoint the layout follows the mobile app's: a
	// full-screen call, and stacked cards to start one. Each layout renders on
	// its own, so test IDs stay unique.
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

	const inCall = Boolean(callId);

	return (
		<div className="min-h-dvh bg-canvas text-ink flex flex-col">
			{/* Header */}
			<header className="flex items-center justify-between gap-3 px-4 py-2 md:px-6 md:py-3 border-b border-line shrink-0">
				<div className="flex items-center gap-2">
					<Video className="h-5 w-5 text-ink-soft" />
					<span className="font-semibold text-ink">Voneo</span>
				</div>
				<div className="flex items-center gap-3">
					{callId && (
						<Badge
							variant="outline"
							className="border-line-control text-ink-soft font-mono text-xs"
						>
							{callId}
						</Badge>
					)}
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

			{/* Controls bar — hidden once in a call */}
			{!inCall && !isMobile && (
				<div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-line">
					<Button
						onClick={() => {
							void handleCreate();
						}}
						disabled={loading !== undefined}
						className="bg-action text-on-action hover:bg-action-hover"
						data-testid="create-call-button"
					>
						{loading === 'create' ? 'Creating…' : 'Create call'}
					</Button>

					<Separator orientation="vertical" className="h-6 bg-line-strong" />

					<div className="flex gap-2">
						<Input
							value={joinInput}
							onChange={(event) => {
								setJoinInput(event.target.value);
							}}
							placeholder="Enter call ID"
							aria-label="Call ID"
							className="w-64 bg-surface border-line-control text-ink placeholder:text-ink-muted focus-visible:ring-focus"
							suppressHydrationWarning={true}
							data-testid="join-call-input"
						/>
						<Button
							onClick={() => {
								void handleJoin();
							}}
							disabled={loading !== undefined || !isJoinInputValid}
							variant="outline"
							className="border-line-control bg-surface text-ink hover:bg-surface-raised hover:text-ink"
							data-testid="join-call-button"
						>
							{loading === 'join' ? 'Joining…' : 'Join call'}
						</Button>
					</div>

					{joinInputError && (
						<p
							className="text-xs text-danger w-full"
							data-testid="join-call-input-error"
						>
							{joinInputError}
						</p>
					)}
					{error && (
						<p role="alert" className="text-sm text-danger w-full">
							{error}
						</p>
					)}
				</div>
			)}

			{/* Main area */}
			{!isMobile && (
				<div className="flex flex-1 overflow-hidden">
					<div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
						{inCall && (
							<div className="flex items-center justify-between">
								<Badge
									variant="outline"
									className="border-line-control text-ink-soft font-mono text-xs"
								>
									Call ID: <span data-testid="call-id">{callId}</span>
								</Badge>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="icon-sm"
										role="switch"
										aria-checked={micOn}
										aria-label="Microphone"
										onClick={toggleMic}
										className="border-line-control bg-surface text-ink hover:bg-surface-raised hover:text-ink"
										data-testid="mic-toggle"
									>
										{micOn ? <Mic /> : <MicOff />}
									</Button>
									<Button
										variant="outline"
										size="icon-sm"
										role="switch"
										aria-checked={cameraOn}
										aria-label="Camera"
										onClick={toggleCamera}
										className="border-line-control bg-surface text-ink hover:bg-surface-raised hover:text-ink"
										data-testid="camera-toggle"
									>
										{cameraOn ? <Video /> : <VideoOff />}
									</Button>
									<Button
										variant="destructive"
										size="sm"
										onClick={() => {
											void handleLeave();
										}}
										data-testid="hang-up-button"
									>
										<PhoneOff className="h-4 w-4 mr-1.5" />
										Hang up
									</Button>
								</div>
							</div>
						)}
						<VideoGrid
							localVideoRef={localVideoRef}
							remoteStreams={remoteStreams}
							cameraOn={cameraOn}
						/>
					</div>

					{/* Chat sidebar */}
					<div className="w-80 shrink-0 border-l border-line flex flex-col">
						<ChatPanel
							messages={messages}
							participants={participants}
							onSend={sendChat}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
