import React from 'react';
import {VideoOff} from 'lucide-react';
import {Badge} from '@/components/ui/badge.tsx';
import {Card} from '@/components/ui/card.tsx';
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

function VideoTile({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<Card className="relative overflow-hidden bg-surface aspect-video flex items-center justify-center min-w-[280px]">
			{children}
			<Badge className="absolute bottom-2 left-2 bg-scrim text-ink border-0">
				{label}
			</Badge>
		</Card>
	);
}

export default function VideoGrid({
	localVideoRef,
	remoteStreams,
	cameraOn,
}: VideoGridProps) {
	return (
		<div className="flex flex-wrap gap-3 w-full">
			<VideoTile label="You">
				<LocalVideo videoRef={localVideoRef} cameraOn={cameraOn} />
			</VideoTile>
			{remoteStreams.map(({peerUser, stream}) => (
				<VideoTile key={peerUser} label={peerUser}>
					<StreamVideo stream={stream} testId={`remote-video-${peerUser}`} />
				</VideoTile>
			))}
		</div>
	);
}
