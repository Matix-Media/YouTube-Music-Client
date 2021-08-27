"use strict";
const DiscordRPC = require("discord-rpc");
const { app, BrowserWindow, Menu, nativeImage, ipcMain } = require("electron");
const windowStateKeeper = require("electron-window-state");
const path = require("path");
const fs = require("fs");
const { clearInterval } = require("timers");

const dataPath = app.getPath("userData");
const generalConfigPath = path.join(dataPath, "config.json");
const boundaryConfigPath = path.join(dataPath, "bounds.json");

try {
    JSON.parse(fs.readFileSync(generalConfigPath));
} catch (ex) {
    fs.writeFileSync(generalConfigPath, JSON.stringify({}));
}

const config = JSON.parse(fs.readFileSync(generalConfigPath));
if (!config.continueWhereLeftOf || typeof config.continueWhereLeftOf !== "boolean")
    config.continueWhereLeftOf = false;
if (!config.continueURL || typeof config.continueURL !== "string")
    config.continueURL = "https://music.youtube.com/";

let reconnectTimer, injected;

const resourcePath = process.platform === "darwin" ? "Contents/Resources" : "resources";

function executeJavaScript(code) {
    return new Promise((resolve) => {
        win.webContents.executeJavaScript(code).then((data) => resolve(data));
    });
}

let win, settingsWin;
const menuTemplate = [
    {
        label: "Interface",
        submenu: [{ role: "Reload" }],
    },
];

if (process.platform === "darwin") {
    menuTemplate.unshift({});
}

function createSettingsWindow() {
    settingsWin = new BrowserWindow({
        width: 800,
        height: 700,
        title: `YouTube Music - Settings - v${require("../package.json").version}`,
        webPreferences: {
            preload: path.join(process.cwd(), "src", "preload.js"),
        },
    });
    settingsWin.setMinimumSize(300, 300);
    settingsWin.setResizable(true);
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
    settingsWin.setMenuBarVisibility(false);
}

function createWindow() {
    // Create the browser window.
    let winState = windowStateKeeper({
        defaultWidth: 1000,
        defaultHeight: 800,
    });

    win = new BrowserWindow({
        ...winState,
        title: `YouTube Music - v${require("../package.json").version}`,
        backgroundColor: "#000000",
        webPreferences: {
            preload: path.join(process.cwd(), "src", "preload.js"),
        },
    });
    winState.manage(win);
    win.setMinimumSize(300, 300);
    win.setResizable(true);
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
    win.setMenuBarVisibility(false);

    win.on("close", async () => {
        let tempInfo = await getContent().catch(() => null);
        // eslint-disable-next-line no-unused-vars
        const { time, paused } = tempInfo || {
            time: undefined,
            paused: undefined,
        };

        if (!config.continueWhereLeftOf) {
            config.continueURL = "https://music.youtube.com/";
        } else {
            config.continueURL = win.webContents.getURL();
            config.continueURL += `&autoplay=0&t=${time[0]}`;
        }

        console.log(config.continueURL);
        try {
            fs.writeFileSync(generalConfigPath, JSON.stringify(config, null, "\t"));
        } catch (e) {
            console.warn("Could not save continue config");
        }
    });
    win.on("closed", () => {
        win = null;
    });
    win.on("page-title-updated", (e, title) => {
        win.setTitle(`${title} - v${require("../package.json").version}`);
        e.preventDefault();
    });

    win.webContents.on("dom-ready", settingsHook);
    win.webContents.on("will-prevent-unload", (e) => e.preventDefault());

    win.loadURL(config.continueURL, {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:80.0) Gecko/20100101 Firefox/80.0",
        // eslint-disable-next-line max-len
        // Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36
    });

    // win.webContents.openDevTools();

    if (!config.continueWhereLeftOf) return;

    win.webContents.once("media-started-playing", async () => {
        await executeJavaScript(
            "document.querySelector('#play-pause-button > iron-icon').click();"
        );
    });
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
    fs.writeFileSync(generalConfigPath, JSON.stringify(config, null, "\t"));
    app.quit();
});
app.on("will-quit", () => {
    fs.writeFileSync(generalConfigPath, JSON.stringify(config, null, "\t"));
});

app.on("activate", () => {
    if (win === null) {
        createWindow();
    }
});

async function settingsHook() {
    if (injected) return;

    // eslint-disable-next-line max-len
    await executeJavaScript(
        fs
            .readFileSync(path.join(process.cwd(), "src", "settingsInjection.js"))
            .toString()
            .replaceAll("\r", "")
    );
    injected = true;
}

ipcMain.on("left-of-checked", (event, checked) => {
    console.log(checked);
    config.continueWhereLeftOf = checked;

    if (checked === false) {
        config.continueURL = "https://music.youtube.com/";
    }

    event.returnValue = undefined;
});

ipcMain.on("get-left-of-checked", (event) => {
    event.returnValue = config.continueWhereLeftOf;
});

ipcMain.on("settings-clicked", () => {
    createSettingsWindow();
});

