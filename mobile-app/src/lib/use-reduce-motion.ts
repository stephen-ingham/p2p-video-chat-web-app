import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

// Whether the user has asked Android to remove animations, so the UI can
// skip its own (e.g. the chat sheet sliding up).
export function useReduceMotion() {
	const [reduceMotion, setReduceMotion] = useState(false);

	useEffect(() => {
		void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
		const subscription = AccessibilityInfo.addEventListener(
			'reduceMotionChanged',
			setReduceMotion,
		);
		return () => {
			subscription.remove();
		};
	}, []);

	return reduceMotion;
}
