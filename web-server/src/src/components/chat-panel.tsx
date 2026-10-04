import React, {useState} from 'react';
import {Send, X} from 'lucide-react';
import {ScrollArea} from '@/components/ui/scroll-area.tsx';
import {Input} from '@/components/ui/input.tsx';
import {Button} from '@/components/ui/button.tsx';
import {Avatar, AvatarFallback} from '@/components/ui/avatar.tsx';
import {Separator} from '@/components/ui/separator.tsx';
import CallControlButton from '@/components/call-control-button.tsx';
import {cn} from '@/lib/utils.ts';

type ChatPanelProps = {
	messages: string[];
	participants: string[];
	onSend: (message: string) => void;
	// The desktop sidebar, or the mobile layout's bottom sheet (ChatSheet),
	// which adds a close button and the mobile app's larger type and targets.
	variant?: 'sidebar' | 'sheet';
	titleId?: string;
	onClose?: () => void;
};

export default function ChatPanel({
	messages,
	participants,
	onSend,
	variant = 'sidebar',
	titleId,
	onClose,
}: ChatPanelProps) {
	const [input, setInput] = useState('');
	const sheet = variant === 'sheet';

	function handleSend() {
		if (!input.trim()) return;
		onSend(input.trim());
		setInput('');
	}

	return (
		<div
			className={cn(
				'flex flex-col overflow-hidden border border-line',
				sheet
					? 'min-h-0 gap-3 rounded-t-2xl bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]'
					: 'h-full rounded-xl bg-canvas',
			)}
		>
			<div
				className={cn(
					sheet
						? 'flex items-center justify-between gap-3'
						: 'px-4 py-3 border-b border-line',
				)}
			>
				<div className="min-w-0">
					<p
						id={titleId}
						className={cn(
							'font-semibold text-ink',
							sheet ? 'text-lg' : 'text-sm',
						)}
					>
						Chat
					</p>
					{participants.length > 0 && (
						<p
							className={cn(
								'text-ink-muted mt-0.5',
								sheet ? 'text-[13px] line-clamp-2' : 'text-xs',
							)}
							data-testid="participants"
						>
							{participants.join(', ')}
						</p>
					)}
				</div>
				{onClose && (
					<CallControlButton
						icon={X}
						label="Close chat"
						testId="chat-close"
						onClick={onClose}
					/>
				)}
			</div>

			<ScrollArea className={sheet ? 'min-h-0 shrink' : 'flex-1 px-4 py-3'}>
				<div className={cn('flex flex-col', sheet ? 'gap-3 py-1' : 'gap-3')}>
					{messages.length === 0 && (
						<p
							className={cn(
								'text-ink-muted text-center',
								sheet ? 'text-[13px] py-4' : 'text-xs py-4',
							)}
						>
							No messages yet
						</p>
					)}
					{messages.map((message, i) => {
						const [sender, ...rest] = message.split(': ');
						const text = rest.join(': ');
						return (
							<div
								key={i}
								className="flex items-start gap-2"
								data-testid="chat-message"
							>
								<Avatar
									className={cn(
										'shrink-0',
										sheet ? 'size-7' : 'h-6 w-6 mt-0.5',
									)}
								>
									<AvatarFallback
										className={cn(
											'bg-surface-active text-ink',
											sheet ? 'text-[13px] font-semibold' : 'text-[10px]',
										)}
									>
										{sender?.[0]?.toUpperCase() ?? '?'}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0">
									<p
										className={cn(
											'font-medium text-ink-soft break-words',
											sheet ? 'text-[13px]' : 'text-xs',
										)}
									>
										{sender}
									</p>
									<p
										className={cn(
											'text-ink break-words',
											sheet ? 'text-base' : 'text-sm',
										)}
									>
										{text}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</ScrollArea>

			{!sheet && <Separator className="bg-line" />}

			<div className={cn('flex gap-2', sheet ? 'items-center' : 'px-4 py-3')}>
				<Input
					value={input}
					onChange={(event) => {
						setInput(event.target.value);
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter') handleSend();
					}}
					placeholder="Type a message…"
					aria-label="Chat message"
					enterKeyHint="send"
					className={cn(
						'border-line-control text-ink placeholder:text-ink-muted focus-visible:ring-focus',
						sheet ? 'h-12 bg-surface-raised px-3 text-base' : 'bg-surface',
					)}
					suppressHydrationWarning={true}
					data-testid="chat-message-input"
				/>
				{sheet ? (
					<CallControlButton
						icon={Send}
						label="Send message"
						disabled={!input.trim()}
						testId="chat-send-button"
						onClick={handleSend}
					/>
				) : (
					<Button
						onClick={handleSend}
						size="icon"
						aria-label="Send message"
						className="bg-surface-active hover:bg-surface-active-hover shrink-0"
						data-testid="chat-send-button"
					>
						<Send className="h-4 w-4" />
					</Button>
				)}
			</div>
		</div>
	);
}
