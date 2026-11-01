const { app, BrowserWindow, dialog } = require("electron");
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = 5130;
const URL = `http://127.0.0.1:${PORT}/`;
const APP_URL = process.platform === "win32" ? `${URL}?mock=1` : URL;

let backend = null;
let mainWindow = null;

function findProjectRoot() {
  const candidates = [
    app.getAppPath(),
    path.join(app.getAppPath(), "Lovelace"),
    path.resolve(__dirname, "Lovelace"),
    path.resolve(__dirname, "..", "Lovelace")
  ];
  const root = candidates.find(candidate =>
    fs.existsSync(path.join(candidate, "server", "server.py")) &&
    fs.existsSync(path.join(candidate, "web", "index.html"))
  );
  if (!root) {
    throw new Error("Tidak menemukan server/server.py dan web/index.html.");
  }
  return root;
}

function pythonCommand(root) {
  if (process.env.NOTERRA_PYTHON) {
    return { command: process.env.NOTERRA_PYTHON, prefix: [] };
  }

  const venvPython = process.platform === "win32"
    ? path.join(root, "server", ".venv", "Scripts", "python.exe")
    : path.join(root, "server", ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) {
    return { command: venvPython, prefix: [] };
  }

  if (process.platform === "win32") {
    try {
      const interpreter = execFileSync("py", [
        "-3",
        "-c",
        "import sys; print(sys.executable)"
      ], { encoding: "utf8", windowsHide: true }).trim();
      if (interpreter && fs.existsSync(interpreter)) {
        return { command: interpreter, prefix: [] };
      }
    } catch (error) {
      console.warn("Python launcher py -3 tidak tersedia:", error.message);
    }
  }

  return {
    command: process.platform === "win32" ? "python" : "python3",
    prefix: []
  };
}

function startBackend(root) {
  if (backend && backend.exitCode === null) return backend;

  const python = pythonCommand(root);
  backend = spawn(python.command, [
    ...python.prefix,
    path.join(root, "server", "server.py")
  ], {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  backend.stdout.on("data", data => console.log(`[noterra backend] ${data.toString().trimEnd()}`));
  backend.stderr.on("data", data => console.error(`[noterra backend] ${data.toString().trimEnd()}`));
  backend.on("error", error => console.error("Gagal menjalankan Python backend:", error));
  backend.on("exit", (code, signal) => {
    console.log(`Noterra backend berhenti (code=${code}, signal=${signal}).`);
    backend = null;
  });
  return backend;
}

function waitForBackend(child, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let settled = false;
    let timer;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      error ? reject(error) : resolve();
    };
    const onError = error => finish(error);
    const onExit = (code, signal) =>
      finish(new Error(`Backend berhenti sebelum siap (code=${code}, signal=${signal}).`));

    child.once("error", onError);
    child.once("exit", onExit);

    const probe = () => {
      if (settled) return;
      const request = http.get(URL, response => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          finish();
          return;
        }
        retry();
      });
      request.setTimeout(1000, () => request.destroy());
      request.on("error", retry);
    };
    const retry = () => {
      if (settled) return;
      if (Date.now() - started >= timeoutMs) {
        finish(new Error(`Backend tidak siap setelah ${timeoutMs / 1000} detik.`));
        return;
      }
      timer = setTimeout(probe, 300);
    };

    probe();
  });
}

function stopBackend() {
  if (!backend) return;
  const child = backend;
  backend = null;
  if (child.exitCode === null && !child.killed) child.kill();
}

async function createWindow(root) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  await win.loadURL(APP_URL);
}

app.whenReady().then(async () => {
  try {
    const root = findProjectRoot();
    const child = startBackend(root);
    await waitForBackend(child);
    await createWindow(root);
  } catch (error) {
    console.error("Noterra desktop gagal dimulai:", error);
    dialog.showErrorBox("Noterra OS", error.message);
    stopBackend();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length !== 0) return;
  try {
    const root = findProjectRoot();
    const child = startBackend(root);
    await waitForBackend(child);
    await createWindow(root);
  } catch (error) {
    console.error("Noterra desktop gagal dibuka kembali:", error);
    dialog.showErrorBox("Noterra OS", error.message);
    stopBackend();
  }
});

app.on("before-quit", stopBackend);
