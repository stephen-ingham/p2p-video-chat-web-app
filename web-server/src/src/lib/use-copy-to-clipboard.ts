import {useEffect, useRef, useState} from 'react';

export type CopyStatus = 'idle' | 'copied' | 'failed';

// Copies text and reports the outcome for resetMs (long enough for a toast
// and the copy icon's tick). Shared by the desktop chip and, later, the
// phone layout's call ID chip.
export function useCopyToClipboard(resetMs = 2000) {
	const [status, setStatus] = useState<CopyStatus>('idle');
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(
		() => () => {
			clearTimeout(timer.current);
		},
		[],
	);

	async function copy(text: string) {
		let next: CopyStatus = 'copied';
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// No clipboard API (e.g. an insecure origin) or permission denied.
			next = 'failed';
		}

		setStatus(next);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			setStatus('idle');
		}, resetMs);
		return next === 'copied';
	}

	return {status, copy};
}
