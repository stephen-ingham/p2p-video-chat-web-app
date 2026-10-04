import React from 'react';
import {VideoOff} from 'lucide-react';
import {Badge} from '@/components/ui/badge.tsx';
import {getLocalStream} from '@/lib/rtc-utils.ts';
import {cn} from '@/lib/utils.ts';

export type RemoteStream = {
	peerUser: string;
	stream: MediaStream;
};

// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
type VideoRef = React.RefObject<HTMLVideoElement | null>;

type VideoGridProps = {
	localVideoRef: VideoRef;
	remoteStreams: RemoteStream[];
	cameraOn: boolean;
};

export function LocalVideo({
	videoRef,
	cameraOn,
	mirror = false,
}: {
	videoRef: VideoRef;
	cameraOn: boolean;
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
			{!cameraOn && (
				<div
					className="absolute inset-0 flex items-center justify-center"
					data-testid="local-camera-off"
				>
					<VideoOff aria-hidden className="size-6 text-ink-muted" />
					<span className="sr-only">Your camera is off</span>
				</div>
			)}
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

// Figma "Participant tile": 16:9, rounded, name pill bottom-left.
export function ParticipantTile({
	label,
	className,
	style,
	children,
}: {
	label: string;
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
		>
			{children}
			<Badge className="absolute bottom-3 left-3 h-7 max-w-[calc(100%-1.5rem)] rounded-md border-0 bg-scrim px-3 text-sm text-ink">
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
	remoteStreams,
	cameraOn,
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
					<ParticipantTile label="You" style={{width: tileWidth}}>
						<LocalVideo mirror videoRef={localVideoRef} cameraOn={cameraOn} />
					</ParticipantTile>
					{remoteStreams.map(({peerUser, stream}) => (
						<ParticipantTile
							key={peerUser}
							label={peerUser}
							style={{width: tileWidth}}
						>
							<StreamVideo
								stream={stream}
								testId={`remote-video-${peerUser}`}
							/>
						</ParticipantTile>
					))}
				</div>
			</div>
		</div>
	);
}
