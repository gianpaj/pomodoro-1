'use strict';
const { globalShortcut, ipcMain, dialog } = require('electron');
const { menubar } = require('menubar');
const Stopwatch = require('timer-stopwatch-dev');
const Hrt = require('human-readable-time');
const fs = require('fs');
const windowStateKeeper = require('electron-window-state');

const path = require('path');
const AutoLaunch = require('auto-launch');

let timeFormat = new Hrt('%mm%:%ss%');
const millisecondsInAMinute = 60 * 1000;
let workTimer = 0.2 * millisecondsInAMinute; // 25 mins
let relaxTimer = 0.1 * millisecondsInAMinute; // 5 mins
let longRelaxTimer = 15 * millisecondsInAMinute; // 15 mins
let pomodoroCount = 0;
let isRelaxTime = false;
let showTimer = true;
let launchOnStartup = false;
let icon
	= process.platform === 'darwin'
		? '/src/img/IconTemplate.png'
		: '/src/img/winIcon.png';
let windowState;

let mb = menubar({
	dir: path.join(__dirname, '/src'),
	preloadWindow: true,
	tooltip: 'Pomodoro timer',
	browserWindow: {
		height: 330,
		width: 340,
		webPreferences: {
			nodeIntegration: true
		}
	},
  icon: path.join(__dirname, icon)
});

mb.app.allowRendererProcessReuse = true;

let autolauncher = new AutoLaunch({ name: 'Pomodoro',
mac: { useLaunchAgent: true } });

getConfig();

global.timer = new Stopwatch(workTimer);
global.isRelaxTime = isRelaxTime;

process.on('uncaughtException', (err) => {
	console.log(err.stack); // eslint-disable-line no-console
	dialog.showErrorBox('Uncaught Exception: ' + err.message, err.stack || '');
	mb.app.quit();
});

mb.app.on('will-quit', () => {
	globalShortcut.unregisterAll();
	global.timer.stop();
});

mb.app.on('quit', () => {
	mb = null;
});

mb.on('ready', () => {
	windowState = windowStateKeeper();
	windowState.manage(mb.window);
});

mb.on('after-show', () => {
	if (
		windowState
		&& typeof windowState.x === 'number'
		&& typeof windowState.y === 'number'
	) {
		mb.window.setPosition(windowState.x, windowState.y, false);
	}
});

global.timer.onTime(function(time) {
	if (showTimer) {
		if (
			time.ms !== workTimer
			|| time.ms !== relaxTimer
			|| time.ms !== longRelaxTimer
		) {
			mb.tray.setTitle(timeFormat(new Date(time.ms)));
		}
	} else {
		mb.tray.setTitle('');
	}

	mb.window.webContents.send('update-timer', getProgress());
});

global.timer.onDone(function() {
	mb.window.webContents.send('end-timer');

	if (isRelaxTime) {
		isRelaxTime = false;
		global.timer.reset(workTimer);
	} else {
		isRelaxTime = true;
		pomodoroCount++;
		if (pomodoroCount % 4 === 0) {
			global.timer.reset(longRelaxTimer);
		} else {
			global.timer.reset(relaxTimer);
		}
	}

	global.isRelaxTime = isRelaxTime;
	global.pomodoroCount = pomodoroCount;
});

ipcMain.on('reset-timer', function() {
	global.timer.reset(workTimer);
	mb.tray.setTitle('');
	global.progress = getProgress();
	mb.window.webContents.send('update-timer', 0);
});

ipcMain.on('toggle-timer', function() {
	global.timer.startstop();
	mb.window.webContents.send('update-timer', getProgress());
	if (global.timer.isStopped()) mb.tray.setTitle('Paused');
});

ipcMain.on('settings-updated', function() {
	getConfig();

	mb.window.webContents.send('update-timer', getProgress());
});

ipcMain.on('request-config', function(event) {
	getConfig();

	event.returnValue = {
		workTimer: workTimer / 60 / 1000,
		relaxTimer: relaxTimer / 60 / 1000,
		longRelaxTimer: longRelaxTimer / 60 / 1000,
		showTimer: showTimer,
		launchOnStartup: launchOnStartup
	};
});

ipcMain.on('quit', function() {
	mb.app.quit();
});

function getConfig() {
	try {
		let dataPath = path.join(mb.app.getPath('userData'), 'config.json');
		let data = JSON.parse(fs.readFileSync(dataPath));

		workTimer = data.workTimer * 60 * 1000;
		relaxTimer = data.relaxTimer * 60 * 1000;
		longRelaxTimer = data.longRelaxTimer * 60 * 1000;
		showTimer = data.showTimer;
		launchOnStartup = data.launchOnStartup;

		(launchOnStartup ? autolauncher.enable() : autolauncher.disable()).catch(
			function(err) {
				dialog.showErrorBox(
					'Error on adding launch on startup functionality',
					`Error: ${err}`
				);
			}
		);
	} catch (err) {
		console.log('Didn\'t find previous config. Using default settings'); // eslint-disable-line no-console
	}
}

function getProgress() {
	let progress, max;

	if (isRelaxTime) {
		if (pomodoroCount % 4 === 0) {
			max = longRelaxTimer;
		} else {
			max = relaxTimer;
		}
	} else {
		max = workTimer;
	}

	progress = ((max - global.timer.ms) / (max / 100)) * 0.01;

	if (progress < 0) {
		progress = 0.01;
	}
	return progress;
}
