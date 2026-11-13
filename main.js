const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { execFile, execFileSync, spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const DEFAULT_PORT = 5130;
const SHUTDOWN_GRACE_MS = 1200;

let backend = null;
let backendPort = null;
let backendStopPromise = null;
let quitting = false;
let mainWindow = null;
const backendLogs = [];

function canBindPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", error => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
      } else {
        reject(error);
      }
    });
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(error => error ? reject(error) : resolve(true));
    });
  });
}

async function findFreePort() {
  if (await canBindPort(DEFAULT_PORT)) return DEFAULT_PORT;

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Tidak dapat membaca port backend yang tersedia.")));
        return;
      }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function backendUrl(port) {
  return `http://127.0.0.1:${port}/`;
}

function appUrl(port) {
  const url = backendUrl(port);
  return process.env.NOTERRA_DEMO_MODE === "1" ? `${url}?mock=1` : url;
}

function getBackendLogPath() {
  const logDir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (_) {}
  }
  return path.join(logDir, "backend.log");
}

function recordBackendLog(source, rawData) {
  const text = rawData ? rawData.toString() : "";
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const timestamp = new Date().toISOString();
  const logFile = getBackendLogPath();

  for (const line of lines) {
    const entry = `[${timestamp}] [${source}] ${line}`;
    backendLogs.push(entry);
    if (backendLogs.length > 200) {
      backendLogs.shift();
    }
    try {
      fs.appendFileSync(logFile, entry + "\n", "utf8");
    } catch (_) {}
  }
}

function getRecentErrorSnippet() {
  const errorLogs = backendLogs.filter(l => l.includes("[STDERR]") || l.includes("[ERROR]"));
  const target = errorLogs.length > 0 ? errorLogs : backendLogs;
  if (target.length === 0) return "(tidak ada output error tercatat dari proses backend)";
  return target.slice(-15).join("\n");
}

ipcMain.on("noterra:set-hud-mode", (event, enabled) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  const isHud = enabled === true;
  mainWindow.setAlwaysOnTop(isHud);
  mainWindow.setBackgroundColor(isHud ? "#00000000" : "#121212");
});

function findProjectRoot() {
  const candidates = [
    app.getAppPath(),
    path.join(app.getAppPath(), "Lovelace"),
    path.resolve(__dirname),
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

function startBackend(root, port) {
  if (backend && backend.exitCode === null) return backend;

  let command;
  let args;
  const env = { ...process.env };

  if (app.isPackaged) {
    command = path.join(
      process.resourcesPath,
      "backend",
      process.platform === "win32" ? "aether-backend.exe" : "aether-backend"
    );
    args = [];

    if (process.platform !== "win32") {
      fs.accessSync(command, fs.constants.X_OK);
    }

    env.AETHER_SERVER_DIR = path.join(root, "server");
    env.AETHER_LOG_DIR = path.join(app.getPath("userData"), "logs");
  } else {
    const python = pythonCommand(root);
    command = python.command;
    args = [
      ...python.prefix,
      path.join(root, "server", "server.py")
    ];
  }

  env.AETHER_PORT = String(port);
  backend = spawn(command, args, {
    cwd: root,
    env: { ...env, PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32"
  });
  const child = backend;
  backendPort = port;

  recordBackendLog("SYSTEM", `Menjalankan backend: ${command} ${args.join(" ")}`);

  backend.stdout.on("data", (data) => {
    console.log(`[Aether OS backend] ${data.toString().trimEnd()}`);
    recordBackendLog("STDOUT", data);
  });
  backend.stderr.on("data", (data) => {
    console.error(`[Aether OS backend] ${data.toString().trimEnd()}`);
    recordBackendLog("STDERR", data);
  });
  backend.on("error", (error) => {
    console.error("Gagal menjalankan Python backend:", error);
    recordBackendLog("ERROR", error.stack || error.message);
  });
  backend.on("exit", (code, signal) => {
    const exitMsg = `Aether OS backend berhenti (code=${code}, signal=${signal}).`;
    console.log(exitMsg);
    recordBackendLog("SYSTEM", exitMsg);
    if (backend === child) {
      backend = null;
      backendPort = null;
    }
  });
  return backend;
}

function waitForBackend(child, port, timeoutMs = 30000) {
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
    const onError = (error) => {
      const logFile = getBackendLogPath();
      const snippet = getRecentErrorSnippet();
      finish(new Error(`Gagal menjalankan proses backend:\n${error.message}\n\nPesan Error Terakhir:\n${snippet}\n\nLog lengkap tersimpan di:\n${logFile}`));
    };
    const onExit = (code, signal) => {
      const logFile = getBackendLogPath();
      const snippet = getRecentErrorSnippet();
      finish(new Error(`Backend berhenti sebelum siap (code=${code}, signal=${signal}).\n\nPesan Error Terakhir:\n${snippet}\n\nLog lengkap tersimpan di:\n${logFile}`));
    };

    child.once("error", onError);
    child.once("exit", onExit);

    const probe = () => {
      if (settled) return;
      const request = http.get(`${backendUrl(port)}api/health`, response => {
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
        const logFile = getBackendLogPath();
        const snippet = getRecentErrorSnippet();
        finish(new Error(`Backend tidak siap setelah ${timeoutMs / 1000} detik.\n\nPesan Error Terakhir:\n${snippet}\n\nLog lengkap tersimpan di:\n${logFile}`));
        return;
      }
      timer = setTimeout(probe, 300);
    };

    probe();
  });
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = exited => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

function delay(timeoutMs) {
  return new Promise(resolve => setTimeout(resolve, timeoutMs));
}

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

async function waitForProcessGroupExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(pid) && Date.now() < deadline) {
    await delay(50);
  }
  return !processGroupExists(pid);
}

function taskkillProcessTree(pid) {
  return new Promise((resolve, reject) => {
    execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
        } else {
          resolve();
        }
      });
  });
}

