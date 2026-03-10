'use strict';

const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// ── Create main window ────────────────────────────────────────────────────────
function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'VietTeamLarkPublisher',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Use app.getAppPath() for reliable asar-aware path resolution
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    win.loadFile(indexPath);

    // DEBUG: Uncomment to open DevTools and see console errors
    // win.webContents.openDevTools();
}

// ── Intercept /lark-api/ requests to bypass CORS ─────────────────────────────
// Replaces Vite dev proxy for the packaged Electron app.
// ONLY intercepts URLs containing "/lark-api/" — does NOT touch regular file:// loads.
function setupLarkProxy() {
    const LARK_TARGET = 'https://open.larksuite.com';
    const PREFIX = '/lark-api';

    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = details.url;
        // Only intercept if URL explicitly contains our proxy prefix
        const idx = url.indexOf(PREFIX);
        if (idx !== -1) {
            const rest = url.slice(idx + PREFIX.length);
            const redirectURL = `${LARK_TARGET}${rest}`;
            callback({ redirectURL });
        } else {
            callback({}); // pass through everything else unchanged
        }
    });

    // Inject permissive CORS headers on Lark API responses
    session.defaultSession.webRequest.onHeadersReceived(
        { urls: ['https://open.larksuite.com/*'] },
        (details, callback) => {
            const headers = { ...details.responseHeaders };
            headers['access-control-allow-origin'] = ['*'];
            headers['access-control-allow-methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
            headers['access-control-allow-headers'] = ['Content-Type, Authorization'];
            callback({ responseHeaders: headers });
        },
    );
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    setupLarkProxy();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
