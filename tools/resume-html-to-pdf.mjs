#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import net from "node:net";

const A4 = {
  widthInches: 8.2677165354,
  heightInches: 11.6929133858,
};

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`Usage:
  node tools/resume-html-to-pdf.mjs <input.html> [output.pdf] [options]

Options:
  --chrome <path>       Chrome or Chromium executable path.
  --timeout <ms>        Page render timeout. Default: 30000.
  --scale <number>      PDF scale. Default: 1.
  --letter              Use US Letter instead of A4.
  --margin <inches>     Set all PDF page margins. Default: 0.
  --margin-top <inches>
  --margin-right <inches>
  --margin-bottom <inches>
  --margin-left <inches>

Requires Node 22+ and a local Chrome or Chromium install.

Examples:
  node tools/resume-html-to-pdf.mjs resume-quyen-vuong.html
  node tools/resume-html-to-pdf.mjs resume.html resume.pdf --scale 0.98
  node tools/resume-html-to-pdf.mjs resume.html resume.pdf --margin-top 0.3 --margin-bottom 0.3
`);
  process.exit(exitCode);
}

function parseMargin(value, optionName) {
  const margin = Number(value);
  if (!Number.isFinite(margin) || margin < 0 || margin > 2) {
    throw new Error(`${optionName} must be a number between 0 and 2 inches`);
  }
  return margin;
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    timeoutMs: 30000,
    scale: 1,
    paper: A4,
    preferCssPageSize: true,
    margins: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    chromePath: process.env.CHROME_PATH || "",
  };
  const positional = [];

  while (args.length) {
    const arg = args.shift();
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--chrome") {
      options.chromePath = args.shift() || "";
      continue;
    }
    if (arg === "--timeout") {
      options.timeoutMs = Number(args.shift());
      continue;
    }
    if (arg === "--scale") {
      options.scale = Number(args.shift());
      continue;
    }
    if (arg === "--letter") {
      options.paper = { widthInches: 8.5, heightInches: 11 };
      options.preferCssPageSize = false;
      continue;
    }
    if (arg === "--margin") {
      const margin = parseMargin(args.shift(), "--margin");
      options.margins = {
        top: margin,
        right: margin,
        bottom: margin,
        left: margin,
      };
      continue;
    }
    if (arg === "--margin-top") {
      options.margins.top = parseMargin(args.shift(), "--margin-top");
      continue;
    }
    if (arg === "--margin-right") {
      options.margins.right = parseMargin(args.shift(), "--margin-right");
      continue;
    }
    if (arg === "--margin-bottom") {
      options.margins.bottom = parseMargin(args.shift(), "--margin-bottom");
      continue;
    }
    if (arg === "--margin-left") {
      options.margins.left = parseMargin(args.shift(), "--margin-left");
      continue;
    }
    if (arg?.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  if (!positional[0]) usage(1);
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error("--timeout must be a number >= 1000");
  }
  if (!Number.isFinite(options.scale) || options.scale <= 0 || options.scale > 2) {
    throw new Error("--scale must be a number > 0 and <= 2");
  }

  const inputPath = path.resolve(positional[0]);
  const outputPath = path.resolve(
    positional[1] || inputPath.replace(/\.html?$/i, "") + ".pdf",
  );
  return { inputPath, outputPath, options };
}

function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      "Chrome/Chromium was not found. Install Chrome or pass --chrome <path>.",
    );
  }
  return found;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Chrome DevTools: ${lastError?.message || ""}`);
}

function sendCdp(socket, method, params = {}) {
  socket.nextId += 1;
  const id = socket.nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    socket.pending.set(id, { resolve, reject });
  });
}

function connectCdp(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    socket.nextId = 0;
    socket.pending = new Map();
    socket.events = new EventTarget();

    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP WebSocket failed")), {
      once: true,
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = socket.pending.get(message.id);
        if (!pending) return;
        socket.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result || {});
        }
        return;
      }
      socket.events.dispatchEvent(new CustomEvent(message.method, { detail: message.params }));
    });
  });
}

function waitForEvent(socket, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.events.removeEventListener(eventName, listener);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    const listener = (event) => {
      clearTimeout(timeout);
      resolve(event.detail);
    };
    socket.events.addEventListener(eventName, listener, { once: true });
  });
}

async function waitForPageReady(sendPage, timeoutMs) {
  await sendPage("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve) => {
      const done = async () => {
        try {
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
          const images = Array.from(document.images || []);
          await Promise.all(images.map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise((imageDone) => {
              img.addEventListener("load", imageDone, { once: true });
              img.addEventListener("error", imageDone, { once: true });
            });
          }));
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        } catch (_) {
          resolve();
        }
      };
      if (document.readyState === "complete") done();
      else window.addEventListener("load", done, { once: true });
    })`,
    timeout: timeoutMs,
  });
}

function pageSizeName(options) {
  if (
    options.paper.widthInches === A4.widthInches &&
    options.paper.heightInches === A4.heightInches
  ) {
    return "A4";
  }
  return `${options.paper.widthInches}in ${options.paper.heightInches}in`;
}

async function applyPrintMargins(sendPage, options) {
  const { top, right, bottom, left } = options.margins;
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return;

  const css = `
    @page {
      size: ${pageSizeName(options)};
      margin: ${top}in ${right}in ${bottom}in ${left}in;
      background: #fff;
    }
  `;
  await sendPage("Runtime.evaluate", {
    expression: `(() => {
      const style = document.createElement("style");
      style.id = "resume-pdf-page-margins";
      style.textContent = ${JSON.stringify(css)};
      document.head.appendChild(style);
    })()`,
  });
}

async function renderPdf(inputPath, outputPath, options) {
  if (!existsSync(inputPath)) throw new Error(`Input HTML not found: ${inputPath}`);

  const chromePath = findChrome(options.chromePath);
  const port = await getFreePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "resume-pdf-chrome-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`, options.timeoutMs);
    const pageTarget = targets.find((target) => target.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error("Chrome did not expose a page DevTools target.");
    }
    const socket = await connectCdp(pageTarget.webSocketDebuggerUrl);

    await sendCdp(socket, "Page.enable");
    await sendCdp(socket, "Runtime.enable");
    await sendCdp(socket, "Emulation.setEmulatedMedia", { media: "print" });

    const loadEvent = waitForEvent(socket, "Page.loadEventFired", options.timeoutMs);
    await sendCdp(socket, "Page.navigate", { url: pathToFileURL(inputPath).href });
    await loadEvent;
    await waitForPageReady(
      (method, params) => sendCdp(socket, method, params),
      Math.min(options.timeoutMs, 10000),
    ).catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    await applyPrintMargins((method, params) => sendCdp(socket, method, params), options);

    const pdf = await sendCdp(socket, "Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: options.preferCssPageSize,
      displayHeaderFooter: false,
      marginTop: options.margins.top,
      marginRight: options.margins.right,
      marginBottom: options.margins.bottom,
      marginLeft: options.margins.left,
      scale: options.scale,
      paperWidth: options.paper.widthInches,
      paperHeight: options.paper.heightInches,
    });

    await writeFile(outputPath, Buffer.from(pdf.data, "base64"));
    socket.close();
  } catch (error) {
    if (stderr.trim()) {
      error.message += `\nChrome stderr:\n${stderr.trim()}`;
    }
    throw error;
  } finally {
    chrome.kill("SIGTERM");
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This tool requires Node.js with a built-in WebSocket API. Use Node 22+.");
  }
  const { inputPath, outputPath, options } = parseArgs(process.argv.slice(2));
  await renderPdf(inputPath, outputPath, options);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
