import React, {useRef, useState} from 'react';
import {PhoneOff, Video, LogOut} from 'lucide-react';
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
} from '@/lib/rtc-utils.ts';
import VideoGrid from '@/components/video-grid.tsx';
import ChatPanel from '@/components/chat-panel.tsx';

type RemoteStream = {
	peerUser: string;
	stream: MediaStream;
};

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
		setParticipants((previous) => [...previous, name]);
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
			setError('Failed to create call.');
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
			setError('Failed to join call. Check the call ID.');
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
		} catch (error_) {
			setError('Failed to leave call. Please try again:');
			console.error(error_);
		} finally {
			setLoading(undefined);
		}
	}

	async function handleLogout() {
		await logout();
		onLogout();
	}

	const inCall = Boolean(callId);

	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
			{/* Header */}
			<header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
				<div className="flex items-center gap-2">
					<Video className="h-5 w-5 text-zinc-300" />
					<span className="font-semibold text-zinc-100">Voneo</span>
				</div>
				<div className="flex items-center gap-3">
					{callId && (
						<Badge
							variant="outline"
							className="border-zinc-600 text-zinc-300 font-mono text-xs"
						>
							{callId}
						</Badge>
					)}
					<span className="text-sm text-zinc-400" data-testid="username">
						{username}
					</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							void handleLogout();
						}}
						className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
						data-testid="logout-button"
					>
						<LogOut className="h-4 w-4 mr-1.5" />
						Logout
					</Button>
				</div>
			</header>

			{/* Controls bar — hidden once in a call */}
			{!inCall && (
				<div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-zinc-800">
					<Button
						onClick={() => {
							void handleCreate();
						}}
						disabled={loading !== undefined}
						className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
						data-testid="create-call-button"
					>
						{loading === 'create' ? 'Creating…' : 'Create Call'}
					</Button>

					<Separator orientation="vertical" className="h-6 bg-zinc-700" />

					<div className="flex gap-2">
						<Input
							value={joinInput}
							onChange={(event) => {
								setJoinInput(event.target.value);
							}}
							placeholder="Enter call ID"
							className="w-64 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
							suppressHydrationWarning={true}
							data-testid="join-call-input"
						/>
						<Button
							onClick={() => {
								void handleJoin();
							}}
							disabled={loading !== undefined || !isJoinInputValid}
							variant="outline"
							className="border-zinc-700 text-zinc-900 hover:bg-zinc-800"
							data-testid="join-call-button"
						>
							{loading === 'join' ? 'Joining…' : 'Join Call'}
						</Button>
					</div>

					{joinInputError && (
						<p
							className="text-xs text-red-400 w-full"
							data-testid="join-call-input-error"
						>
							{joinInputError}
						</p>
					)}
					{error && <p className="text-sm text-red-400 w-full">{error}</p>}
				</div>
			)}

			{/* Main area */}
			<div className="flex flex-1 overflow-hidden">
				<div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
					{inCall && (
						<div className="flex items-center justify-between">
							<Badge
								variant="outline"
								className="border-zinc-600 text-zinc-300 font-mono text-xs"
							>
								Call ID: <span data-testid="call-id">{callId}</span>
							</Badge>
							<Button
								variant="destructive"
								size="sm"
								onClick={() => {
									void handleLeave();
								}}
								data-testid="hang-up-button"
							>
								<PhoneOff className="h-4 w-4 mr-1.5" />
								Hang Up
							</Button>
						</div>
					)}
					<VideoGrid
						localVideoRef={localVideoRef}
						remoteStreams={remoteStreams}
					/>
				</div>

				{/* Chat sidebar */}
				<div className="w-80 shrink-0 border-l border-zinc-800 flex flex-col">
					<ChatPanel
						messages={messages}
						participants={participants}
						onSend={(message) => {
							if (callId) sendChatMessageToCall(message, callId, email);
						}}
					/>
				</div>
			</div>
		</div>
	);
}
