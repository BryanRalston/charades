import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = "C:\\Users\\bryma\\dev\\charades";
const QA = ROOT + "\\qa";
const REDESIGN = QA + "\\redesign";
const V5 = QA + "\\v5";
const V6 = QA + "\\v6";
const V7 = QA + "\\v7";
const V6_LOCK = {
  math: ["015ff8a014515ed3d7d9ea3c858999989a101864c13b7335a754bdb687aab4b6", 2627],
  noteReading: ["a1a7a1edf2849608a145e6a1faffe8c27be619a80ae52cacefaa34e2f4850b1b", 612],
  orientationLeads: ["f1a607bc77870bd1c831b52dbe5ffd03e327f09cf075617ea98856dadd40c36c", 149],
  onOrientation: ["4f67f723eb4867fff0dc5e9d01331c4dc7ee2ac0bd385806ed994577c940ca7f", 251],
  onMotion: ["38a8a44d7a950d2e33244ad64212c3fdd6e1db11e04a112efb1b19dba3508d16", 660],
  attachSensors: ["e7f4c8dd03a561dca848cff9a3fea5a1cc767f18601027399e25d28e867a4e4a", 394]
};
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
mkdirSync(V5, { recursive: true });
mkdirSync(V6, { recursive: true });
mkdirSync(V7, { recursive: true });

