/* eslint-disable unicorn/prefer-module -- Expo loads metro.config.js as CommonJS */
const path = require('node:path');
const {getDefaultConfig} = require('expo/metro-config');

// The app imports the shared palette from colors.json in the repo root (also
// used by web-server/), which is outside this project, so Metro has to watch
// the repo root. Everything else up there is blocked, so Metro doesn't crawl
// the web app, API or their node_modules.
const config = getDefaultConfig(__dirname);
const repoRoot = path.resolve(__dirname, '..');

// Node-only (Metro config), so the `v` flag Hermes rejects is fine here.
const escapeRegExp = (text) =>
	text.replaceAll(/[\^$\\.*+?\(\)\[\]\{\}\|\/]/gv, String.raw`\$&`);
// No flags: Expo merges every blockList pattern into one and rejects patterns
// whose flags differ from its own (none).
// eslint-disable-next-line require-unicode-regexp
const outsideAppExceptColors = new RegExp(
	String.raw`^${escapeRegExp(repoRoot + path.sep)}(?!mobile-app(?:\\|\/)|colors\.json$)`,
);

config.watchFolders = [...config.watchFolders, repoRoot];
config.resolver.blockList = [
	...[config.resolver.blockList ?? []].flat(),
	outsideAppExceptColors,
];

module.exports = config;
