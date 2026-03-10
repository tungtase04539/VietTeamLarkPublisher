'use strict';
// Minimal preload — contextBridge not needed as we use fetch() directly
// but kept here for future extensibility
const { contextBridge } = require('electron');

// Expose app version to renderer if needed
contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    version: process.versions.electron,
});