function protectedSlices(html) {
  const mathStart = html.indexOf("/* tilt-math-start */");
  const mathEnd = html.indexOf("/* tilt-math-end */");
  const math = html.slice(mathStart, mathEnd + "/* tilt-math-end */".length);
  const sliceFn = (name, next) => {
    const start = html.indexOf("    function " + name);
    const end = html.indexOf("    function " + next);
    return html.slice(start, end);
  };
  const parts = {
    math: math,
    noteReading: sliceFn("noteReading(source, beta, gamma, up)", "orientationLeads(now)"),
    orientationLeads: sliceFn("orientationLeads(now)", "onOrientation(event)"),
    onOrientation: sliceFn("onOrientation(event)", "onMotion(event)"),
    onMotion: sliceFn("onMotion(event)", "attachSensors(orientOk, motionOk)"),
    attachSensors: sliceFn("attachSensors(orientOk, motionOk)", "permissionApi(ctor)")
  };
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  const out = {};
  Object.keys(parts).forEach((key) => {
    out[key] = [sha(parts[key]), parts[key].length];
  });
  return out;
}
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
      window.__fullScreens = 0;
      window.__orientLocks = 0;
      window.__wakeRequests = 0;
      window.__orientOverrideError = "";
      (function () {
        const origFull = Element.prototype.requestFullscreen;
        Element.prototype.requestFullscreen = function () {
          window.__fullScreens += 1;
          try {
            const result = origFull ? origFull.call(this) : Promise.resolve();
            if (result && typeof result.then === "function") return result.catch(function () { return undefined; });
            return Promise.resolve();
          } catch (err) {
            return Promise.resolve();
          }
        };
        try {
          Object.defineProperty(navigator, "wakeLock", {
            configurable: true,
            get() {
              return {
                request(type) {
                  window.__wakeRequests += 1;
                  window.__wakeType = type;
                  return Promise.resolve({
                    release() {
                      window.__wakeReleases = (window.__wakeReleases || 0) + 1;
                      return Promise.resolve();
                    }
                  });
                }
              };
            }
          });
        } catch (err) {
          window.__wakeError = String(err);
        }
        const fake = {
          get angle() { return window.__screenAngle; },
          get type() { return window.__screenAngle === 270 ? "landscape-secondary" : "landscape-primary"; },
          lock() {
            window.__orientLocks += 1;
            return Promise.resolve();
          },
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

  async function v6Shot(name) {
    const png = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(V6 + "\\" + name, Buffer.from(png.data, "base64"));
    shots.push("v6/" + name);
  }

  async function v7Shot(name) {
    const png = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(V7 + "\\" + name, Buffer.from(png.data, "base64"));
    shots.push("v7/" + name);
  }

  async function setViewport(width, height) {
    const landscape = width > height;
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
      screenOrientation: landscape
        ? { type: "landscapePrimary", angle: 90 }
        : { type: "portraitPrimary", angle: 0 }
    });
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

  const tiltNow = protectedSlices(readFileSync(ROOT + "\\index.html", "utf8"));
  const tiltSame = Object.keys(V6_LOCK).every((key) => tiltNow[key][0] === V6_LOCK[key][0] && tiltNow[key][1] === V6_LOCK[key][1]);
  check("tilt math and sensor handlers are byte-identical to v6", tiltSame, JSON.stringify(tiltNow));
  const swSource = readFileSync(ROOT + "\\sw.js", "utf8");
  check(
    "sw cache is charades-v7",
    swSource.indexOf('const CACHE = "charades-v7"') !== -1 && swSource.indexOf('ASSET_VERSION = "7"') !== -1,
    ""
  );
  const swStart = swSource.indexOf("function networkFirst");
  const swEnd = swSource.indexOf("/* network-timeout-end */");
  const swFactory = new Function(
    "fetch",
    "setTimeout",
    "clearTimeout",
    "const NETWORK_TIMEOUT_MS = 2500;\n" + swSource.slice(swStart, swEnd) + "\nreturn networkFirst;"
  );
  const swTimed = swFactory(() => new Promise(() => {}), setTimeout, clearTimeout);
  const swBegan = Date.now();
  let swRejected = false;
  try { await swTimed({}); } catch (err) { swRejected = String(err && err.message || err) === "timeout"; }
  const swElapsed = Date.now() - swBegan;
  check(
    "sw network timeout falls back after 2.5s",
    swRejected && swElapsed >= 2000 && swElapsed < 4000 && swSource.indexOf("cache.match") !== -1,
    swElapsed + "ms " + swRejected
  );

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
  const colorSheet = await ev(`(() => {
    const colors = categoryColors();
    const names = ${JSON.stringify(EXPECTED)};
    const root = document.createElement("div");
    root.id = "color-sheet";
    root.style.cssText = "position:fixed;inset:0;z-index:90;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(4,1fr);background:#111;";
    names.forEach((name) => {
      const pair = colors[name];
      const cell = document.createElement("div");
      cell.style.cssText = "display:flex;align-items:flex-end;padding:8px;color:#fff;font:700 13px/1.2 sans-serif;background:radial-gradient(120% 90% at 50% 40%," + pair[0] + "," + pair[1] + ")";
      cell.textContent = name;
      root.appendChild(cell);
    });
    document.body.appendChild(root);
    const banned = ["#5a3208", "#3d2a16", "#4a3808", "#4a3a08", "#5a4308", "#2b246e"];
    const muddy = Object.keys(colors).some((name) => colors[name].some((hex) => banned.indexOf(String(hex).toLowerCase()) !== -1));
    return { actions: colors.Actions.join(","), muddy: muddy, count: names.length };
  })()`);
  await v6Shot("play-colors-contact.png");
  await ev("const sheet = document.getElementById('color-sheet'); if (sheet) sheet.remove();");
  check("play colors are saturated for every category", colorSheet.actions === "#EA580C,#C2410C" && colorSheet.muddy === false && colorSheet.count === 16, JSON.stringify(colorSheet));
  const landscapeHint = await ev("getComputedStyle(document.querySelector('.rotate-hint')).display");
  check("landscape hides the sideways note", landscapeHint === "none", landscapeHint);
  await setScheme("light");
  await v6Shot("home-light.png");
  await setScheme("dark");
  await v6Shot("home-dark.png");
  await setScheme("light");
  await setViewport(932, 430);
  await delay(200);
  await v6Shot("home-932.png");
  await setViewport(844, 390);
  await ev("document.getElementById('btn-play').click()");
  await delay(250);
  await v6Shot("setup-deck-light.png");
  await setScheme("dark");
  await v6Shot("setup-deck-dark.png");
  await setScheme("light");
  await ev(`
    document.getElementById("setup").dataset.step = "round";
    document.getElementById("setup-title").textContent = "Round";
  `);
  await delay(200);
  await v6Shot("setup-round-light.png");
  await setScheme("dark");
  await v6Shot("setup-round-dark.png");
  await setScheme("light");
  await ev(`
    document.body.dataset.phase = "prep";
    document.body.classList.add("playing");
    const actions = categoryColors().Actions;
    const play = document.getElementById("play");
    play.style.setProperty("--cat-mid", actions[0]);
    play.style.setProperty("--cat-deep", actions[1]);
    document.getElementById("tilt-status").textContent = "Tilt off, use buttons";
  `);
  await delay(200);
  await v6Shot("prep-light.png");
  await setScheme("dark");
  await v6Shot("prep-dark.png");
  await setScheme("light");
  await ev(`
    document.body.dataset.phase = "play";
    document.getElementById("prompt-cat").textContent = "Actions";
    document.getElementById("prompt").textContent = "Walking the Dog";
    document.getElementById("timer").textContent = "60";
    document.getElementById("play-team").textContent = "Team 1";
    document.getElementById("play-score").textContent = "0";
    const ring = document.getElementById("ring-progress");
    ring.style.strokeDasharray = "289.027";
    ring.style.strokeDashoffset = "40";
  `);
  await delay(200);
  await v6Shot("play-light.png");
  await setScheme("dark");
  await v6Shot("play-dark.png");
  await setScheme("light");
  for (const entry of [["Actions", "play-actions"], ["Bible Stories", "play-bible-stories"], ["Animals", "play-animals"]]) {
    await ev(`(() => {
      const pair = categoryColors()[${JSON.stringify(entry[0])}];
      const play = document.getElementById("play");
      play.style.setProperty("--cat-mid", pair[0]);
      play.style.setProperty("--cat-deep", pair[1]);
      document.body.dataset.phase = "play";
      document.body.classList.add("playing");
      document.getElementById("prompt-cat").textContent = ${JSON.stringify(entry[0])};
      document.getElementById("prompt").textContent = "Blanket Fort";
    })()`);
    await setScheme("light");
    await v6Shot(entry[1] + "-light.png");
    await setScheme("dark");
    await v6Shot(entry[1] + "-dark.png");
    await setScheme("light");
  }
  await setViewport(932, 430);
  await delay(150);
  await v6Shot("play-932.png");
  await setViewport(844, 390);
  await ev(`
    document.body.classList.remove("playing");
    document.body.dataset.phase = "recap";
    document.getElementById("recap-line").textContent = "Team 1 scored 3! Total: 3.";
    document.getElementById("btn-next").textContent = "Next up: Team 2";
    function addItem(list, text) {
      const item = document.createElement("li");
      const mark = document.createElement("span");
      mark.className = "mark";
      item.append(mark, document.createTextNode(text));
      list.appendChild(item);
    }
    const guessed = document.getElementById("recap-guessed");
    const passed = document.getElementById("recap-passed");
    guessed.replaceChildren();
    passed.replaceChildren();
    addItem(guessed, "Jumping");
    addItem(guessed, "Waving");
    addItem(passed, "Sleeping");
    const standings = document.getElementById("standings");
    standings.replaceChildren();
    [["Team 1", "3", "#0a84ff"], ["Team 2", "0", "#ff375f"]].forEach((entry) => {
      const item = document.createElement("li");
      const crown = document.createElement("span");
      const name = document.createElement("span");
      name.textContent = entry[0];
      const bar = document.createElement("span");
      bar.className = "stand-bar";
      const fill = document.createElement("span");
      fill.className = "stand-fill";
      fill.style.width = entry[1] === "0" ? "0%" : "100%";
      fill.style.background = entry[2];
      bar.appendChild(fill);
      const score = document.createElement("span");
      score.className = "stand-score";
      score.textContent = entry[1];
      item.append(crown, name, bar, score);
      standings.appendChild(item);
    });
    renderConfetti(3);
  `);
  await delay(250);
  await v6Shot("recap-light.png");
  await setScheme("dark");
  await v6Shot("recap-dark.png");
  await setScheme("light");
  await setViewport(390, 844);
  await ev(`
    document.body.dataset.phase = "play";
    document.body.classList.add("playing");
    document.body.classList.add("portrait");
  `);
  await delay(250);
  await v6Shot("rotate-overlay.png");
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
  const removedCards = ["Friendship Pad", "Pew Pencil", "Known Sheep", "Sorted Sheep", "Ready Feast", "Healed at Once", "Salt Steps", "Boot Tray", "Rock Badger", "Doxology", "Benediction", "Pink Egg", "Backpack Strap", "Dairy Cow", "Praying in Fish", "Sudden Fig Tree", "Methuselah", "Dorcas", "Thorny Soil", "Swept Floor", "Hidden Coin", "Narrow Door", "Rising Dough", "New Skins", "Dawn Workers", "Evening Workers", "Hand Made Whole", "Faraway Healing", "Official's Son", "Distant Son Healed", "Servant Healed", "Rainbow Promise", "Rainbow Sky", "Dove Returns", "Dove With Leaf", "Cloud Leads On", "Thin Cow", "Raven Pair", "Little Lamb", "Pet Lamb", "Shepherd Lamb", "Big Fish", "Great Fish", "Blue Egg", "Plastic Egg", "Hidden Egg", "Toy Story 2", "Toy Story 3", "Toy Story 4", "Despicable Me 2", "Despicable Me 3", "Despicable Me 4", "Happy Feet Two", "102 Dalmatians", "Incredibles 2", "Frozen 2"];
  const addedScenes = ["David and Goliath", "Jonah Swallowed", "Feeding the 5,000", "Peter Denies Jesus", "Paul Blinded", "Daniel Prays", "Zacchaeus Climbs Tree", "Samson Pushes Pillars", "Paul's Shipwreck", "Baby Moses Basket"];
  const hasPrompt = (prompt) => EXPECTED.some((name) => (promptMap[name] || []).indexOf(prompt) !== -1);
  const stillThere = removedCards.filter(hasPrompt);
  const missingScenes = addedScenes.filter((prompt) => !hasPrompt(prompt));
  check("removed and collapsed cards are absent", stillThere.length === 0, stillThere.slice(0, 8).join(", ") || "absent");
  check(
    "added bible scenes are present",
    missingScenes.length === 0 && hasPrompt("Toy Story") && hasPrompt("Big Hero 6") && hasPrompt("Lost Coin") && hasPrompt("Easter Egg") && !hasPrompt("102 Dalmatians"),
    missingScenes.join(", ") || "present"
  );

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
  const blockedStart = await ev(`
    window.__permSync = 0;
    window.__fullScreens = 0;
    window.__orientLocks = 0;
    document.getElementById('btn-tap-start').click();
    ({
      sync: window.__permSync,
      hint: document.getElementById('hint').textContent,
      screens: window.__fullScreens,
      locks: window.__orientLocks
    })
  `);
  check(
    "validation runs before permission",
    blockedStart.sync === 0 && blockedStart.hint === "Pick a category first." && blockedStart.screens === 0 && blockedStart.locks === 0,
    JSON.stringify(blockedStart)
  );
  await ev(`
    const input = document.querySelector('input[name="seconds"][value="30"]');
    input.click();
    const button = [...document.querySelectorAll('.cat-btn')].find((node) => node.textContent === 'Actions');
    button.click();
  `);
  const tutorial = await ev(`
    window.__permSync = 0;
    document.getElementById('btn-tap-start').click();
    ({
      sync: window.__permSync,
      phase: document.body.dataset.phase,
      open: document.getElementById('tutorial').hidden === false,
      text: document.getElementById('tutorial').innerText
    })
  `);
  check(
    "tutorial explains motion before permission",
    tutorial.sync === 0 && tutorial.open === true && tutorial.phase === "tutorial" && tutorial.text.indexOf("motion") !== -1,
    JSON.stringify(tutorial)
  );
  const permSync = await ev(`
    window.__permSync = 0;
    document.getElementById('btn-tutorial-go').click();
    const once = window.__permSync;
    document.getElementById('btn-tutorial-go').click();
    ({ once: once, twice: window.__permSync })
  `);
  check(
    "Tap to start calls requestPermission synchronously once",
    permSync.once >= 1 && permSync.twice === permSync.once,
    "sync calls " + JSON.stringify(permSync) + " installed " + JSON.stringify(await ev("window.__permInstalled"))
  );
  const practice = await ev(`({
    phase: document.body.dataset.phase,
    prompt: document.getElementById('prompt').textContent,
    tutorial: document.getElementById('tutorial').hidden
  })`);
  check(
    "practice card asks for a live nod",
    practice.phase === "practice" && practice.prompt === "Nod down = Got it, Tip back = Pass" && practice.tutorial === true,
    JSON.stringify(practice)
  );
  await ev("document.getElementById('btn-correct').click()");
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0 && document.getElementById('prompt').textContent.indexOf('Nod down') === -1", 12000, "round start");
  const go = await ev("({ go: document.documentElement.dataset.go || '', skip: document.documentElement.dataset.skippedPrep || '', seen: state.settings.tutorialSeen })");
  check("a GO moment follows the countdown", go.go === "1", JSON.stringify(go));
  check("prep is skipped after the first run", go.skip === "1" && go.seen === true, JSON.stringify(go));
  const locks = await ev("({ screens: window.__fullScreens || 0, orient: window.__orientLocks || 0, wake: window.__wakeRequests || 0, wakeType: window.__wakeType || '', wakeError: window.__wakeError || '' })");
  check("fullscreen and orientation lock run on start", locks.screens >= 1 && locks.orient >= 1, JSON.stringify(locks));
  check("wake lock is requested when play begins", locks.wake >= 1 && locks.wakeType === "screen", JSON.stringify(locks));
  await setScheme("light");
  await v6Shot("play-light.png");
  await setScheme("dark");
  await v6Shot("play-dark.png");
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
          tilt: document.documentElement.dataset.tilt || '',
          ghost: ((document.querySelectorAll('.prompt-ghost')[document.querySelectorAll('.prompt-ghost').length - 1]) || {}).className || '',
          fly: document.querySelectorAll('.prompt-ghost').length ? getComputedStyle(document.querySelectorAll('.prompt-ghost')[document.querySelectorAll('.prompt-ghost').length - 1]).getPropertyValue('--fly').trim() : '',
          bump: document.getElementById('play-score').className
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
  await delay(700);
  const armed90 = await ev("document.documentElement.dataset.calibrated || ''");
  check("calibration waits for a stable neutral", armed90 === "1", armed90);
  await fire(pose.neutral[0], pose.neutral[1]);
  const small = await fire(pose.small[0], pose.small[1]);
  check("a 10 degree tilt does not score", small.score === "0" && small.prompt === firstPrompt, "tilt " + small.tilt + " score " + small.score);
  const correct = await fire(pose.down[0], pose.down[1]);
  await shot("03-correct.png");
  check("face-down counts as correct once", correct.score === "1" && correct.last === "correct" && correct.prompt !== firstPrompt, "score " + correct.score + " tilt " + correct.tilt + " last " + correct.last);
  check("a correct tilt flies the card down and bumps the score", correct.ghost.indexOf("fly-correct") !== -1 && correct.fly === "48vh" && correct.bump.indexOf("bump") !== -1, JSON.stringify({ ghost: correct.ghost, fly: correct.fly, bump: correct.bump }));
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
  check("a pass tilt flies the card up", passed.ghost.indexOf("fly-pass") !== -1 && passed.fly === "-48vh", JSON.stringify({ ghost: passed.ghost, fly: passed.fly }));
  const passAgain = await fire(pose.up[0], pose.up[1]);
  check("holding pass does not advance again", passAgain.score === "1" && passAgain.prompt === passed.prompt, passAgain.prompt);

  await ev("window.__screenAngle = 270");
  await burst(POSES[270].neutral[0], POSES[270].neutral[1], 6);
  await delay(700);
  const armed270 = await ev("document.documentElement.dataset.calibrated || ''");
  check("calibration re-arms after a screen angle change", armed270 === "1", armed270);
  const otherSide = await fire(POSES[270].down[0], POSES[270].down[1]);
  check("landscape-right face-down counts as correct", otherSide.score === "2" && otherSide.last === "correct" && otherSide.prompt !== passed.prompt, "score " + otherSide.score + " tilt " + otherSide.tilt + " angle now " + await ev("screen.orientation.angle"));
  const keyed = await ev(`
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    ({ score: document.getElementById('play-score').textContent, prompt: document.getElementById('prompt').textContent, last: document.documentElement.dataset.lastResult || '' })
  `);
  check("arrow down counts as correct", keyed.score === "3" && keyed.last === "correct", "score " + keyed.score);
  await ev("document.body.classList.add('portrait')");
  const overlayBlocked = await fire(pose.down[0], pose.down[1]);
  await ev("document.getElementById('btn-correct').click()");
  const overlayScore = await ev("document.getElementById('play-score').textContent");
  check("portrait overlay does not resolve a card", overlayBlocked.score === "3" && overlayScore === "3", overlayBlocked.score + " then " + overlayScore);
  await ev("document.body.classList.remove('portrait')");

  let sawUrgent = false;
  let sawDrop = false;
  let previous = null;
  let recap = null;
  let lastPlayPrompt = "";
  const roundStart = Date.now();
  while (Date.now() - roundStart < 40000) {
    const info = await ev(`({
      phase: document.body.dataset.phase,
      timer: document.getElementById('timer').textContent,
      urgent: document.getElementById('timer').classList.contains('urgent'),
      line: (document.getElementById('recap-line') || {}).textContent || '',
      next: (document.getElementById('btn-next') || {}).textContent || '',
      prompt: (document.getElementById('prompt') || {}).textContent || '',
      used: (() => { try { return JSON.parse(localStorage.getItem('charades.v1')).used; } catch (err) { return []; } })(),
      guessed: [...document.querySelectorAll('#recap-guessed li')].map((node) => node.textContent),
      passed: [...document.querySelectorAll('#recap-passed li')].map((node) => node.textContent),
      timeUp: [...document.querySelectorAll('#recap-passed li')].map((node) => ({
        prompt: [...node.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent).join(''),
        tag: (node.querySelector('.time-up-tag') || {}).textContent || ''
      }))
    })`);
    if (previous !== null && Number(info.timer) < Number(previous)) sawDrop = true;
    previous = info.timer;
    if (info.phase === "play" && info.prompt) lastPlayPrompt = info.prompt;
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
    await v6Shot("recap-light.png");
    await setScheme("dark");
    await v6Shot("recap-dark.png");
    await setScheme("light");
    await shot("06-recap.png");
    check("recap lists the guessed prompt", recap.guessed.indexOf(firstPrompt) !== -1, recap.guessed.join(", "));
    check("recap lists the passed prompt", recap.passed.indexOf(correct.prompt) !== -1, recap.passed.join(", "));
    check("recap shows the round total", recap.line.indexOf("scored 3") !== -1 && recap.line.indexOf("Total: 3") !== -1, recap.line);
    check("the turn rotates", recap.next.indexOf("Team 2") !== -1, recap.next);
    const timeUpRow = (recap.timeUp || []).find((row) => row.prompt === lastPlayPrompt && row.tag === "time's up");
    check(
      "time-up card shows its name and a tag",
      Boolean(timeUpRow) && recap.used.indexOf("Actions\n" + lastPlayPrompt) !== -1,
      lastPlayPrompt + " | " + JSON.stringify(recap.timeUp)
    );
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
  await delay(700);
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
    document.getElementById('btn-pass-start').click();
  `);
  await waitFor("document.body.classList.contains('playing') && document.body.classList.contains('portrait')", 12000, "portrait overlay");
  const overlay = await ev(`({
    display: getComputedStyle(document.getElementById('rotate-overlay')).display,
    text: document.getElementById('rotate-overlay').innerText
  })`);
  check("portrait shows the rotate overlay", overlay.display === "flex" && overlay.text.indexOf("Rotate your phone") !== -1, overlay.display + " " + overlay.text.replace(/\\s+/g, " "));
  const overlayAria = await ev("document.getElementById('rotate-overlay').getAttribute('aria-hidden')");
  check("rotate overlay is exposed while it is open", overlayAria !== "true", overlayAria);
  await shot("08-portrait.png");
  await setScheme("light");
  await v6Shot("rotate-overlay.png");
  await setViewport(844, 390);
  await ev("updatePortrait()");
  const closedAria = await ev("document.getElementById('rotate-overlay').getAttribute('aria-hidden')");
  check("rotate overlay is hidden from assistive tech when closed", closedAria === "true", closedAria);

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

  const beforeResume = await ev(`(() => {
    const team = document.getElementById('play-team').textContent;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    const saved = JSON.parse(localStorage.getItem('charades.v1'));
    return { team: team, turnIndex: saved.turnIndex, used: saved.used };
  })()`);
  await cdp.send("Page.reload");
  await waitFor("document.body && document.body.dataset.phase === 'prep'", 10000, "refresh resume");
  const resumed = await ev(`(() => {
    const saved = JSON.parse(localStorage.getItem('charades.v1'));
    return {
      phase: document.body.dataset.phase,
      team: document.getElementById('play-team').textContent,
      turnIndex: saved.turnIndex,
      used: saved.used
    };
  })()`);
  const usedSame = JSON.stringify(resumed.used) === JSON.stringify(beforeResume.used);
  check(
    "refresh mid-round resumes at prep",
    resumed.phase === "prep" && resumed.team === beforeResume.team && resumed.turnIndex === beforeResume.turnIndex && usedSame,
    JSON.stringify({ before: beforeResume, resumed: resumed })
  );

  const resumeSaved = {
    teams: [
      { id: "a", name: "Team 1", score: 4 },
      { id: "b", name: "Team 2", score: 0 }
    ],
    turnIndex: 0,
    used: ["Actions\nRunning"],
    settings: { seconds: 60, category: "Actions", buttonsOnly: false }
  };
  await ev("localStorage.setItem('charades.v1', " + JSON.stringify(JSON.stringify(resumeSaved)) + "); sessionStorage.setItem('charades.round', '1'); sessionStorage.setItem('charades.roundMs', '15000');");
  await cdp.send("Page.reload");
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0", 12000, "remaining-time resume");
  const remain = await ev("Number(document.getElementById('timer').textContent)");
  check("resume keeps the remaining time", remain >= 12 && remain <= 15, String(remain));
  const timed = await ev(`(() => {
    const before = Number(document.getElementById('timer').textContent);
    const real = performance.now.bind(performance);
    performance.now = function () { return real() + 5000; };
    onTimer();
    const after = Number(document.getElementById('timer').textContent);
    performance.now = real;
    onTimer();
    return { before: before, after: after };
  })()`);
  check("timer follows performance.now", timed.after <= timed.before - 4 && timed.after >= timed.before - 6, JSON.stringify(timed));
  const hiddenPause = await ev(`(() => {
    const before = document.getElementById('timer').textContent;
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return window.__docHidden === true; } });
    } catch (err) {
      return { error: String(err), before: before, paused: '' };
    }
    window.__docHidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    return { before: before, paused: document.body.dataset.paused || '', error: '' };
  })()`);
  await delay(700);
  const hiddenAfter = await ev("({ timer: document.getElementById('timer').textContent, paused: document.body.dataset.paused || '' })");
  check(
    "hidden tab pauses the round and the timer",
    hiddenPause.paused === "hidden" && hiddenAfter.timer === hiddenPause.before && hiddenAfter.paused === "hidden",
    JSON.stringify({ hiddenPause: hiddenPause, hiddenAfter: hiddenAfter })
  );
  const shown = await ev(`(() => {
    const before = window.__wakeRequests || 0;
    window.__docHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    return { paused: document.body.dataset.paused || '', wakes: window.__wakeRequests || 0, before: before };
  })()`);
  check("wake lock is re-acquired when the tab returns", shown.paused === "" && shown.wakes > shown.before, JSON.stringify(shown));
  const pauseUi = await ev(`(() => {
    document.getElementById('btn-pause').click();
    const open = document.getElementById('pause-modal').hidden === false && document.body.dataset.paused === 'user';
    const score = document.getElementById('play-score').textContent;
    document.getElementById('btn-correct').click();
    const held = document.getElementById('play-score').textContent === score;
    document.getElementById('btn-resume').click();
    const resumed = document.getElementById('pause-modal').hidden === true && !document.body.dataset.paused;
    document.getElementById('btn-pause').click();
    document.getElementById('btn-pause-end').click();
    return { open: open, held: held, resumed: resumed, phase: document.body.dataset.phase };
  })()`);
  check("pause button resumes and can end the round", pauseUi.open && pauseUi.held && pauseUi.resumed && pauseUi.phase === "recap", JSON.stringify(pauseUi));

  await ev(`(async () => {
    function grant() { return Promise.resolve('granted'); }
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
    state.settings.tutorialSeen = true;
    saveState();
    document.getElementById('btn-next').click();
    document.getElementById('btn-pass-start').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const beta = ${POSES[90].down[0]};
    const gamma = ${POSES[90].down[1]};
    let event;
    try {
      event = new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: beta, gamma: gamma, absolute: true });
    } catch (err) {
      event = new Event('deviceorientation');
      Object.defineProperty(event, 'beta', { get: () => beta });
      Object.defineProperty(event, 'gamma', { get: () => gamma });
    }
    window.dispatchEvent(event);
  })()`);
  await waitFor("document.body.dataset.phase === 'prep'", 4000, "upright prep");
  await delay(3000);
  const heldPrep = await ev("document.body.dataset.phase");
  check("countdown waits until the phone is upright", heldPrep === "prep", heldPrep);
  await burst(POSES[90].neutral[0], POSES[90].neutral[1], 6);
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0", 12000, "upright release");
  await ev("beginCalibration()");
  await fire(POSES[90].neutral[0], POSES[90].neutral[1]);
  await delay(700);
  const oneSample = await ev("document.documentElement.dataset.calibrated || ''");
  await burst(POSES[90].neutral[0], POSES[90].neutral[1], 6);
  await delay(700);
  const stable = await ev("document.documentElement.dataset.calibrated || ''");
  check("one reading does not finish calibration", oneSample === "0" && stable === "1", oneSample + " then " + stable);
  const locked = await ev(`(() => {
    const before = Number(document.getElementById('play-score').textContent);
    document.getElementById('btn-correct').click();
    document.getElementById('btn-correct').click();
    return { before: before, once: Number(document.getElementById('play-score').textContent) };
  })()`);
  await delay(700);
  const lockedAgain = await ev(`(() => {
    document.getElementById('btn-correct').click();
    return Number(document.getElementById('play-score').textContent);
  })()`);
  check("correct and pass ignore a second tap inside 600ms", locked.once === locked.before + 1 && lockedAgain === locked.before + 2, JSON.stringify(locked) + " then " + lockedAgain);
  const faded = await ev("document.querySelector('.play-help').classList.contains('faded')");
  check("play hint fades after the first card", faded === true, String(faded));
  const undo = await ev(`(() => {
    const before = Number(document.getElementById('play-score').textContent);
    return { before: before };
  })()`);
  const undoHit = await fire(POSES[90].down[0], POSES[90].down[1]);
  const undoChip = await ev("document.getElementById('undo-chip').hidden === false && document.getElementById('undo-chip').textContent");
  await ev("document.getElementById('undo-chip').click()");
  const undoAfter = await ev("Number(document.getElementById('play-score').textContent)");
  check(
    "undo chip restores the last tilt",
    undoChip === "Undo last card" && Number(undoHit.score) === undo.before + 1 && undoAfter === undo.before,
    JSON.stringify({ chip: undoChip, hit: undoHit.score, after: undoAfter, before: undo.before })
  );
  await delay(700);
  const buttonsOnly = await ev(`(() => {
    const box = document.getElementById('buttons-only');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return document.getElementById('tilt-status').textContent;
  })()`);
  const ignored = await fire(POSES[90].down[0], POSES[90].down[1]);
  const buttonScore = await ev(`(() => {
    const before = Number(document.getElementById('play-score').textContent);
    document.getElementById('btn-correct').click();
    return { before: before, after: Number(document.getElementById('play-score').textContent), pill: document.getElementById('tilt-status').textContent };
  })()`);
  check(
    "always use buttons ignores tilt and keeps the button",
    buttonsOnly === "Tilt off, use buttons" && Number(ignored.score) === buttonScore.before && buttonScore.after === buttonScore.before + 1 && buttonScore.pill === "Tilt off, use buttons",
    JSON.stringify({ buttonsOnly: buttonsOnly, ignored: ignored.score, buttonScore: buttonScore })
  );
  const fit = await ev(`(() => {
    document.getElementById('prompt').textContent = 'Supercalifornian Supercalifornian Supercalifornian Supercalifornian';
    const src = fitPrompt.toString();
    fitPrompt();
    return {
      loop: src.indexOf('while') !== -1,
      steps: document.getElementById('prompt').dataset.fitSteps || '',
      size: parseFloat(getComputedStyle(document.getElementById('prompt')).fontSize)
    };
  })()`);
  check("fitPrompt scales in one step", fit.loop === false && fit.steps === "1" && fit.size >= 28 && fit.size < 100, JSON.stringify(fit));
  await delay(700);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: "light" }
    ]
  });
  await delay(50);
  const reduced = await ev(`(() => {
    document.getElementById('btn-pass').click();
    const skip = document.querySelector('#flash .skip');
    const skipStyle = getComputedStyle(skip);
    return { opacity: skipStyle.opacity, dash: skipStyle.strokeDashoffset, flash: document.getElementById('flash').className };
  })()`);
  await setScheme("light");
  check(
    "reduced motion keeps the result icons visible",
    reduced.opacity === "1" && reduced.dash.indexOf("0") === 0 && reduced.flash.indexOf("pass") !== -1,
    JSON.stringify(reduced)
  );
  await cdp.send("Page.reload");
  await waitFor("document.getElementById('buttons-only')", 10000, "buttons setting reload");
  const keptButtons = await ev("document.getElementById('buttons-only').checked === true");
  check("always use buttons is saved", keptButtons === true, String(keptButtons));
  const urgent = await ev(`(() => {
    selectCategory('Sports');
    paintCategory();
    const timer = document.getElementById('timer');
    timer.classList.add('urgent');
    const sports = getComputedStyle(timer).color;
    selectCategory('Actions');
    paintCategory();
    timer.classList.add('urgent');
    const actions = getComputedStyle(timer).color;
    selectCategory('Christmas & Easter');
    paintCategory();
    const christmas = getComputedStyle(timer).color;
    return { sports: sports, actions: actions, christmas: christmas };
  })()`);
  check(
    "urgent timer is white on red decks",
    urgent.sports === "rgb(255, 255, 255)" && urgent.christmas === "rgb(255, 255, 255)" && urgent.actions !== "rgb(255, 255, 255)",
    JSON.stringify(urgent)
  );
  const gating = await ev(`(() => {
    clearGame();
    selectCategory('Actions');
    renderHome();
    const fresh = { play: document.getElementById('btn-play').hidden, cont: document.getElementById('btn-continue').hidden };
    state.teams[0].score = 1;
    renderHome();
    const going = { play: document.getElementById('btn-play').hidden, cont: document.getElementById('btn-continue').hidden };
    const row = document.querySelector('#home-standings li.zero');
    const name = row ? getComputedStyle(row.querySelector('.stand-name')) : null;
    const bar = row ? getComputedStyle(row.querySelector('.stand-bar')) : null;
    return { fresh: fresh, going: going, name: name ? name.opacity : '', bar: bar ? bar.opacity : '' };
  })()`);
  check(
    "continue appears only after a card is played",
    gating.fresh.play === false && gating.fresh.cont === true && gating.going.play === true && gating.going.cont === false,
    JSON.stringify(gating)
  );
  check("a zero score keeps the name and dims the bar", gating.name === "1" && Number(gating.bar) < 1, JSON.stringify(gating));
  const deleted = await ev(`(() => {
    const before = document.querySelectorAll('#team-list li').length;
    document.querySelector('.remove-team').click();
    const after = document.querySelectorAll('#team-list li').length;
    const chip = document.getElementById('team-undo').hidden === false;
    const lastDisabled = document.querySelector('.remove-team').disabled === true;
    document.getElementById('team-undo').click();
    const restored = document.querySelectorAll('#team-list li').length;
    const score = document.querySelector('[data-team-index="0"]').textContent;
    return { before: before, after: after, chip: chip, lastDisabled: lastDisabled, restored: restored, score: score };
  })()`);
  check(
    "team delete can be undone",
    deleted.before === 2 && deleted.after === 1 && deleted.chip === true && deleted.lastDisabled === true && deleted.restored === 2 && deleted.score === "1",
    JSON.stringify(deleted)
  );

  const audio = await ev(`(() => {
    const heard = [];
    const orig = playTone;
    playTone = function (steps) {
      heard.push(document.documentElement.dataset.audio || "tone");
      return orig(steps);
    };
    document.documentElement.dataset.tickCount = "0";
    document.documentElement.dataset.buzzer = "";
    tick();
    buzzer();
    document.body.dataset.phase = "play";
    delete document.body.dataset.paused;
    currentCard = null;
    const real = performance.now.bind(performance);
    performance.now = function () { return real(); };
    timerLeftMs = 4600;
    timerMark = real();
    lastTickLeft = -1;
    onTimer();
    const fromTimer = document.documentElement.dataset.tickCount;
    timerLeftMs = 0;
    timerMark = real();
    lastTickLeft = -1;
    onTimer();
    performance.now = real;
    playTone = orig;
    return {
      heard: heard.slice(0, 8),
      fromTimer: fromTimer,
      buzz: document.documentElement.dataset.buzzer || "",
      phase: document.body.dataset.phase
    };
  })()`);
  check(
    "the last seconds tick and the round ends on a buzzer",
    audio.heard.indexOf("tick") !== -1 && audio.heard.indexOf("buzzer") !== -1 && Number(audio.fromTimer) >= 1 && audio.buzz === "1" && audio.phase === "recap",
    JSON.stringify(audio)
  );
  const formats = await ev(`(() => {
    state.settings.format = "endless";
    state.roundsPlayed = 0;
    state.teams[0].score = 3;
    state.teams[1].score = 1;
    document.body.dataset.phase = "play";
    currentCard = { key: "Actions\\nRunning", prompt: "Running", category: "Actions" };
    endRound();
    const endless = document.body.dataset.phase;
    document.body.dataset.phase = "recap";
    state.turnIndex = 1;
    document.getElementById("btn-next").click();
    const passed = {
      phase: document.body.dataset.phase,
      team: document.getElementById("pass-team").textContent,
      setup: document.getElementById("setup").dataset.step
    };
    state.settings.format = "score";
    state.teams[0].score = 20;
    state.teams[1].score = 4;
    document.body.dataset.phase = "play";
    currentCard = { key: "Actions\\nJumping", prompt: "Jumping", category: "Actions" };
    endRound();
    const winner = {
      phase: document.body.dataset.phase,
      name: document.getElementById("winner-name").textContent,
      crown: document.querySelectorAll("#winner-crown .crown").length,
      bits: document.querySelectorAll("#winner-confetti .confetti-bit").length,
      rematch: document.getElementById("btn-rematch").textContent
    };
    const formatBefore = state.settings.format;
    document.getElementById("btn-rematch").click();
    const again = {
      phase: document.body.dataset.phase,
      score: state.teams[0].score,
      rounds: state.roundsPlayed,
      format: state.settings.format,
      team: document.getElementById("pass-team").textContent
    };
    state.settings.format = "rounds";
    state.roundsPlayed = state.teams.length * 3 - 1;
    state.teams[0].score = 4;
    state.teams[1].score = 9;
    document.body.dataset.phase = "play";
    currentCard = { key: "Actions\\nDancing", prompt: "Dancing", category: "Actions" };
    endRound();
    return { endless: endless, passed: passed, winner: winner, again: again, formatBefore: formatBefore, roundsPhase: document.body.dataset.phase, champ: document.getElementById("winner-name").textContent };
  })()`);
  check("endless stays on the recap", formats.endless === "recap", JSON.stringify(formats));
  check(
    "next up opens the pass-the-phone screen",
    formats.passed.phase === "pass" && formats.passed.team.indexOf("Team 2") !== -1,
    JSON.stringify(formats.passed)
  );
  check(
    "first to 20 ends on a winner screen",
    formats.winner.phase === "winner" && formats.winner.name.indexOf("wins") !== -1 && formats.winner.crown >= 1 && formats.winner.bits >= 3 && formats.winner.rematch === "Rematch",
    JSON.stringify(formats.winner)
  );
  check(
    "rematch clears the score and keeps the format",
    formats.again.phase === "pass" && formats.again.score === 0 && formats.again.rounds === 0 && formats.again.format === "score" && formats.formatBefore === "score",
    JSON.stringify(formats.again)
  );
  check(
    "three rounds each ends on a winner",
    formats.roundsPhase === "winner" && formats.champ.indexOf("Team 2") !== -1,
    formats.champ + " " + formats.roundsPhase
  );
  const againTutorial = await ev(`(() => {
    state.settings.tutorialSeen = true;
    saveState();
    document.body.dataset.phase = "setup";
    showStep("round");
    document.getElementById("btn-tap-start").click();
    return { phase: document.body.dataset.phase, hidden: document.getElementById("tutorial").hidden };
  })()`);
  check(
    "the tutorial stays skipped after the first run",
    againTutorial.phase !== "tutorial" && againTutorial.hidden === true,
    JSON.stringify(againTutorial)
  );

  await setViewport(844, 390);
  await setScheme("light");
  const mixRows = await ev(`(() => {
    clearGame();
    stopTimer();
    window.clearTimeout(countdownHandle);
    openSetup("deck");
    const mixBtn = document.querySelector(".group-mix .cat-btn");
    const other = document.querySelector('.cat-btn[data-category="Bible Characters"]');
    const mixBox = mixBtn.getBoundingClientRect();
    const otherBox = other.getBoundingClientRect();
    const tops = [...document.querySelectorAll(".cat-btn")].map((el) => Math.round(el.getBoundingClientRect().top)).filter((top) => top >= 0 && top < 390);
    const rows = tops.filter((top, index) => tops.indexOf(top) === index);
    return { mixH: Math.round(mixBox.height), otherH: Math.round(otherBox.height), rows: rows };
  })()`);
  check(
    "mix is a normal-height tile with two rows visible",
    Math.abs(mixRows.mixH - mixRows.otherH) <= 4 && mixRows.rows.length >= 2,
    JSON.stringify(mixRows)
  );
  async function v7Pair(name) {
    await setScheme("light");
    await delay(40);
    await v7Shot(name + "-light.png");
    await setScheme("dark");
    await delay(40);
    await v7Shot(name + "-dark.png");
    await setScheme("light");
  }
  await v7Pair("setup-deck");
  await ev(`showStep("round"); document.body.dataset.phase = "setup";`);
  await v7Pair("setup-round");
  await ev(`showTutorial();`);
  await v7Pair("tutorial");
  await ev(`document.body.dataset.phase = "home"; document.getElementById("tutorial").hidden = true; renderHome();`);
  await v7Pair("home");
  const shotPrompts = {};
  for (const entry of [["Bible Stories", "play-bible-stories"], ["Actions", "play-actions"], ["Animals", "play-animals"]]) {
    const prompt = await ev(`(() => {
      state.settings.category = ${JSON.stringify(entry[0])};
      state.used = [];
      queue = buildDeck();
      document.body.dataset.phase = "play";
      document.body.classList.add("playing");
      paintCategory();
      deal();
      return document.getElementById("prompt").textContent;
    })()`);
    shotPrompts[entry[0]] = prompt;
    check(entry[0] + " play shot uses a real prompt", (promptMap[entry[0]] || []).indexOf(prompt) !== -1, prompt);
    await v7Pair(entry[1]);
  }
  check(
    "play shots use three different prompts",
    shotPrompts["Bible Stories"] !== shotPrompts.Actions && shotPrompts.Actions !== shotPrompts.Animals && shotPrompts["Bible Stories"] !== shotPrompts.Animals,
    JSON.stringify(shotPrompts)
  );
  await ev(`(() => {
    document.body.classList.remove("playing");
    renderRecap({ name: "Team 1", roundPoints: 3, total: 3, guessed: ["Running"], passed: ["Jumping"], timeUp: "", nextName: "Team 2" });
    document.body.dataset.phase = "recap";
  })()`);
  await v7Pair("recap");
  await ev(`(() => {
    state.teams[0].score = 20;
    state.teams[1].score = 6;
    renderWinner({ name: "Team 1", roundPoints: 2, total: 20, guessed: [], passed: [], timeUp: "", nextName: "Team 2" });
    document.body.dataset.phase = "winner";
  })()`);
  await v7Pair("winner");
  await ev(`(() => {
    state.turnIndex = 1;
    showPassPhone();
  })()`);
  await v7Pair("pass");

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
