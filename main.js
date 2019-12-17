'use strict';
const DiscordRPC = require('discord-rpc');
const { app, BrowserWindow, Menu, nativeImage } = require('electron');
const path = require('path');
let reconnectTimer;

const resourcePath = process.platform === 'darwin' ? 'Contents/Resources' : 'resources';

function executeJavaScript(code) {
	return new Promise(resolve => {
		win.webContents.executeJavaScript(code).then(data => resolve(data));
	});
}

let win;
const menuTemplate = [
	{
		label: 'Interface',
		submenu: [
			{ role: 'Reload' },
		],
	},
];

if (process.platform === 'darwin') {
	menuTemplate.unshift({});
}

function createWindow() {
	// Create the browser window.
	win = new BrowserWindow({ width: 800, height: 700 });
	win.setMinimumSize(300, 300);
	win.setSize(800, 700);
	win.setResizable(true);
	const menu = Menu.buildFromTemplate(menuTemplate);
	Menu.setApplicationMenu(menu);
	win.setMenuBarVisibility(false);
	win.loadURL('https://music.youtube.com/');
	win.on('closed', () => {
		win = null;
	});
	win.on('page-title-updated', (e, title) => {
		win.setTitle(`${title} - v${require('./package.json').version}`);
		e.preventDefault();
	});
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
	app.quit();
});

app.on('activate', () => {
	if (win === null) {
		createWindow();
	}
});

function getContent() {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (resolve, reject) => {
		let title,
			artist,
			time,
			paused,
			isFirst,
			result;

		result =
			await executeJavaScript('document.querySelector(\'div.content-info-wrapper yt-formatted-string.title\').title;');
		if (!result) return reject('Error grabbing title');
		title = result;

		result = await executeJavaScript('document.querySelector(\'span.subtitle yt-formatted-string.byline\').title;');
		if (!result) return reject('Error grabbing artist');
		artist = result.split(' • ');

		result = await executeJavaScript('document.querySelector(\'span.time-info\').textContent;');
		if (!result) return reject('Error grabbing time');
		time = result.replace(/\s{1,}/g, '').split('/').map(e =>
			e.split(':').map(el => Number(el)).reverse()
				// eslint-disable-next-line comma-dangle
				.reduce((acc, cur, idx) => acc + (cur * getMultiplier(idx)))
		);

		result = await executeJavaScript('document.querySelector(\'paper-icon-button.play-pause-button\').title;');
		if (!result) return reject('Error grabbing time');
		paused = result !== 'Pause';

		result = await executeJavaScript('document.querySelector(\'div.ytmusic-player-queue\').firstElementChild.selected');
		isFirst = result;

		return resolve({ title, artist, time, paused, isFirst });
	});
}

const clientId = '633709502784602133';
DiscordRPC.register(clientId);

let rpc = new DiscordRPC.Client({ transport: 'ipc' });
let startTimestamp = new Date(),
	endTimestamp,
	prevSong;

let songInfo;

function setActivity() {
	if (!rpc || !win) {
		return;
	}

	// eslint-disable-next-line no-empty-function
	const { title, artist, time, paused } = songInfo ||
		{
			title: undefined,
			artist: undefined,
			time: undefined,
			paused: undefined,
			isFirst: undefined,
		};
	const now = new Date();

	let details,
		state,
		smallImageKey,
		smallImageText;

	if (!title && !artist) {
		details = 'Browsing';
		smallImageKey = undefined;
		smallImageText = 'Browsing';
	} else {
		startTimestamp = now - (time[0] * 1000);
		endTimestamp = startTimestamp + (time[1] * 1000);
		details = title;
		state = `${artist[0] || 'Unknown'} • ${artist[1] || 'Unknown'} (${artist[2] || 'Unknown'})`;

		if (paused) {
			smallImageKey = 'pause';
			smallImageText = 'Paused';
		} else 	if (prevSong !== { title, artist }) {
			prevSong = { title, artist };

			smallImageKey = 'play';
			smallImageText = 'Listening';
		}
	}

	const activity = {
		details,
		state,
		startTimestamp,
		largeImageKey: 'youtube-music-logo',
		largeImageText: 'YouTube Music',
		smallImageKey,
		smallImageText,
		instance: false,
	};

	if (endTimestamp) activity.endTimestamp = endTimestamp;

	rpc.setActivity(activity);
}


async function updateSongInfo() {
	if (!rpc || !win) {
		return;
	}

	songInfo = await getContent().catch(() => null);

	// eslint-disable-next-line no-empty-function
	const { title, artist, time, paused, isFirst } = songInfo ||
		{
			title: undefined,
			artist: undefined,
			time: undefined,
			paused: undefined,
			isFirst: undefined,
		};

	win.setThumbnailClip({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
	});

	const toolTipButtons = [
		{
			tooltip: 'Previous Song',
			icon: getNativeImage('assets/images/prev.png'),
			async click() {
				await executeJavaScript('document.querySelector(\'paper-icon-button.previous-button\').click();');
			},
		}, {
			tooltip: 'Play',
			icon: getNativeImage('assets/images/play.png'),
			async click() {
				await executeJavaScript('document.querySelector(\'paper-icon-button.play-pause-button\').click();');
			},
		}, {
			tooltip: 'Next Song',
			icon: getNativeImage('assets/images/next.png'),
			async click() {
				await executeJavaScript('document.querySelector(\'paper-icon-button.next-button\').click();');
			},
		},
	];

	if (!title && !artist) {
		if (process.platform === 'win32') {
			win.setProgressBar(1.000000001);
		}
		win.setOverlayIcon(null, 'Browsing');
	} else if (process.platform === 'win32') {
		win.setProgressBar(time[0] / time[1], {
			mode: paused ? 'paused' : 'normal',
		});

		if (isFirst) {
			toolTipButtons[0].flags = ['disabled'];
		}

		if (paused) {
			win.setOverlayIcon(getNativeImage('assets/images/pause.png'), 'Paused');
			win.setThumbarButtons(toolTipButtons);
		} else 	if (prevSong !== { title, artist }) {
			prevSong = { title, artist };
			win.setOverlayIcon(getNativeImage('assets/images/play.png'), 'Listening');

			toolTipButtons[1].tooltip = 'Pause';
			toolTipButtons[1].icon = getNativeImage('assets/images/pause.png');

			win.setThumbarButtons(toolTipButtons);
		}
	} else {
		win.setProgressBar(time[0] / time[1]);
	}
}

rpc.once('disconnected', () => {
	rpc = null;
	reconnectTimer = setInterval(reconnect, 5e3);
});

function reconnect() {
	rpc = new DiscordRPC.Client({ transport: 'ipc' });
	DiscordRPC.register(clientId);
	rpc.login({ clientId }).then(() => {
		clearInterval(reconnectTimer);
	}).catch(err => {
		rpc = null;
		console.error(err);
	});
}

function getNativeImage(filePath) {
	return nativeImage.createFromPath(path.join(process.cwd(), resourcePath, filePath));
}

const secondsTimeTable = [
	1,
	60,
	60,
];

function getMultiplier(index, accumulator = 1) {
	return index === 0 ? accumulator * secondsTimeTable[index] :
		getMultiplier(index - 1, accumulator * secondsTimeTable[index]);
}

rpc.on('ready', () => {
	setActivity();
	setInterval(setActivity, 15e3);
	setInterval(updateSongInfo, 250);
});

// eslint-disable-next-line no-console
rpc.login({ clientId }).catch(console.error);
