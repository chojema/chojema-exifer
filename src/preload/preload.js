const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  pathForFile: (file) => webUtils.getPathForFile(file),
  pickFile: call('pick-file'),
  read: call('read'),
  planDates: call('plan-dates'),
  localOffset: call('local-offset'),
  saveEdits: call('save-edits'),
  copyExif: call('copy-exif'),
  showInFolder: call('show-in-folder'),
});
