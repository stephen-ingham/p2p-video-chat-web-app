import React from 'react';
import {VideoOff, MicOff} from 'lucide-react';
import {Avatar, AvatarFallback} from '@/components/ui/avatar.tsx';
import {Badge} from '@/components/ui/badge.tsx';
import {getLocalStream, type MediaState} from '@/lib/rtc-utils.ts';
import {cn} from '@/lib/utils.ts';

export type RemoteStream = {
	peerUser: string;
	stream: MediaStream;
};

// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
type VideoRef = React.RefObject<HTMLVideoElement | null>;

type VideoGridProps = {
	localVideoRef: VideoRef;
	username: string;
	remoteStreams: RemoteStream[];
	peerMediaStates: Record<string, MediaState>;
	cameraOn: boolean;
	micOn: boolean;
};

// Figma "Participant tile" with Camera off: the person's initial in place
// of the (black) video.
function CameraOffAvatar({
	name,
	testId,
	description,
}: {
	name: string;
	testId: string;
	description: string;
}) {
	return (
		<div
			className="absolute inset-0 flex items-center justify-center"
			data-testid={testId}
		>
			<Avatar aria-hidden className="size-16 after:hidden">
				<AvatarFallback className="bg-surface-active text-2xl font-semibold text-ink">
					{name[0]?.toUpperCase() ?? '?'}
				</AvatarFallback>
			</Avatar>
			<span className="sr-only">{description}</span>
		</div>
	);
}

// With a `name`, camera off shows that name's initial avatar; without one
// (the phone layout, until it gets the avatar too), a camera-off icon.
export function LocalVideo({
	videoRef,
	cameraOn,
	name,
	mirror = false,
}: {
	videoRef: VideoRef;
	cameraOn: boolean;
	name?: string;
	mirror?: boolean;
}) {
	React.useEffect(() => {
		if (!videoRef.current || videoRef.current.srcObject) return;
		getLocalStream()
			.then((stream) => {
				if (stream && videoRef.current && !videoRef.current.srcObject)
					videoRef.current.srcObject = stream;
			})
			.catch(() => undefined);
	}, [videoRef]);

	return (
		<>
			<video
				ref={videoRef}
				autoPlay
				muted
				playsInline
				className={cn(
					'w-full h-full object-cover',
					!cameraOn && 'invisible',
					mirror && '-scale-x-100',
				)}
				data-testid="local-video"
			/>
			{!cameraOn &&
				(name === undefined ? (
					<div
						className="absolute inset-0 flex items-center justify-center"
						data-testid="local-camera-off"
					>
						<VideoOff aria-hidden className="size-6 text-ink-muted" />
						<span className="sr-only">Your camera is off</span>
					</div>
				) : (
					<CameraOffAvatar
						name={name}
						testId="local-camera-off"
						description="Your camera is off"
					/>
				))}
		</>
	);
}

export function StreamVideo({
	stream,
	testId,
	className,
}: {
	stream: MediaStream;
	testId: string;
	className?: string;
}) {
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	const ref = React.useRef<HTMLVideoElement | null>(null);

	React.useEffect(() => {
		if (ref.current) ref.current.srcObject = stream;
	}, [stream]);

	return (
		<video
			ref={ref}
			autoPlay
			playsInline
			className={cn('w-full h-full object-cover', className)}
			data-testid={testId}
		/>
	);
}

// A remote participant's video, replaced by their initial while their camera
// is off (their track is still there, sending black frames).
export function RemoteVideo({
	peerUser,
	stream,
	cameraOn,
}: {
	peerUser: string;
	stream: MediaStream;
	cameraOn: boolean;
}) {
	return (
		<>
			<StreamVideo
				stream={stream}
				testId={`remote-video-${peerUser}`}
				className={cn(!cameraOn && 'invisible')}
			/>
			{!cameraOn && (
				<CameraOffAvatar
					name={peerUser}
					testId={`remote-camera-off-${peerUser}`}
					description={`${peerUser}'s camera is off`}
				/>
			)}
		</>
	);
}

// Figma "Participant tile": 16:9, rounded, name pill bottom-left.
export function ParticipantTile({
	label,
	micOn,
	testId,
	className,
	style,
	children,
}: {
	label: string;
	micOn: boolean;
	testId?: string;
	className?: string;
	style?: React.CSSProperties;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				'relative aspect-video overflow-hidden rounded-xl bg-surface-raised',
				className,
			)}
			style={style}
			data-testid={testId}
		>
			{children}
			<Badge className="absolute bottom-3 left-3 h-7 max-w-[calc(100%-1.5rem)] rounded-md border-0 bg-scrim px-3 text-sm text-ink">
				{!micOn && (
					<MicOff
						role="img"
						aria-label="Microphone off"
						className="size-4 shrink-0 text-danger"
						data-testid="tile-mic-off"
					/>
				)}
				<span className="truncate">{label}</span>
			</Badge>
		</div>
	);
}

const tileGapPx = 16;

// Columns × rows for the largest-fit layout: 1 alone, 2 side by side,
// 3–4 in a 2×2 (a third tile centred on the second row), then 3 columns.
export function gridShape(count: number) {
	if (count <= 1) return {cols: 1, rows: 1};
	if (count === 2) return {cols: 2, rows: 1};
	if (count <= 4) return {cols: 2, rows: 2};
	return {cols: 3, rows: Math.ceil(count / 3)};
}

export default function VideoGrid({
	localVideoRef,
	username,
	remoteStreams,
	peerMediaStates,
	cameraOn,
	micOn,
}: VideoGridProps) {
	const {cols, rows} = gridShape(remoteStreams.length + 1);
	// The stage is a size container, so each tile takes the smaller of the
	// width-limited and height-limited 16:9 sizes, without measuring in JS.
	const tileWidth = `min((100cqw - ${(cols - 1) * tileGapPx}px) / ${cols}, (100cqh - ${(rows - 1) * tileGapPx}px) / ${rows} * 16 / 9)`;

	return (
		// The box is exactly `cols` tiles wide (+1px so subpixel rounding can't
		// wrap a row early), so extra tiles wrap and centre on the next row.
		<div
			className="relative min-h-0 flex-1 [container-type:size]"
			data-testid="video-stage"
		>
			<div className="absolute inset-0 flex items-center justify-center">
				<div
					className="flex flex-wrap justify-center gap-4"
					style={{
						width: `calc(${cols} * ${tileWidth} + ${(cols - 1) * tileGapPx + 1}px)`,
					}}
				>
					<ParticipantTile label="You" micOn={micOn} style={{width: tileWidth}}>
						<LocalVideo
							mirror
							videoRef={localVideoRef}
							cameraOn={cameraOn}
							name={username}
						/>
					</ParticipantTile>
					{remoteStreams.map(({peerUser, stream}) => (
						<ParticipantTile
							key={peerUser}
							label={peerUser}
							micOn={peerMediaStates[peerUser]?.audio ?? true}
							style={{width: tileWidth}}
							testId={`remote-tile-${peerUser}`}
						>
							<RemoteVideo
								peerUser={peerUser}
								stream={stream}
								cameraOn={peerMediaStates[peerUser]?.video ?? true}
							/>
						</ParticipantTile>
					))}
				</div>
			</div>
		</div>
	);
}
