import {useEffect, useState} from 'react';

// Messages from other people that arrived while the chat was closed.
// Messages are "<email>: <text>", so the user's own are skipped by prefix.
export function useUnreadCount(
	messages: string[],
	chatOpen: boolean,
	email: string,
) {
	const [seenMessages, setSeenMessages] = useState(0);

	useEffect(() => {
		if (chatOpen) setSeenMessages(messages.length);
	}, [chatOpen, messages.length]);

	return chatOpen
		? 0
		: messages
				.slice(seenMessages)
				.filter((message) => !message.startsWith(`${email}: `)).length;
}