async function stopWindowsBackend(child) {
  try {
    await taskkillProcessTree(child.pid);
  } catch (error) {
    if (!await waitForChildExit(child, 500)) {
      child.kill();
      await waitForChildExit(child, 2000);
      throw new Error(`taskkill gagal menghentikan backend: ${error.message}`);
    }
  }
  if (!await waitForChildExit(child, 3000)) {
    child.kill();
    if (!await waitForChildExit(child, 2000)) {
      throw new Error(`Backend PID ${child.pid} tidak berhenti setelah taskkill.`);
    }
  }
}

async function stopUnixBackend(child) {
  signalProcessGroup(child.pid, "SIGTERM");
  await waitForProcessGroupExit(child.pid, SHUTDOWN_GRACE_MS);
  if (processGroupExists(child.pid)) {
    signalProcessGroup(child.pid, "SIGKILL");
  }
  const [childExited, groupExited] = await Promise.all([
    waitForChildExit(child, 3000),
    waitForProcessGroupExit(child.pid, 3000)
  ]);
  if (!childExited || !groupExited) {
    throw new Error(`Process backend atau child process group ${child.pid} tidak berhenti.`);
  }
}

function stopBackend() {
  if (backendStopPromise) return backendStopPromise;
  if (!backend) return Promise.resolve();

  const child = backend;
  backend = null;
  backendPort = null;
  backendStopPromise = (async () => {
    if (!child.pid) return;
    recordBackendLog("SYSTEM", `Menghentikan backend PID ${child.pid} dan child process.`);
    if (process.platform === "win32") {
      await stopWindowsBackend(child);
    } else {
      await stopUnixBackend(child);
    }
    recordBackendLog("SYSTEM", `Backend PID ${child.pid} beserta process group berhenti.`);
  })().catch(error => {
    recordBackendLog("ERROR", `Gagal menghentikan backend: ${error.message}`);
    throw error;
  }).finally(() => {
    backendStopPromise = null;
  });
  return backendStopPromise;
}

async function createWindow(root, port) {
  const iconPath = process.platform === "win32"
    ? path.join(root, "assets", "icon.ico")
    : path.join(root, "assets", "icon.png");

  const win = new BrowserWindow({
    title: "Aether OS - Performance Monitor",
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    transparent: true,
    backgroundColor: "#121212",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(root, "preload.js")
    }
  });
  mainWindow = win;
  win.setMenuBarVisibility(false);
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  await win.loadURL(appUrl(port));
}

async function startBackendAndWindow() {
  if (backendStopPromise) await backendStopPromise;
  const root = findProjectRoot();
  let child = backend;
  let port = backendPort;
  if (!child || child.exitCode !== null) {
    port = await findFreePort();
    child = startBackend(root, port);
  }
  await waitForBackend(child, port);
  await createWindow(root, port);
}

app.whenReady().then(async () => {
  try {
    await startBackendAndWindow();
  } catch (error) {
    console.error("Aether OS desktop gagal dimulai:", error);
    dialog.showErrorBox("Aether OS", error.message);
    try {
      await stopBackend();
    } catch (stopError) {
      console.error("Gagal membersihkan backend saat startup gagal:", stopError);
    }
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length !== 0) return;
  try {
    await startBackendAndWindow();
  } catch (error) {
    console.error("Aether OS desktop gagal dibuka kembali:", error);
    dialog.showErrorBox("Aether OS", error.message);
    try {
      await stopBackend();
    } catch (stopError) {
      console.error("Gagal membersihkan backend setelah gagal membuka jendela:", stopError);
    }
  }
});

app.on("before-quit", event => {
  if (quitting || (!backend && !backendStopPromise)) return;
  event.preventDefault();
  quitting = true;
  stopBackend().catch(error => {
    console.error("Gagal menghentikan backend saat aplikasi ditutup:", error);
  }).finally(() => app.quit());
});
