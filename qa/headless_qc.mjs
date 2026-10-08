import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = "C:\\Users\\bryma\\dev\\charades";
const QA = ROOT + "\\qa";
const REDESIGN = QA + "\\redesign";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const BASE = process.env.CHARADES_URL || "http://127.0.0.1:8765/";
const EXPECTED = [
  "Bible Characters",
  "Bible Stories",
  "Miracles & Parables",
  "Christmas & Easter",
  "Church Life",
  "Bible Animals",
  "Bible Places & Things",
  "Actions",
  "Jobs",
  "Sports",
  "Animals",
  "Chores",
  "Movies",
  "Everyday Objects",
  "Foods",
  "Outdoor Fun"
];
const POSES = {
  90: { neutral: [0, -90], small: [0, -80], down: [180, 50], up: [0, -50] },
  270: { neutral: [0, 90], small: [0, 80], down: [180, -50], up: [0, 50] }
};

mkdirSync(QA, { recursive: true });
mkdirSync(REDESIGN, { recursive: true });
const consoleEvents = [];
const checks = [];
const shots = [];

function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: detail == null ? "" : String(detail) });
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
}

function promptsFromHtml() {
  const html = readFileSync(ROOT + "\\index.html", "utf8");
  const start = html.indexOf("const PROMPTS = ");
  const end = html.indexOf("let state = loadState()");
  const block = html.slice(start + "const PROMPTS = ".length, end).trim().replace(/;$/, "");
  return Function("return " + block)();
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let next = 0;
  const pending = new Map();
  const listeners = [];
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("websocket error")));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  });
  return {
    ready,
    on(fn) { listeners.push(fn); },
    send(method, params = {}) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { try { ws.close(); } catch (err) {} }
  };
}

async function waitForTarget() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch("http://127.0.0.1:" + PORT + "/json/list");
      if (res.ok) {
        const list = await res.json();
        const page = list.find((item) => item.type === "page");
        if (page && page.webSocketDebuggerUrl) return page;
      }
    } catch (err) {}
    await delay(200);
  }
  throw new Error("Chrome remote debugging did not come up");
}

const userData = process.env.TEMP + "\\charades-chrome-" + Date.now();
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-sync",
  "--remote-debugging-port=" + PORT,
  "--remote-allow-origins=*",
  "--user-data-dir=" + userData,
  "--autoplay-policy=no-user-gesture-required",
  "about:blank"
], { stdio: "ignore" });

