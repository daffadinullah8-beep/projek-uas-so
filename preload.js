const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("noterraDesktop", {
  setHudMode(enabled) {
    ipcRenderer.send("noterra:set-hud-mode", enabled === true);
  }
});
