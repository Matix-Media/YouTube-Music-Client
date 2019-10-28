'use strict';
const DiscordRPC = require('discord-rpc');
const { app, BrowserWindow, Menu } = require('electron');
let reconnectTimer;

function executeJavaScript(code) {
	return new Promise(resolve => {
		win.webContents.executeJavaScript(code, resolve);
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
			e.split(':').reduce((acc, seconds) => (60 * acc) + +seconds)
		);

		result = await executeJavaScript('document.querySelector(\'paper-icon-button.play-pause-button\').title;');
		if (!result) return reject('Error grabbing time');
		paused = result !== 'Pause';

		return resolve({ title, artist, time, paused });
	});
}

const clientId = '633709502784602133';
DiscordRPC.register(clientId);

let rpc = new DiscordRPC.Client({ transport: 'ipc' });
let startTimestamp = new Date(),
	endTimestamp,
	prevSong;

async function setActivity() {
	if (!rpc || !win) {
		return;
	}

	// eslint-disable-next-line no-empty-function
	const { title, artist, time, paused } = await getContent().catch(() => {}) ||
		{
			title: undefined,
			artist: undefined,
			time: undefined,
			paused: undefined,
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
		state = `${artist[0]} • ${artist[1]} (${artist[2]})`;

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

rpc.on('ready', () => {
	setActivity();
	setInterval(setActivity, 15e3);
});

// eslint-disable-next-line no-console
rpc.login({ clientId }).catch(console.error);