let cdp;
try {
  const target = await waitForTarget();
  cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  cdp.on((msg) => {
    if (msg.method === "Runtime.consoleAPICalled") {
      consoleEvents.push({
        kind: "console",
        type: msg.params.type,
        text: (msg.params.args || []).map((arg) => arg.value || arg.description || arg.type).join(" ")
      });
    } else if (msg.method === "Runtime.exceptionThrown") {
      const details = msg.params.exceptionDetails || {};
      consoleEvents.push({
        kind: "exception",
        type: "error",
        text: details.text + " " + (details.exception && details.exception.description ? details.exception.description : "")
      });
    } else if (msg.method === "Log.entryAdded") {
      const entry = msg.params.entry || {};
      consoleEvents.push({ kind: "log", type: entry.level, text: entry.text });
    }
  });
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__screenAngle = 90;
      window.__permCalls = 0;
      window.__orientOverrideError = "";
      (function () {
        const fake = {
          get angle() { return window.__screenAngle; },
          get type() { return window.__screenAngle === 270 ? "landscape-secondary" : "landscape-primary"; },
          lock() { return Promise.resolve(); },
          unlock() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return true; }
        };
        try {
          Object.defineProperty(screen, "orientation", { configurable: true, get() { return fake; } });
        } catch (err) {
          window.__orientOverrideError = String(err);
        }
      })();
    `
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: "landscapePrimary", angle: 90 }
  });

  async function ev(expression) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.text + " " + (details.exception && details.exception.description ? details.exception.description : expression.slice(0, 180)));
    }
    return result.result ? result.result.value : undefined;
  }

  async function shot(name) {
    const png = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(QA + "\\" + name, Buffer.from(png.data, "base64"));
    shots.push(name);
  }

  async function setScheme(scheme) {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme }]
    });
  }

  async function redesignShot(name) {
    const png = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(REDESIGN + "\\" + name, Buffer.from(png.data, "base64"));
    shots.push("redesign/" + name);
  }

  async function waitFor(expression, timeoutMs, label) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await ev(expression)) return;
      await delay(100);
    }
    const snap = await ev("document.body.dataset.phase + ' | ' + (document.getElementById('hint')||{}).textContent + ' | ' + (document.getElementById('prompt')||{}).textContent");
    throw new Error("timed out waiting for " + label + " (" + snap + ")");
  }

  await cdp.send("Page.navigate", { url: BASE });
  await waitFor("document.readyState === 'complete' && !!document.getElementById('btn-tap-start') && document.querySelectorAll('.cat-btn').length >= 16", 10000, "page load");
  await delay(400);

  const rendered = await ev(`({
    headings: [...document.querySelectorAll('#category-picker h2')].map((node) => node.textContent),
    categories: [...document.querySelectorAll('#category-picker .cat-btn')].map((node) => node.textContent),
    start: (() => {
      const button = document.getElementById('btn-tap-start');
      const box = button.getBoundingClientRect();
      return { text: button.textContent, width: box.width, height: box.height };
    })(),
    links: [...document.querySelectorAll('a')].map((node) => node.getAttribute('href')),
    angle: screen.orientation && screen.orientation.angle,
    orientError: window.__orientOverrideError || ''
  })`);
  check("headings render as Christian, Classic, Mix", JSON.stringify(rendered.headings) === JSON.stringify(["Christian", "Classic", "Mix"]), rendered.headings.join(" | "));
  check("category buttons match the 16 names plus Mix", JSON.stringify(rendered.categories) === JSON.stringify(EXPECTED.concat(["Mix"])), rendered.categories.join(" | "));
  check("Tap to start is present", rendered.start.text === "Tap to start" && rendered.start.width > 40 && rendered.start.height > 40, JSON.stringify(rendered.start));
  check("screen angle is landscape-left 90", rendered.angle === 90, "angle " + rendered.angle + " " + rendered.orientError);
  check("player UI does not link the feature map", rendered.links.every((href) => !href || href.indexOf("FEATURE_MAP") === -1), rendered.links.join(", "));
  const landscapeHint = await ev("getComputedStyle(document.querySelector('.rotate-hint')).display");
  check("landscape hides the sideways note", landscapeHint === "none", landscapeHint);
  await setScheme("light");
  await redesignShot("home-light.png");
  await setScheme("dark");
  await redesignShot("home-dark.png");
  await setScheme("light");
  await ev("document.getElementById('btn-play').click()");
  await delay(250);
  await redesignShot("setup-light.png");
  await setScheme("dark");
  await redesignShot("setup-dark.png");
  await setScheme("light");
  await ev(`
    document.body.dataset.phase = "prep";
    document.body.classList.add("playing");
    document.getElementById("tilt-status").textContent = "Tilt off, use buttons";
  `);
  await delay(200);
  await redesignShot("prep-light.png");
  await setScheme("dark");
  await redesignShot("prep-dark.png");
  await setScheme("light");
  await ev(`
    document.body.dataset.phase = "play";
    document.getElementById("prompt-cat").textContent = "Actions";
    document.getElementById("prompt").textContent = "Walking the Dog";
    document.getElementById("timer").textContent = "60";
    document.getElementById("play-team").textContent = "Team 1";
    document.getElementById("play-score").textContent = "0";
    const ring = document.getElementById("ring-progress");
    ring.style.strokeDasharray = "175.929";
    ring.style.strokeDashoffset = "40";
  `);
  await delay(200);
  await redesignShot("play-light.png");
  await setScheme("dark");
  await redesignShot("play-dark.png");
  await setScheme("light");
  await ev(`
    document.body.classList.remove("playing");
    document.body.dataset.phase = "recap";
    document.getElementById("recap-line").textContent = "Team 1 scored 3. Total: 3.";
    document.getElementById("recap-next").textContent = "Next up: Team 2";
    document.getElementById("btn-next").textContent = "Next up: Team 2";
    document.getElementById("recap-guessed").replaceChildren();
    document.getElementById("recap-passed").replaceChildren();
    ["Jumping", "Waving"].forEach((text) => {
      const item = document.createElement("li");
      const mark = document.createElement("span");
      mark.className = "mark";
      item.append(mark, document.createTextNode(text));
      document.getElementById("recap-guessed").appendChild(item);
    });
    ["Sleeping"].forEach((text) => {
      const item = document.createElement("li");
      const mark = document.createElement("span");
      mark.className = "mark";
      item.append(mark, document.createTextNode(text));
      document.getElementById("recap-passed").appendChild(item);
    });
    const standings = document.getElementById("standings");
    standings.replaceChildren();
    ["Team 1  3", "Team 2  0"].forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      standings.appendChild(item);
    });
  `);
  await delay(250);
  await redesignShot("recap-light.png");
  await setScheme("dark");
  await redesignShot("recap-dark.png");
  await setScheme("light");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: "portraitPrimary", angle: 0 }
  });
  await ev(`
    document.body.dataset.phase = "play";
    document.body.classList.add("playing");
    document.body.classList.add("portrait");
  `);
  await delay(250);
  await redesignShot("rotate-overlay.png");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: "landscapePrimary", angle: 90 }
  });
  await ev(`
    document.body.dataset.phase = "home";
    document.body.classList.remove("playing");
    document.body.classList.remove("portrait");
    if (typeof updatePortrait === "function") updatePortrait();
  `);
  await setScheme("light");
  await delay(200);
  const debugOff = await ev(`({
    hidden: document.getElementById('tilt-debug').hidden,
    display: getComputedStyle(document.getElementById('tilt-debug')).display
  })`);
  check("debug readout stays hidden without the flag", debugOff.hidden === true && debugOff.display === "none", JSON.stringify(debugOff));
  await shot("01-setup.png");

  const debugUrl = new URL(BASE);
  debugUrl.searchParams.set("debug", "1");
  await cdp.send("Page.navigate", { url: debugUrl.href });
  await waitFor("document.readyState === 'complete' && document.getElementById('tilt-debug') && document.getElementById('tilt-debug').hidden === false", 10000, "debug page");
  await delay(200);
  const debugOn = await ev(`({
    hidden: document.getElementById('tilt-debug').hidden,
    text: document.getElementById('tilt-debug').textContent
  })`);
  check("debug readout is visible with ?debug=1", debugOn.hidden === false && debugOn.text.indexOf("beta") !== -1 && debugOn.text.indexOf("source") !== -1, debugOn.text);
  await cdp.send("Page.navigate", { url: BASE });
  await waitFor("document.readyState === 'complete' && !!document.getElementById('btn-tap-start') && document.querySelectorAll('.cat-btn').length >= 16", 10000, "return from debug");
  await delay(200);

  const promptMap = promptsFromHtml();
  for (const name of EXPECTED) {
    const count = (promptMap[name] || []).length;
    check(name + " has at least 40 prompts", count >= 40, String(count));
  }
  const seenPrompts = new Map();
  const duplicatePrompts = [];
  for (const name of EXPECTED) {
    for (const prompt of promptMap[name] || []) {
      const key = String(prompt).trim().toLowerCase();
      if (seenPrompts.has(key)) duplicatePrompts.push(prompt + " in " + seenPrompts.get(key) + " and " + name);
      else seenPrompts.set(key, name);
    }
  }
  check("no prompt appears in two categories", duplicatePrompts.length === 0, duplicatePrompts.slice(0, 8).join("; ") || "unique");

  await ev(`
    window.__permCalls = 0;
    window.__permSync = 0;
    function grant() {
      window.__permCalls += 1;
      window.__permSync += 1;
      return Promise.resolve('granted');
    }
    function install(Ctor) {
      if (!Ctor) return false;
      try { Ctor.requestPermission = grant; return true; }
      catch (err) {
        try {
          Object.defineProperty(Ctor, 'requestPermission', { configurable: true, writable: true, value: grant });
          return true;
        } catch (err2) { return false; }
      }
    }
    window.__permInstalled = {
      orientation: install(window.DeviceOrientationEvent),
      motion: install(window.DeviceMotionEvent)
    };
  `);
  await ev(`
    const input = document.querySelector('input[name="seconds"][value="30"]');
    input.click();
    const button = [...document.querySelectorAll('.cat-btn')].find((node) => node.textContent === 'Actions');
    button.click();
  `);
  const permSync = await ev(`
    window.__permSync = 0;
    document.getElementById('btn-tap-start').click();
    window.__permSync
  `);
  check("Tap to start calls requestPermission synchronously", permSync >= 1, "sync calls " + permSync + " installed " + JSON.stringify(await ev("window.__permInstalled")));
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0", 12000, "round start");
  await setScheme("light");
  await redesignShot("play-light.png");
  await setScheme("dark");
  await redesignShot("play-dark.png");
  await setScheme("light");
  await shot("02-play.png");

  const pose = POSES[90];
  const pillOff = await ev("document.getElementById('tilt-status').textContent");
  check("tilt stays off until a sensor event", pillOff === "Tilt off, use buttons", pillOff);
  async function fire(beta, gamma) {
    return ev(`
      (() => {
        const beta = ${beta};
        const gamma = ${gamma};
        let event;
        try {
          event = new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: beta, gamma: gamma, absolute: true });
        } catch (err) {
          event = new Event('deviceorientation');
          Object.defineProperty(event, 'beta', { get: () => beta });
          Object.defineProperty(event, 'gamma', { get: () => gamma });
        }
        window.dispatchEvent(event);
        return {
          phase: document.body.dataset.phase,
          score: document.getElementById('play-score').textContent,
          prompt: document.getElementById('prompt').textContent,
          last: document.documentElement.dataset.lastResult || '',
          tilt: document.documentElement.dataset.tilt || ''
        };
      })()
    `);
  }

  async function burst(beta, gamma, count) {
    let last;
    for (let i = 0; i < count; i += 1) last = await fire(beta, gamma);
    return last;
  }

  const opened = await burst(pose.neutral[0], pose.neutral[1], 6);
  const firstPrompt = opened.prompt;
  const pillOn = await ev("document.getElementById('tilt-status').textContent");
  check("tilt status shows on while events arrive", pillOn === "Tilt on", pillOn);
  await delay(450);
  await fire(pose.neutral[0], pose.neutral[1]);
  const small = await fire(pose.small[0], pose.small[1]);
  check("a 10 degree tilt does not score", small.score === "0" && small.prompt === firstPrompt, "tilt " + small.tilt + " score " + small.score);
  const correct = await fire(pose.down[0], pose.down[1]);
  await shot("03-correct.png");
  check("face-down counts as correct once", correct.score === "1" && correct.last === "correct" && correct.prompt !== firstPrompt, "score " + correct.score + " tilt " + correct.tilt + " last " + correct.last);
  const again = await fire(pose.down[0], pose.down[1]);
  check("holding the tilt does not score again", again.score === "1" && again.prompt === correct.prompt, again.prompt);
  const earlyPass = await fire(pose.up[0], pose.up[1]);
  check("the opposite tilt does not count before neutral", earlyPass.score === "1" && earlyPass.prompt === correct.prompt, "last " + earlyPass.last);
  await fire(pose.neutral[0], pose.neutral[1]);
  const debounced = await fire(pose.up[0], pose.up[1]);
  check("a tilt inside 600ms does not count", debounced.score === "1" && debounced.prompt === correct.prompt, "last " + debounced.last);
  await delay(750);
  const passed = await fire(pose.up[0], pose.up[1]);
  await shot("04-pass.png");
  check("face-up counts as pass once", passed.score === "1" && passed.last === "pass" && passed.prompt !== correct.prompt, "score " + passed.score + " tilt " + passed.tilt);
  const passAgain = await fire(pose.up[0], pose.up[1]);
  check("holding pass does not advance again", passAgain.score === "1" && passAgain.prompt === passed.prompt, passAgain.prompt);

  await ev("window.__screenAngle = 270");
  await fire(POSES[270].neutral[0], POSES[270].neutral[1]);
  await delay(750);
  const otherSide = await fire(POSES[270].down[0], POSES[270].down[1]);
  check("landscape-right face-down counts as correct", otherSide.score === "2" && otherSide.last === "correct" && otherSide.prompt !== passed.prompt, "score " + otherSide.score + " tilt " + otherSide.tilt + " angle now " + await ev("screen.orientation.angle"));
  const keyed = await ev(`
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    ({ score: document.getElementById('play-score').textContent, prompt: document.getElementById('prompt').textContent, last: document.documentElement.dataset.lastResult || '' })
  `);
  check("arrow down counts as correct", keyed.score === "3" && keyed.last === "correct", "score " + keyed.score);

  let sawUrgent = false;
  let sawDrop = false;
  let previous = null;
  let recap = null;
  const roundStart = Date.now();
  while (Date.now() - roundStart < 40000) {
    const info = await ev(`({
      phase: document.body.dataset.phase,
      timer: document.getElementById('timer').textContent,
      urgent: document.getElementById('timer').classList.contains('urgent'),
      line: (document.getElementById('recap-line') || {}).textContent || '',
      next: (document.getElementById('recap-next') || {}).textContent || '',
      guessed: [...document.querySelectorAll('#recap-guessed li')].map((node) => node.textContent),
      passed: [...document.querySelectorAll('#recap-passed li')].map((node) => node.textContent)
    })`);
    if (previous !== null && Number(info.timer) < Number(previous)) sawDrop = true;
    previous = info.timer;
    if (info.urgent) {
      sawUrgent = true;
      if (!shots.includes("05-urgent.png")) await shot("05-urgent.png");
    }
    if (info.phase === "recap") {
      recap = info;
      break;
    }
    await delay(400);
  }
  check("the on-screen timer counts down", sawDrop, "last " + previous);
  check("the last 10 seconds pulse", sawUrgent, "");
  check("the timer ends the round", Boolean(recap), recap ? recap.line : "still " + previous);
  if (recap) {
    await setScheme("light");
    await redesignShot("recap-light.png");
    await setScheme("dark");
    await redesignShot("recap-dark.png");
    await setScheme("light");
    await shot("06-recap.png");
    check("recap lists the guessed prompt", recap.guessed.indexOf(firstPrompt) !== -1, recap.guessed.join(", "));
    check("recap lists the passed prompt", recap.passed.indexOf(correct.prompt) !== -1, recap.passed.join(", "));
    check("recap shows the round total", recap.line.indexOf("scored 3") !== -1 && recap.line.indexOf("Total: 3") !== -1, recap.line);
    check("the turn rotates", recap.next.indexOf("Team 2") !== -1, recap.next);
  }

  await cdp.send("Page.reload", { ignoreCache: false });
  await waitFor("document.readyState === 'complete' && document.body.dataset.phase === 'home'", 10000, "reload");
  await delay(200);
  const kept = await ev(`({
    score: document.querySelector('[data-team-index="0"]').textContent,
    up: document.getElementById('up-now').textContent,
    seconds: document.querySelector('input[name="seconds"]:checked').value,
    category: (document.querySelector('.cat-btn.selected') || {}).textContent || ''
  })`);
  check("score survives a refresh", kept.score === "3", "team score " + kept.score);
  check("turn and settings survive a refresh", kept.up.indexOf("Team 2") !== -1 && kept.seconds === "30" && kept.category === "Actions", JSON.stringify(kept));
  await shot("07-refresh.png");

  await ev(`
    window.__screenAngle = 90;
    function grant() {
      window.__permCalls = (window.__permCalls || 0) + 1;
      return Promise.resolve('granted');
    }
    function install(Ctor) {
      if (!Ctor) return;
      try { Ctor.requestPermission = grant; }
      catch (err) {
        try { Object.defineProperty(Ctor, 'requestPermission', { configurable: true, writable: true, value: grant }); }
        catch (err2) {}
      }
    }
    install(window.DeviceOrientationEvent);
    install(window.DeviceMotionEvent);
    document.getElementById('btn-tap-start').click();
  `);
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0", 12000, "motion round");
  await ev("window.removeEventListener('deviceorientation', onOrientation)");
  await delay(1100);
  const beforeMotion = await ev("document.getElementById('play-score').textContent");
  async function fireMotion(beta, gamma) {
    return ev(`
      (() => {
        const up = upFromOrientation(${beta}, ${gamma});
        const x = up.x * 9.8;
        const y = up.y * 9.8;
        const z = up.z * 9.8;
        let event;
        try {
          event = new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: x, y: y, z: z } });
          const got = event.accelerationIncludingGravity;
          if (!got || !Number.isFinite(got.x)) throw new Error('empty motion');
        } catch (err) {
          event = new Event('devicemotion');
          Object.defineProperty(event, 'accelerationIncludingGravity', { configurable: true, get: () => ({ x: x, y: y, z: z }) });
        }
        window.dispatchEvent(event);
        return {
          score: document.getElementById('play-score').textContent,
          last: document.documentElement.dataset.lastResult || '',
          source: document.documentElement.dataset.tiltSource || '',
          tilt: document.documentElement.dataset.tilt || '',
          orientAt: window.sensor ? 0 : 0
        };
      })()
    `);
  }
  for (let i = 0; i < 6; i += 1) await fireMotion(POSES[90].neutral[0], POSES[90].neutral[1]);
  await delay(450);
  const motionHit = await fireMotion(POSES[90].down[0], POSES[90].down[1]);
  check(
    "motion fallback counts face-down as correct",
    motionHit.last === "correct" && motionHit.source === "motion" && Number(motionHit.score) === Number(beforeMotion) + 1,
    JSON.stringify(motionHit) + " from " + beforeMotion
  );
  await ev("endRound()");
  await ev("document.getElementById('btn-next').click()");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: "portraitPrimary", angle: 0 }
  });
  await ev("window.__screenAngle = 90");
  const portraitHint = await ev("getComputedStyle(document.querySelector('.rotate-hint')).display");
  check("portrait still shows the sideways note", portraitHint !== "none", portraitHint);
  await ev(`
    window.__permCalls = 0;
    function grant() { window.__permCalls += 1; return Promise.resolve('granted'); }
    function install(Ctor) {
      if (!Ctor) return;
      try { Ctor.requestPermission = grant; }
      catch (err) {
        try { Object.defineProperty(Ctor, 'requestPermission', { configurable: true, writable: true, value: grant }); }
        catch (err2) {}
      }
    }
    install(window.DeviceOrientationEvent);
    install(window.DeviceMotionEvent);
    document.getElementById('btn-tap-start').click();
  `);
  await waitFor("document.body.classList.contains('playing') && document.body.classList.contains('portrait')", 8000, "portrait overlay");
  const overlay = await ev(`({
    display: getComputedStyle(document.getElementById('rotate-overlay')).display,
    text: document.getElementById('rotate-overlay').innerText
  })`);
  check("portrait shows the rotate overlay", overlay.display === "flex" && overlay.text.indexOf("Rotate your phone") !== -1, overlay.display + " " + overlay.text.replace(/\\s+/g, " "));
  await shot("08-portrait.png");
  await setScheme("light");
  await redesignShot("rotate-overlay.png");

  const used = promptMap.Actions.map((prompt) => "Actions\n" + prompt);
  const saved = {
    teams: [
      { id: "a", name: "Team 1", score: 3 },
      { id: "b", name: "Team 2", score: 0 }
    ],
    turnIndex: 1,
    used,
    settings: { seconds: 30, category: "Actions" }
  };
  await ev("localStorage.setItem('charades.v1', " + JSON.stringify(JSON.stringify(saved)) + ")");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: "landscapePrimary", angle: 90 }
  });
  await cdp.send("Page.reload");
  await waitFor("document.readyState === 'complete' && document.body.dataset.phase === 'home'", 10000, "exhausted reload");
  await ev(`
    const DOE = window.DeviceOrientationEvent;
    function grant() { window.__permCalls = (window.__permCalls || 0) + 1; return Promise.resolve('granted'); }
    try { DOE.requestPermission = grant; }
    catch (err) { Object.defineProperty(DOE, 'requestPermission', { configurable: true, writable: true, value: grant }); }
    document.getElementById('btn-tap-start').click();
  `);
  await waitFor("document.getElementById('deck-empty').hidden === false", 4000, "empty category message");
  const emptyText = await ev("document.getElementById('deck-empty-text').textContent");
  check("an empty category says so", emptyText === "No prompts left in this category.", emptyText);
  await shot("09-empty.png");
  await ev("document.getElementById('btn-reshuffle').click()");
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0", 12000, "reshuffle deal");
  const reshuffled = await ev("document.getElementById('prompt').textContent");
  check("reshuffle deals a prompt again", promptMap.Actions.indexOf(reshuffled) !== -1, reshuffled);
  await shot("10-reshuffle.png");

  await delay(600);
  const errors = consoleEvents.filter((event) => event.type === "error");
  check("zero console errors", errors.length === 0, errors.map((event) => event.text).join(" || ") || "none");
  writeFileSync(QA + "\\results.json", JSON.stringify({
    checks,
    shots,
    rendered,
    counts: Object.fromEntries(EXPECTED.map((name) => [name, promptMap[name].length])),
    consoleEvents
  }, null, 2));
  const failed = checks.filter((item) => !item.ok);
  console.log(failed.length ? "FAILED " + failed.length : "ALL PASS " + checks.length);
  process.exitCode = failed.length ? 1 : 0;
} catch (err) {
  console.error("QC crashed: " + err.stack);
  writeFileSync(QA + "\\results.json", JSON.stringify({ checks, shots, consoleEvents, crash: String(err.stack || err) }, null, 2));
  process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  chrome.kill();
}
