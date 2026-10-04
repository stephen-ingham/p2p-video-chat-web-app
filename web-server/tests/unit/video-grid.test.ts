import {describe, expect, it} from 'vitest';
import {gridShape} from '../../src/src/components/video-grid.tsx';

describe('gridShape', () => {
	it.each([
		[1, {cols: 1, rows: 1}],
		[2, {cols: 2, rows: 1}],
		[3, {cols: 2, rows: 2}],
		[4, {cols: 2, rows: 2}],
		[5, {cols: 3, rows: 2}],
		[6, {cols: 3, rows: 2}],
		[7, {cols: 3, rows: 3}],
	])('lays out %i participants as %o', (count, shape) => {
		expect(gridShape(count)).toEqual(shape);
	});
});