function getContent() {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        let title, artist, timeMax, timeNow, paused, isFirst, result;

        // eslint-disable-next-line max-len
        result = await executeJavaScript(
            "document.querySelector('div.content-info-wrapper yt-formatted-string.title').title;"
        );
        if (!result) return reject("Error grabbing title");
        title = result;

        result = await executeJavaScript(
            "document.querySelector('span.subtitle yt-formatted-string.byline').title;"
        );
        if (!result) return reject("Error grabbing artist");
        artist = result.split(" • ");

        result = await executeJavaScript(
            "document.querySelector('#progress-bar').getAttribute('aria-valuemax');"
        );
        if (!result) return reject("Error grabbing time max");
        timeMax = result;

        result = await executeJavaScript(
            "document.querySelector('#progress-bar').getAttribute('aria-valuenow');"
        );
        if (!result) return reject("Error grabbing time now");
        timeNow = result;

        result = await executeJavaScript("document.querySelector('#play-pause-button').title;");
        if (!result) return reject("Error grabbing play status");
        paused = result !== "Pause";

        result = await executeJavaScript(
            "document.querySelector('div.ytmusic-player-queue').firstElementChild.selected"
        );
        isFirst = result;

        return resolve({ title, artist, time: [timeNow, timeMax], paused, isFirst });
    });
}

const clientId = "633709502784602133";
DiscordRPC.register(clientId);

let rpc = new DiscordRPC.Client({ transport: "ipc" });
let startTimestamp = new Date(),
    endTimestamp,
    prevSong;

let songInfo;

function setActivity() {
    if (!rpc || !win) {
        return;
    }

    // eslint-disable-next-line no-empty-function
    const { title, artist, time, paused } = songInfo || {
        title: undefined,
        artist: undefined,
        time: undefined,
        paused: undefined,
        isFirst: undefined,
    };
    const now = new Date();

    let details, state, smallImageKey, smallImageText;

    if (!title && !artist) {
        details = "Browsing";
        smallImageKey = undefined;
        smallImageText = "Browsing";
    } else {
        startTimestamp = now - time[0] * 1000;
        endTimestamp = startTimestamp + time[1] * 1000;
        details = title;
        state = `${artist[0] || "Unknown"} • ${artist[1] || "Unknown"} (${artist[2] || "Unknown"})`;

        if (paused) {
            smallImageKey = "pause";
            smallImageText = "Paused";
        } else if (prevSong !== { title, artist }) {
            prevSong = { title, artist };

            smallImageKey = "play";
            smallImageText = "Listening";
        }
    }

    const activity = {
        details,
        state,
        startTimestamp,
        largeImageKey: "youtube-music-logo",
        largeImageText: "YouTube Music",
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
    const { title, artist, paused, isFirst } = songInfo || {
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
            tooltip: "Previous Song",
            icon: getNativeImage("assets/images/prev.png"),
            async click() {
                await executeJavaScript(
                    "document.querySelector('tp-yt-paper-icon-button.previous-button').click();"
                );
            },
        },
        {
            tooltip: "Play",
            icon: getNativeImage("assets/images/play.png"),
            async click() {
                await executeJavaScript(
                    "document.querySelector('tp-yt-paper-icon-button.play-pause-button').click();"
                );
            },
        },
        {
            tooltip: "Next Song",
            icon: getNativeImage("assets/images/next.png"),
            async click() {
                await executeJavaScript(
                    "document.querySelector('tp-yt-paper-icon-button.next-button').click();"
                );
            },
        },
    ];

    if (!title && !artist) {
        win.setOverlayIcon(null, "Browsing");
    } else if (process.platform === "win32") {
        if (isFirst) {
            toolTipButtons[0].flags = ["disabled"];
        }

        if (paused) {
            win.setOverlayIcon(getNativeImage("assets/images/pause.png"), "Paused");
            win.setThumbarButtons(toolTipButtons);
        } else if (prevSong !== { title, artist }) {
            prevSong = { title, artist };
            win.setOverlayIcon(getNativeImage("assets/images/play.png"), "Listening");

            toolTipButtons[1].tooltip = "Pause";
            toolTipButtons[1].icon = getNativeImage("assets/images/pause.png");

            win.setThumbarButtons(toolTipButtons);
        }
    }
}

rpc.once("disconnected", () => {
    rpc = null;
    reconnectTimer = setInterval(reconnect, 5e3);
});

function reconnect() {
    rpc = new DiscordRPC.Client({ transport: "ipc" });
    DiscordRPC.register(clientId);
    rpc.login({ clientId })
        .then(() => {
            clearInterval(reconnectTimer);
        })
        .catch((err) => {
            rpc = null;
            console.error(err);
        });
}

function getNativeImage(filePath) {
    return nativeImage.createFromPath(path.join(process.cwd(), resourcePath, filePath));
}

rpc.on("ready", () => {
    setTimeout(() => {
        setActivity();
        setInterval(setActivity, 15e3);
        setInterval(updateSongInfo, 1e3);
    }, 1000);
});

// eslint-disable-next-line no-console
rpc.login({ clientId }).catch(console.error);
