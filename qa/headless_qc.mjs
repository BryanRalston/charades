import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = "C:\\Users\\bryma\\dev\\charades";
const QA = ROOT + "\\qa";
const REDESIGN = QA + "\\redesign";
const V5 = QA + "\\v5";
const V6 = QA + "\\v6";
const V7 = QA + "\\v7";
const V8 = QA + "\\v8";
const V81 = QA + "\\v8_1";
const V82 = QA + "\\v8_2";
const V83 = QA + "\\v8_3";
const V84 = QA + "\\v8_4";
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
  "Hum It",
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
mkdirSync(V8, { recursive: true });
mkdirSync(V81, { recursive: true });
mkdirSync(V82, { recursive: true });
mkdirSync(V83, { recursive: true });
mkdirSync(V84, { recursive: true });

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
  const js = readFileSync(ROOT + "\\prompts.js", "utf8");
  const marker = "window.CHARADES_PROMPTS = ";
  const start = js.indexOf(marker);
  const block = js.slice(start + marker.length).trim().replace(/;$/, "");
  return Function("return " + block)();
}

function deckPrompts(deck) {
  if (!deck) return [];
  if (Array.isArray(deck)) return deck;
  return (deck.kids || []).concat(deck.adults || []);
}

const NEAR_STOP = new Set("a an the of and or in on to for with from by at into through over under up down out again away his her its my your their".split(" "));
const NEAR_WATCH = new Set(["rock", "house", "lamp", "map", "pearl", "wheat", "weed", "sand", "park", "lost"]);
const NEAR_ALLOW = new Set([
  "baby moses|baby moses basket",
  "lamp on stand|ten lamps",
  "lost coin|lost sheep",
  "clay lamp|oil lamp",
  "pull weeds|weeding garden",
  "mary poppins|mary poppins returns",
  "sand pail|sand shovel",
  "jesus loves me|jesus loves the little children",
  "jesus loves me|oh how i love jesus",
  "a whole new world|he's got the whole world",
  "jesus heals a boy|jesus heals a leper",
  "make the bed|make the guest bed"
]);

function stemWord(raw) {
  let word = String(raw).toLowerCase().replace(/'s$/g, "").replace(/[^a-z0-9]/g, "");
  if (!word || NEAR_STOP.has(word) || word.length < 3) return "";
  if (word.endsWith("ies") && word.length > 5) word = word.slice(0, -3) + "y";
  else if (/(sses|ches|shes|xes|zes)$/.test(word) && word.length > 5) word = word.slice(0, -2);
  else if (word.endsWith("s") && !/(ss|us|is)$/.test(word) && word.length > 4) word = word.slice(0, -1);
  if (word.endsWith("ing") && word.length > 6) {
    const base = word.slice(0, -3);
    if (base.length >= 3) word = base;
  } else if (word.endsWith("ed") && word.length > 5) {
    const base = word.slice(0, -2);
    if (base.length >= 3) word = base;
  }
  return word;
}

function contentStems(prompt) {
  const stems = [];
  for (const part of String(prompt).split(/\s+/)) {
    const stem = stemWord(part);
    if (stem && stems.indexOf(stem) === -1) stems.push(stem);
  }
  return stems;
}

function nearDuplicates(list) {
  const items = list.map((prompt) => ({ prompt: prompt, stems: contentStems(prompt) }));
  const freq = new Map();
  for (const item of items) {
    for (const stem of item.stems) freq.set(stem, (freq.get(stem) || 0) + 1);
  }
  const flagged = [];
  const allowed = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const left = items[i].stems;
      const right = items[j].stems;
      if (left.length < 2 || right.length < 2) continue;
      const shared = left.filter((stem) => right.indexOf(stem) !== -1);
      if (!shared.length) continue;
      const union = new Set(left.concat(right)).size;
      const similar = shared.length / union >= 0.5;
      const watched = left.length === 2 && right.length === 2 && shared.some((stem) => NEAR_WATCH.has(stem) && freq.get(stem) === 2);
      if (!similar && !watched) continue;
      const key = [items[i].prompt, items[j].prompt].map((prompt) => prompt.toLowerCase()).sort().join("|");
      const label = items[i].prompt + " / " + items[j].prompt;
      if (NEAR_ALLOW.has(key)) allowed.push(label);
      else flagged.push(label + " [" + shared.join(",") + "]");
    }
  }
  return { flagged: flagged, allowed: allowed };
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
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
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

  async function shot() {}

  async function setScheme(scheme) {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme }]
    });
  }

  async function v6Shot() {}

  async function v7Shot() {}

  async function v8Shot() {}

  async function v81Shot() {}

  async function v82Shot() {}

  async function v82Pair(name) {
    await setScheme("light");
    await delay(40);
    await v82Shot(name + "-light.png");
    await setScheme("dark");
    await delay(40);
    await v82Shot(name + "-dark.png");
    await setScheme("light");
  }

  async function v83Shot() {}

  async function v84Shot() {}

  async function v83Pair(name) {
    await setScheme("light");
    await delay(40);
    await v83Shot(name + "-light.png");
    await setScheme("dark");
    await delay(40);
    await v83Shot(name + "-dark.png");
    await setScheme("light");
  }

  const DIALOG_IDS = ["share-modal", "deck-offer", "pause-modal", "confirm-modal", "deck-empty", "deck-editor"];
  async function assertDialogsClosed(where) {
    const open = await ev(`(${JSON.stringify(DIALOG_IDS)}).filter((id) => { const el = document.getElementById(id); return el && el.hidden === false; })`);
    check("no dialog is open before " + where, Array.isArray(open) && open.length === 0, (open || []).join(","));
  }
  async function closeShotDialogs() {
    await ev(`["share-modal","deck-offer","deck-editor","pause-modal","confirm-modal","deck-empty"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`);
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
  check("tilt math and sensor handlers are byte-identical to v8.1", tiltSame, JSON.stringify(tiltNow));
  const swSource = readFileSync(ROOT + "\\sw.js", "utf8");
  const deckFiles = ["bible-characters","bible-stories","miracles-parables","christmas-easter","church-life","bible-animals","bible-places-things","hum-it","actions","jobs","sports","animals","chores","movies","everyday-objects","foods","outdoor-fun","mix"];
  check(
    "sw cache is charades-v8-5-2",
    swSource.indexOf('const CACHE = "charades-v8-5-2"') !== -1 && swSource.indexOf('ASSET_VERSION = "8.5.2"') !== -1 && swSource.indexOf('"./prompts.js"') !== -1 && deckFiles.every((name) => swSource.indexOf("./assets/decks/" + name + ".webp") !== -1),
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
  check("category buttons match the deck names plus Mix", JSON.stringify(rendered.categories) === JSON.stringify(EXPECTED.concat(["Mix"])), rendered.categories.join(" | "));
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
  check("play colors are saturated for every category", colorSheet.actions === "#EA580C,#C2410C" && colorSheet.muddy === false && colorSheet.count === EXPECTED.length, JSON.stringify(colorSheet));
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
  await assertDialogsClosed("v6 play");
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
    await assertDialogsClosed("v6 " + entry[1]);
    await v6Shot(entry[1] + "-light.png");
    await setScheme("dark");
    await v6Shot(entry[1] + "-dark.png");
    await setScheme("light");
  }
  await setViewport(932, 430);
  await delay(150);
  await assertDialogsClosed("v6 play 932");
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
  await assertDialogsClosed("v6 recap");
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
    const deck = promptMap[name] || {};
    const kids = (deck.kids || []).length;
    const adults = (deck.adults || []).length;
    const count = kids + adults;
    const floor = 30;
    check(name + " has at least 40 prompts", count >= 40, String(count));
    check(name + " has at least " + floor + " kids and " + floor + " adults", kids >= floor && adults >= floor, kids + "/" + adults);
  }
  const seenPrompts = new Map();
  const duplicatePrompts = [];
  for (const name of EXPECTED) {
    for (const prompt of deckPrompts(promptMap[name])) {
      const key = String(prompt).trim().toLowerCase();
      if (seenPrompts.has(key)) duplicatePrompts.push(prompt + " in " + seenPrompts.get(key) + " and " + name);
      else seenPrompts.set(key, name);
    }
  }
  check("no prompt appears in two categories", duplicatePrompts.length === 0, duplicatePrompts.slice(0, 8).join("; ") || "unique");
  const longKids = [];
  for (const name of EXPECTED) {
    if (name === "Hum It") continue;
    for (const prompt of (promptMap[name].kids || [])) {
      if (String(prompt).trim().split(/\s+/).length > 5) longKids.push(name + ": " + prompt);
    }
  }
  check("kids prompts are at most five words", longKids.length === 0, longKids.slice(0, 6).join("; ") || "short");
  const nearFlagged = [];
  const nearAllowed = [];
  for (const name of EXPECTED) {
    const found = nearDuplicates(deckPrompts(promptMap[name]));
    found.flagged.forEach((pair) => nearFlagged.push(name + ": " + pair));
    found.allowed.forEach((pair) => nearAllowed.push(name + ": " + pair));
  }
  check("no unlisted near-duplicates", nearFlagged.length === 0, nearFlagged.slice(0, 6).join("; ") || "allowed " + nearAllowed.join("; "));
  const removedCards = ["Friendship Pad", "Pew Pencil", "Known Sheep", "Sorted Sheep", "Ready Feast", "Healed at Once", "Salt Steps", "Boot Tray", "Rock Badger", "Doxology", "Benediction", "Pink Egg", "Backpack Strap", "Dairy Cow", "Praying in Fish", "Sudden Fig Tree", "Methuselah", "Dorcas", "Thorny Soil", "Swept Floor", "Hidden Coin", "Narrow Door", "Rising Dough", "New Skins", "Dawn Workers", "Evening Workers", "Hand Made Whole", "Faraway Healing", "Official's Son", "Distant Son Healed", "Servant Healed", "Rainbow Promise", "Rainbow Sky", "Dove Returns", "Dove With Leaf", "Cloud Leads On", "Thin Cow", "Raven Pair", "Little Lamb", "Pet Lamb", "Shepherd Lamb", "Big Fish", "Great Fish", "Blue Egg", "Plastic Egg", "Hidden Egg", "Toy Story 2", "Toy Story 3", "Toy Story 4", "Despicable Me 2", "Despicable Me 3", "Despicable Me 4", "Happy Feet Two", "102 Dalmatians", "Incredibles 2", "Frozen 2", "Rock House", "Sand House", "House on Sand", "Foolish Builder", "Water Into Wine", "Full Jars", "Feeding the 5,000", "Folding a Map", "Parking a Car", "Waving Down a Ride", "Puss in Boots", "I Am a Sunbeam", "Lame Man Walks", "Pool Steps", "Hidden Pearl", "Old Wineskins", "Wedding Garment", "Bright Lamp", "Seed in the Dirt", "Sling and Stone", "Karate Kid", "The Karate Kid", "Red Sea", "Morning Manna", "Baby Moses", "Basket Boat", "River Basket", "Baby Moses Basket", "Ark Animals", "Giant Grapes", "Follow Star", "Family Hug", "Foot Hop", "Bunny Hop", "Waving Goodbye", "Wrapping a Gift", "Stow Toys"];
  const addedScenes = ["David and Goliath", "Jonah and the Whale", "Loaves and Fish", "Zacchaeus in the Tree", "Samson and Delilah", "Paul's Shipwreck", "Baby Moses in a Basket", "Daniel in the Lions' Den", "The Last Supper"];
  const hasPrompt = (prompt) => EXPECTED.some((name) => deckPrompts(promptMap[name]).indexOf(prompt) !== -1);
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
  await assertDialogsClosed("v6 live play");
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
    await assertDialogsClosed("v6 live recap");
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

  const used = deckPrompts(promptMap.Actions).map((prompt) => "Actions\n" + prompt);
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
  check("reshuffle deals a prompt again", deckPrompts(promptMap.Actions).indexOf(reshuffled) !== -1, reshuffled);
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
    function shown() {
      const el = document.getElementById('btn-pause');
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.display !== 'none' && box.width >= 40 && box.width <= 44 && box.height >= 40 && box.height <= 44 && box.left >= 24;
    }
    function hits(a, b) {
      if (!a || !b || a.width === 0 || b.width === 0) return false;
      return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    }
    const savedPhase = document.body.dataset.phase;
    const visible = {};
    ['prep', 'countdown', 'play', 'empty', 'recap'].forEach((phase) => {
      document.body.dataset.phase = phase;
      visible[phase] = shown();
    });
    document.body.dataset.phase = savedPhase;
    const box = document.getElementById('btn-pause').getBoundingClientRect();
    const clear = !hits(box, document.getElementById('prompt').getBoundingClientRect()) && !hits(box, document.getElementById('btn-pass').getBoundingClientRect()) && !hits(box, document.getElementById('btn-correct').getBoundingClientRect());
    const before = Math.round(timerRemaining());
    document.getElementById('btn-pause').click();
    const open = document.getElementById('pause-modal').hidden === false && document.body.dataset.paused === 'user' && document.getElementById('pause-text').textContent === 'Leave game?' && document.getElementById('pause-note').textContent === 'Your scores are saved.' && document.getElementById('btn-resume').textContent === 'Keep Playing' && document.getElementById('btn-pause-end').textContent === 'Main Menu';
    const score = document.getElementById('play-score').textContent;
    document.getElementById('btn-correct').click();
    resolveRound('correct', 'tilt');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const held = document.getElementById('play-score').textContent === score;
    document.getElementById('btn-resume').click();
    const after = Math.round(timerRemaining());
    const resumed = document.getElementById('pause-modal').hidden === true && !document.body.dataset.paused && Math.abs(after - before) <= 150;
    document.getElementById('btn-pause').click();
    const snap = { score: state.teams.map((team) => team.score).join(','), turn: state.turnIndex, names: state.teams.map((team) => team.name).join('|'), ms: Math.round(timerLeftMs) };
    document.getElementById('btn-pause-end').click();
    const resumeBtn = document.getElementById('btn-continue');
    const menu = document.body.dataset.phase === 'home' && resumeBtn.hidden === false && resumeBtn.textContent === 'Resume' && state.turnIndex === snap.turn;
    return { visible: visible, clear: clear, open: open, held: held, resumed: resumed, delta: after - before, menu: menu, snap: snap };
  })()`);
  check(
    "leave sheet pauses, blocks tilt and keys, and returns home",
    pauseUi.visible.prep && pauseUi.visible.countdown && pauseUi.visible.play && pauseUi.visible.empty && pauseUi.visible.recap && pauseUi.clear && pauseUi.open && pauseUi.held && pauseUi.resumed && pauseUi.menu,
    JSON.stringify(pauseUi)
  );
  const resumedGame = await ev(`(async () => {
    document.getElementById('btn-continue').click();
    const setup = document.body.dataset.phase === 'setup' && document.getElementById('setup').dataset.step === 'round';
    document.getElementById('btn-tap-start').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    return { setup: setup, phase: document.body.dataset.phase };
  })()`);
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0", 12000, "resume from menu");
  const restored = await ev(`({
    score: state.teams.map((team) => team.score).join(','),
    turn: state.turnIndex,
    names: state.teams.map((team) => team.name).join('|'),
    left: Math.round(timerRemaining())
  })`);
  check(
    "resume restores the score, turn, teams and time",
    resumedGame.setup && restored.score === pauseUi.snap.score && restored.turn === pauseUi.snap.turn && restored.names === pauseUi.snap.names && Math.abs(restored.left - pauseUi.snap.ms) < 2000,
    JSON.stringify({ resumedGame: resumedGame, restored: restored, snap: pauseUi.snap })
  );
  await ev(`(() => {
    clearRound();
    pendingResumeMs = 0;
    stopTimer();
    document.body.dataset.phase = 'recap';
    document.body.classList.remove('playing');
    const modal = document.getElementById('pause-modal');
    if (modal) modal.hidden = true;
    return true;
  })()`);

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
    check(entry[0] + " play shot uses a real prompt", deckPrompts(promptMap[entry[0]]).indexOf(prompt) !== -1, prompt);
    await assertDialogsClosed("v7 " + entry[1]);
    await v7Pair(entry[1]);
  }
  check(
    "play shots use three different prompts",
    shotPrompts["Bible Stories"] !== shotPrompts.Actions && shotPrompts.Actions !== shotPrompts.Animals && shotPrompts["Bible Stories"] !== shotPrompts.Animals,
    JSON.stringify(shotPrompts)
  );
  await ev(`(() => {
    document.body.classList.remove("playing");
    clearGame();
    state.teams[0].score = 3;
    state.teams[1].score = 0;
    renderRecap({ name: "Team 1", roundPoints: 3, total: 3, guessed: ["Running", "Jumping", "Swimming"], passed: ["Dancing"], timeUp: "", nextName: "Team 2" });
    document.body.dataset.phase = "recap";
  })()`);
  await assertDialogsClosed("v7 recap");
  await v7Pair("recap");
  await ev(`(() => {
    state.settings.format = "score";
    state.teams[0].score = 20;
    state.teams[1].score = 6;
    renderWinner({ name: "Team 1", roundPoints: 2, total: 20, guessed: [], passed: [], timeUp: "", nextName: "Team 2" });
    document.body.dataset.phase = "winner";
  })()`);
  await assertDialogsClosed("v7 winner");
  await v7Pair("winner");
  await ev(`(() => {
    state.turnIndex = 1;
    showPassPhone();
  })()`);
  await v7Pair("pass");

  const animals = deckPrompts(promptMap["Bible Animals"]);
  check("Bible Animals keeps one dove and one raven", animals.filter((prompt) => /dove/i.test(prompt)).join(",") === "Dove" && animals.filter((prompt) => /raven/i.test(prompt)).join(",") === "Raven", animals.filter((prompt) => /dove|raven/i.test(prompt)).join(","));
  check("Bible Animals stays at 100 or more", animals.length >= 100, String(animals.length));
  const humDeck = promptMap["Hum It"] || { kids: [], adults: [] };
  const hum = deckPrompts(humDeck);
  check(
    "Hum It keeps the first kids songs and leaves Jingle Bells out",
    humDeck.kids[0] === "Jesus Loves Me" && humDeck.kids[1] === "This Little Light of Mine" && hum.indexOf("Jingle Bells") === -1 && humDeck.kids.length >= 40 && humDeck.adults.length >= 40,
    humDeck.kids.length + "/" + humDeck.adults.length
  );
  const trackedBriefs = execFileSync("git", ["ls-files", "briefs"], { cwd: ROOT, encoding: "utf8" }).trim();
  const ignore = readFileSync(ROOT + "\\.gitignore", "utf8");
  check("briefs are untracked", trackedBriefs === "" && ignore.indexOf("briefs/") !== -1, trackedBriefs || "clean");

  const consistent = await ev(`(() => {
    clearGame();
    state.settings.category = "Actions";
    state.settings.format = "endless";
    state.settings.tutorialSeen = true;
    document.body.classList.remove("portrait", "playing");
    delete document.body.dataset.paused;
    timerMark = 0;
    const rounds = [["Running", "correct"], ["Jumping", "correct"], ["Swimming", "correct"], ["Dancing", "pass"]];
    rounds.forEach((pair) => {
      queue = [{ category: "Actions", prompt: "Extra", key: "Actions\\nExtra" }];
      currentCard = { category: "Actions", prompt: pair[0], key: "Actions\\n" + pair[0] };
      document.body.dataset.phase = "play";
      resolveRound(pair[1], "button");
    });
    currentCard = { category: "Actions", prompt: "Singing", key: "Actions\\nSinging" };
    document.body.dataset.phase = "play";
    endRound();
    const scores = [...document.querySelectorAll("#standings .stand-score")].map((node) => node.textContent);
    const passed = document.getElementById("recap-passed").textContent;
    return {
      line: document.getElementById("recap-line").textContent,
      guessed: document.getElementById("recap-guessed").textContent,
      passed: passed,
      scores: scores,
      phase: document.body.dataset.phase
    };
  })()`);
  check(
    "real cards keep the recap and standings together",
    consistent.line === "Team 1 scored 3! Total: 3." && consistent.guessed.indexOf("Running") !== -1 && consistent.guessed.indexOf("Jumping") !== -1 && consistent.guessed.indexOf("Swimming") !== -1 && consistent.passed.indexOf("Dancing") !== -1 && consistent.passed.indexOf("Singing") !== -1 && consistent.passed.indexOf("time's up") !== -1 && consistent.scores[0] === "3" && consistent.scores[1] === "0",
    JSON.stringify(consistent)
  );
  const winners = await ev(`(() => {
    const run = (setup) => {
      clearGame();
      state.settings.category = "Actions";
      setup();
      document.body.dataset.phase = "play";
      currentCard = null;
      timerMark = 0;
      endRound();
      return document.getElementById("winner-line").textContent;
    };
    const score = run(() => { state.settings.format = "score"; state.teams[0].score = 20; state.teams[1].score = 9; });
    const rounds = run(() => { state.settings.format = "rounds"; state.teams[0].score = 14; state.teams[1].score = 9; state.roundsPlayed = state.teams.length * 3 - 1; });
    const tieScore = run(() => { state.settings.format = "score"; state.teams[0].score = 20; state.teams[1].score = 20; });
    const tieRounds = run(() => { state.settings.format = "rounds"; state.teams[0].score = 9; state.teams[1].score = 9; state.roundsPlayed = state.teams.length * 3 - 1; });
    return { score, rounds, tieScore, tieRounds };
  })()`);
  check("winner wording follows the match format", winners.score === "Team 1 wins with 20 points!" && winners.rounds === "Team 1 wins, 14 to 9, after 3 rounds each." && winners.tieScore === "It's a tie at 20 points!" && winners.tieRounds === "It's a tie at 9 points after 3 rounds each.", JSON.stringify(winners));

  await setViewport(844, 390);
  await setScheme("light");
  const contrast = await ev(`(() => {
    clearGame();
    renderHome();
    document.body.dataset.phase = "home";
    const read = (selector) => {
      const name = document.querySelector(selector + " .stand-name");
      const bar = document.querySelector(selector + " .stand-bar");
      const nameStyle = name ? getComputedStyle(name) : null;
      const barStyle = bar ? getComputedStyle(bar) : null;
      return { color: nameStyle && nameStyle.color, opacity: nameStyle && nameStyle.opacity, bar: barStyle && barStyle.opacity };
    };
    renderRecap({ name: "Team 1", roundPoints: 0, total: 0, guessed: [], passed: [], timeUp: "", nextName: "Team 2" });
    renderWinner({ name: "Team 1", roundPoints: 0, total: 0, guessed: [], passed: [], timeUp: "", nextName: "Team 2" });
    return { home: read("#home-standings"), recap: read("#standings"), winner: read("#winner-standings") };
  })()`);
  check(
    "zero scores keep full text contrast and dim only the bar",
    ["home", "recap", "winner"].every((key) => contrast[key].color === "rgb(28, 28, 30)" && contrast[key].opacity === "1" && contrast[key].bar === "0.4"),
    JSON.stringify(contrast)
  );

  const length = await ev(`(() => {
    clearGame();
    document.body.dataset.phase = "setup";
    showStep("round");
    setRoundSeconds(10, true);
    const minus = document.getElementById("length-minus");
    minus.click();
    const atFloor = state.settings.seconds;
    setRoundSeconds(300, true);
    document.getElementById("length-plus").click();
    const atCap = state.settings.seconds;
    setRoundSeconds(10, true);
    document.getElementById("length-plus").click();
    const stepped = state.settings.seconds;
    setRoundSeconds(45, true);
    const label = document.getElementById("custom-seconds-text").textContent;
    const open = document.getElementById("length-stepper").hidden === false;
    paintRing(45);
    const ring = document.getElementById("ring-progress");
    const full = Number(ring.style.strokeDashoffset);
    paintRing(15);
    const mid = Number(ring.style.strokeDashoffset);
    paintRing(0);
    const empty = Number(ring.style.strokeDashoffset);
    document.body.dataset.phase = "play";
    delete document.body.dataset.paused;
    state.settings.seconds = 45;
    timerLeftMs = 11000;
    timerMark = performance.now();
    onTimer();
    const quiet = document.getElementById("timer").classList.contains("urgent");
    timerLeftMs = 10000;
    timerMark = performance.now();
    onTimer();
    const pulse45 = document.getElementById("timer").classList.contains("urgent");
    const anim = getComputedStyle(document.querySelector(".timer-wrap")).animationName;
    state.settings.seconds = 10;
    timerLeftMs = 10000;
    timerMark = performance.now();
    onTimer();
    const pulse10 = document.getElementById("timer").classList.contains("urgent");
    setRoundSeconds(45, true);
    return { atFloor, atCap, stepped, label, open, full, mid, empty, quiet, pulse45, anim, pulse10 };
  })()`);
  check(
    "custom length clamps, steps by 5, and scales the ring and pulse",
    length.atFloor === 10 && length.atCap === 300 && length.stepped === 15 && length.label === "45s" && length.open === true && Math.abs(length.full) < 1 && Math.abs(length.mid - 192.68) < 1 && Math.abs(length.empty - 289.03) < 1 && length.quiet === false && length.pulse45 === true && length.pulse10 === true && length.anim.indexOf("pulse") !== -1,
    JSON.stringify(length)
  );
  async function v8Pair(name) {
    await setScheme("light");
    await delay(40);
    await v8Shot(name + "-light.png");
    await setScheme("dark");
    await delay(40);
    await v8Shot(name + "-dark.png");
    await setScheme("light");
  }
  await ev(`(() => { document.body.dataset.phase = "setup"; showStep("round"); setRoundSeconds(45, true); })()`);
  await v8Pair("stepper");
  const recordBox = await ev(`(() => { const box = document.getElementById("record-reactions").getBoundingClientRect(); return { top: box.top, bottom: box.bottom, width: box.width }; })()`);
  check("record toggle is visible on the round step", recordBox.top >= 0 && recordBox.bottom <= 390 && recordBox.width > 8, JSON.stringify(recordBox));
  await v8Pair("setup-style");

  const deckArt = await ev(`(async () => {
    openSetup("deck");
    const imgs = [...document.querySelectorAll("#category-picker img.cat-art")];
    const sizeOf = () => [...document.querySelectorAll("#category-picker .cat-btn")].map((el) => {
      const box = el.getBoundingClientRect();
      return Math.round(box.width) + "x" + Math.round(box.height);
    }).join("|");
    const before = sizeOf();
    for (const img of imgs) {
      img.scrollIntoView({ block: "center" });
      if (!img.complete || img.naturalWidth !== 640) {
        try { await img.decode(); } catch (err) {}
      }
    }
    const failed = imgs.filter((img) => img.naturalWidth !== 640).map((img) => img.getAttribute("src"));
    return { count: imgs.length, failed: failed, stable: before === sizeOf(), alt: imgs.every((img) => (img.alt || "").indexOf("deck illustration") !== -1) };
  })()`);
  check("all 18 deck pictures load at 640 pixels", deckArt.count === 18 && deckArt.failed.length === 0 && deckArt.alt === true, JSON.stringify(deckArt));
  check("deck cards do not jump when pictures load", deckArt.stable === true, JSON.stringify(deckArt));
  await setViewport(844, 390);
  await ev(`openSetup("deck");`);
  await v8Pair("deck");

  const deckShare = await ev(`(async () => {
    const deck = saveCustomDeck("Picnic", "Ants\\nBasket\\nBlanket");
    const tile = document.querySelector("#my-deck-list .cat-btn");
    const art = tile.querySelector(".cat-art-custom");
    const customTile = { img: Boolean(tile.querySelector("img")), art: Boolean(art), bg: art ? getComputedStyle(art).backgroundImage : "" };
    const url = await openDeckShare(deck);
    const canvas = document.getElementById("share-qr");
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 40 && pixels[i + 1] < 40 && pixels[i + 2] < 40) dark += 1;
    const prompts = deck.prompts.slice();
    state.customDecks = [];
    saveState();
    renderMyDecks();
    location.hash = url.slice(url.indexOf("#"));
    return { prompts, url, dark, customTile };
  })()`);
  await waitFor("document.getElementById('deck-offer').hidden === false", 5000, "deck offer");
  await v8Pair("deck-share");
  const addedDeck = await ev(`(() => {
    document.getElementById("btn-add-shared").click();
    const deck = state.customDecks[state.customDecks.length - 1];
    selectCategory("custom:" + deck.id);
    const dealt = cardsForCategory("custom:" + deck.id).map((card) => card.prompt);
    state.settings.category = "Mix";
    const mixed = buildDeck().some((card) => card.prompt === "Ants" && card.category === "Picnic");
    return { prompts: deck.prompts, dealt, mixed, hidden: document.getElementById("deck-offer").hidden };
  })()`);
  check("custom deck tile is a gradient with no image", deckShare.customTile.img === false && deckShare.customTile.art === true && deckShare.customTile.bg.indexOf("gradient") !== -1, JSON.stringify(deckShare.customTile));
  check("a shared deck round-trips with the same prompts", addedDeck.hidden === true && addedDeck.prompts.join("|") === "Ants|Basket|Blanket" && addedDeck.dealt.join("|") === "Ants|Basket|Blanket" && addedDeck.mixed === true, JSON.stringify(addedDeck));
  check("the deck QR draws dark modules", deckShare.dark > 40, String(deckShare.dark));
  await closeShotDialogs();

  const styleRead = await ev(`(() => {
    return ["act", "describe", "hum"].map((value) => {
      state.settings.style = value;
      paintCategory();
      return document.getElementById("play-style").textContent + "/" + document.getElementById("prep-style").textContent;
    });
  })()`);
  check("styles show on prep and play", JSON.stringify(styleRead) === JSON.stringify(["Act It/Act It", "Describe It/Describe It", "Hum It/Hum It"]), JSON.stringify(styleRead));
  const styleShots = [["act", "Actions", "play-act"], ["describe", "Animals", "play-describe"], ["hum", "Hum It", "play-hum"]];
  const stylePrompts = {};
  for (const entry of styleShots) {
    const prompt = await ev(`(() => {
      state.settings.style = ${JSON.stringify(entry[0])};
      state.settings.category = ${JSON.stringify(entry[1])};
      state.used = [];
      queue = buildDeck();
      document.body.dataset.phase = "play";
      document.body.classList.add("playing");
      document.body.classList.remove("portrait");
      paintCategory();
      deal();
      return document.getElementById("prompt").textContent;
    })()`);
    stylePrompts[entry[0]] = prompt;
    check(entry[1] + " style shot uses a real prompt", deckPrompts(promptMap[entry[1]]).indexOf(prompt) !== -1, prompt);
    await assertDialogsClosed("v8 " + entry[2]);
    await v8Pair(entry[2]);
  }
  check("style shots use three different prompts", stylePrompts.act !== stylePrompts.describe && stylePrompts.describe !== stylePrompts.hum && stylePrompts.act !== stylePrompts.hum, JSON.stringify(stylePrompts));

  const cameraOrder = await ev(`(async () => {
    const calls = [];
    DeviceOrientationEvent.requestPermission = () => { calls.push("orient"); return Promise.resolve("granted"); };
    DeviceMotionEvent.requestPermission = () => { calls.push("motion"); return Promise.resolve("granted"); };
    window.__origGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = () => { calls.push("gum"); return Promise.reject(new Error("denied")); };
    clearGame();
    state.settings.tutorialSeen = true;
    state.settings.category = "Actions";
    state.settings.recordReactions = false;
    state.settings.seconds = 30;
    document.body.dataset.phase = "setup";
    showStep("round");
    document.getElementById("btn-tap-start").click();
    const off = calls.slice();
    await new Promise((resolve) => setTimeout(resolve, 80));
    calls.length = 0;
    state.settings.recordReactions = true;
    document.body.dataset.phase = "setup";
    showStep("round");
    document.getElementById("btn-tap-start").click();
    const on = calls.slice();
    return { off, on };
  })()`);
  check("getUserMedia stays unused when record is off", cameraOrder.off.indexOf("gum") === -1 && cameraOrder.off[0] === "orient" && cameraOrder.off[1] === "motion", JSON.stringify(cameraOrder.off));
  check("motion permission calls come before the camera", cameraOrder.on[0] === "orient" && cameraOrder.on[1] === "motion" && cameraOrder.on.indexOf("gum") > 1, JSON.stringify(cameraOrder.on));
  await waitFor("document.body.dataset.phase === 'play' || document.body.dataset.phase === 'countdown' || document.body.dataset.phase === 'prep'", 8000, "denied camera still starts");
  const deniedPhase = await ev("document.body.dataset.phase");
  check("a denied camera still starts the round", deniedPhase === "prep" || deniedPhase === "countdown" || deniedPhase === "play", deniedPhase);

  await ev(`(() => {
    navigator.mediaDevices.getUserMedia = window.__origGum;
    clearGame();
    stopTimer();
    window.clearTimeout(countdownHandle);
    state.settings.tutorialSeen = true;
    state.settings.category = "Actions";
    state.settings.recordReactions = true;
    state.settings.seconds = 1;
    document.body.dataset.phase = "setup";
    showStep("round");
    document.getElementById("record-reactions").checked = true;
    document.getElementById("btn-tap-start").click();
    return document.body.dataset.phase;
  })()`);
  await waitFor("document.documentElement.dataset.recordStop === 'cap' && Number(document.documentElement.dataset.recordBlob) > 0 && document.documentElement.dataset.recordTracks.indexOf('live') === -1 && document.documentElement.dataset.recordCapMs === '1000'", 15000, "reaction clip cap");
  const recorded = await ev(`({ stop: document.documentElement.dataset.recordStop, blob: document.documentElement.dataset.recordBlob, tracks: document.documentElement.dataset.recordTracks, cap: document.documentElement.dataset.recordCapMs })`);
  check("a fake camera records a capped clip and stops the tracks", recorded.stop === "cap" && Number(recorded.blob) > 0 && recorded.tracks.indexOf("live") === -1 && recorded.cap === "1000", JSON.stringify(recorded));
  await ev(`(() => { if (document.body.dataset.phase === "play" || document.body.dataset.phase === "empty") endRound(); })()`);
  await waitFor("document.getElementById('recap-video').hidden === false", 5000, "reaction preview");
  check("the recap shows the reaction preview", await ev("document.getElementById('recap-video').hidden === false"), "");
  await setViewport(844, 390);
  await assertDialogsClosed("v8 recap video");
  await v8Pair("recap-video");
  await ev(`(() => {
    clearGame();
    state.teams[0].score = 3;
    state.teams[1].score = 0;
    renderRecap({ name: "Team 1", roundPoints: 3, total: 3, guessed: ["Running", "Jumping", "Swimming"], passed: ["Dancing", "Singing"], timeUp: "Singing", nextName: "Team 2" });
    document.body.dataset.phase = "recap";
  })()`);
  await assertDialogsClosed("v8 recap");
  await v8Pair("recap");
  await ev(`(() => {
    state.settings.format = "score";
    state.teams[0].score = 20;
    state.teams[1].score = 9;
    renderWinner({ name: "Team 1", roundPoints: 3, total: 20, guessed: [], passed: [], timeUp: "", nextName: "Team 2" });
    document.body.dataset.phase = "winner";
  })()`);
  await assertDialogsClosed("v8 winner");
  await v8Pair("winner");

  await ev(`setRoundSeconds(45, true);`);
  await cdp.send("Page.navigate", { url: BASE });
  await waitFor("document.readyState === 'complete' && !!document.getElementById('btn-tap-start')", 10000, "reload custom length");
  await delay(300);
  const persisted = await ev(`({ seconds: state.settings.seconds, label: document.getElementById("custom-seconds-text").textContent, open: document.getElementById("length-stepper").hidden === false })`);
  check("a custom length reloads from localStorage", persisted.seconds === 45 && persisted.label === "45s" && persisted.open === true, JSON.stringify(persisted));

  const indexBytes = readFileSync(ROOT + "\\index.html").length;
  check("index.html is under 150 KB", indexBytes < 150 * 1024, String(indexBytes));

  async function measureDeck(width, height) {
    await setViewport(width, height);
    await delay(80);
    const measured = await ev(`(() => {
      openSetup("deck");
      const editor = document.getElementById("deck-editor");
      if (editor) editor.hidden = true;
      const scroller = document.getElementById("category-picker");
      scroller.scrollTop = 0;
      const view = scroller.getBoundingClientRect();
      const cards = [...scroller.querySelectorAll(".cat-btn")];
      const full = cards.filter((el) => {
        const box = el.getBoundingClientRect();
        return box.height > 20 && box.top >= view.top - 1 && box.bottom <= view.bottom + 1 && box.left >= view.left - 1 && box.right <= view.right + 1;
      });
      const tops = full.map((el) => Math.round(el.getBoundingClientRect().top));
      const rows = tops.filter((top, index) => tops.indexOf(top) === index);
      return { viewH: Math.round(view.height), viewTop: Math.round(view.top), full: full.length, rows: rows.length, cardH: full.length ? Math.round(full[0].getBoundingClientRect().height) : 0, rowTops: rows };
    })()`);
    return Object.assign({ width, height }, measured);
  }
  const deckWide = await measureDeck(844, 390);
  check("deck list shows two full rows at 844x390", deckWide.rows >= 2, JSON.stringify(deckWide));
  await setScheme("light");
  await v81Shot("deck-light.png");
  await setScheme("dark");
  await v81Shot("deck-dark.png");
  await setScheme("light");
  const deckTall = await measureDeck(390, 844);
  check("deck list shows two full rows at 390x844", deckTall.rows >= 2, JSON.stringify(deckTall));
  await v81Shot("deck-portrait.png");
  await setViewport(844, 390);
  await delay(80);

  const created = await ev(`(() => {
    openSetup("deck");
    const button = document.getElementById("btn-new-deck");
    button.scrollIntoView({ block: "center" });
    return { text: button.textContent, open: document.getElementById("deck-editor").hidden };
  })()`);
  check("the new deck tile is in the deck list", created.text === "+ New deck" && created.open === true, JSON.stringify(created));
  await v81Shot("new-deck-closed.png");
  const savedDeck = await ev(`(() => {
    document.getElementById("btn-new-deck").click();
    const opened = document.getElementById("deck-editor").hidden === false;
    document.getElementById("deck-name").value = "Snacks";
    document.getElementById("deck-prompts").value = "Pretzel\\nPopcorn\\nApple";
    document.getElementById("btn-save-deck").click();
    const tile = [...document.querySelectorAll("#my-deck-list .cat-btn")].find((el) => el.textContent === "Snacks");
    return { opened, closed: document.getElementById("deck-editor").hidden === true, name: tile ? tile.textContent : "", count: tile ? tile.parentElement.querySelector(".cat-count").textContent : "" };
  })()`);
  check("saving a new deck adds its tile", savedDeck.opened === true && savedDeck.closed === true && savedDeck.name === "Snacks" && savedDeck.count === "3", JSON.stringify(savedDeck));
  await ev(`document.getElementById("btn-new-deck").click()`);
  await v81Shot("new-deck-open.png");
  await ev(`document.getElementById("btn-deck-editor-close").click()`);
  await ev(`(() => {
    const tile = [...document.querySelectorAll("#my-deck-list .cat-btn")].find((el) => el.textContent === "Snacks");
    tile.parentElement.querySelector(".deck-share").click();
  })()`);
  await waitFor("document.getElementById('share-modal').hidden === false && document.getElementById('share-link').value.indexOf('#d=') !== -1", 4000, "new deck share");
  check("a new deck can still be shared", await ev("document.getElementById('share-link').value.indexOf('#d=') !== -1"), await ev("document.getElementById('share-link').value"));
  await closeShotDialogs();

  const humLabels = await ev(`(() => {
    const hums = (list) => list.filter((text) => text === "Hum It").length;
    const read = (style, category) => {
      state.settings.style = style;
      state.settings.category = category;
      state.used = [];
      queue = buildDeck();
      currentCard = null;
      document.body.dataset.phase = "prep";
      document.body.classList.remove("portrait");
      paintCategory();
      const prep = document.getElementById("prep-style").textContent;
      deal();
      const play = document.getElementById("play-style").textContent;
      const catEl = document.getElementById("prompt-cat");
      const cat = catEl.hidden ? "" : catEl.textContent;
      return { prep, prepHum: hums([prep]), play, cat, playHum: hums([play, cat]) };
    };
    return { same: read("hum", "Hum It"), other: read("hum", "Animals"), deck: read("describe", "Hum It") };
  })()`);
  check(
    "Hum It is shown once when the style and the deck match",
    humLabels.same.prep === "Hum It" && humLabels.same.prepHum === 1 && humLabels.same.play === "Hum It" && humLabels.same.cat === "" && humLabels.same.playHum === 1 && humLabels.other.play === "Hum It" && humLabels.other.cat === "Animals" && humLabels.other.playHum === 1 && humLabels.deck.prep === "Describe It" && humLabels.deck.cat === "Hum It" && humLabels.deck.playHum === 1,
    JSON.stringify(humLabels)
  );
  await setViewport(844, 390);
  await ev(`(() => {
    state.settings.style = "hum";
    state.settings.category = "Hum It";
    state.used = [];
    queue = buildDeck();
    document.body.classList.remove("portrait");
    document.body.classList.add("playing");
    paintCategory();
    deal();
  })()`);
  await assertDialogsClosed("v8.1 hum");
  await setScheme("light");
  await v81Shot("play-hum-light.png");
  await setScheme("dark");
  await v81Shot("play-hum-dark.png");
  await setScheme("light");

  const cachedPrompts = await ev(`(async () => {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 8000))
    ]);
    if (!ready) return { ok: false, why: "not ready" };
    const cache = await caches.open("charades-v8-5-2");
    const url = new URL("prompts.js", location.href).href;
    const res = await cache.match(url) || await cache.match("./prompts.js");
    if (!res) return { ok: false, why: "missing", keys: await caches.keys() };
    const text = await res.text();
    return { ok: text.indexOf("Jesus Loves Me") !== -1 && text.indexOf("window.CHARADES_PROMPTS") !== -1, bytes: text.length };
  })()`);
  check("prompts.js loads from the service worker cache", cachedPrompts.ok === true, JSON.stringify(cachedPrompts));

  const levelCounts = await ev(`(() => {
    state.customDecks = [];
    const read = (level) => {
      state.settings.level = level;
      renderPicker();
      const counts = {};
      document.querySelectorAll("#category-picker > section .cat-btn").forEach((btn) => {
        const count = btn.parentElement.querySelector(".cat-count");
        if (btn.dataset.category && count) counts[btn.dataset.category] = Number(count.textContent);
      });
      return counts;
    };
    const all = read("all");
    const kids = read("kids");
    const adults = read("adults");
    const names = Object.keys(PROMPTS);
    const sumKids = names.reduce((sum, name) => sum + PROMPTS[name].kids.length, 0);
    const sumAdults = names.reduce((sum, name) => sum + PROMPTS[name].adults.length, 0);
    return {
      actionsAll: all.Actions,
      actionsKids: kids.Actions,
      actionsAdults: adults.Actions,
      expectKids: PROMPTS.Actions.kids.length,
      expectAdults: PROMPTS.Actions.adults.length,
      expectAll: PROMPTS.Actions.kids.length + PROMPTS.Actions.adults.length,
      mixKids: kids.Mix,
      mixAdults: adults.Mix,
      mixAll: all.Mix,
      sumKids: sumKids,
      sumAdults: sumAdults
    };
  })()`);
  check(
    "deck counts follow the level",
    levelCounts.actionsKids === levelCounts.expectKids && levelCounts.actionsAdults === levelCounts.expectAdults && levelCounts.actionsAll === levelCounts.expectAll && levelCounts.actionsKids !== levelCounts.actionsAdults && levelCounts.mixKids === levelCounts.sumKids && levelCounts.mixAdults === levelCounts.sumAdults && levelCounts.mixAll === levelCounts.sumKids + levelCounts.sumAdults,
    JSON.stringify(levelCounts)
  );
  const chosenLevel = await ev(`(() => {
    state.settings.level = "all";
    state.teams.forEach((team) => { team.level = "all"; });
    applySettings();
    const input = document.querySelector('input[name="level"][value="kids"]');
    input.click();
    return {
      level: state.settings.level,
      teams: state.teams.map((team) => team.level),
      checked: (document.querySelector('input[name="level"]:checked') || {}).value,
      actions: deckCount("Actions")
    };
  })()`);
  check(
    "the level control saves kids for the game",
    chosenLevel.level === "kids" && chosenLevel.checked === "kids" && chosenLevel.teams.join(",") === "kids,kids" && chosenLevel.actions === levelCounts.expectKids,
    JSON.stringify(chosenLevel)
  );
  await cdp.send("Page.reload");
  await waitFor("document.readyState === 'complete' && !!document.getElementById('btn-tap-start') && state.settings.level === 'kids'", 10000, "level restore");
  const restoredLevel = await ev(`({
    level: state.settings.level,
    teams: state.teams.map((team) => team.level),
    checked: (document.querySelector('input[name="level"]:checked') || {}).value
  })`);
  check("the level control restores after refresh", restoredLevel.level === "kids" && restoredLevel.checked === "kids" && restoredLevel.teams.join(",") === "kids,kids", JSON.stringify(restoredLevel));

  const draws = await ev(`(() => {
    const kids = new Set(PROMPTS.Actions.kids);
    const adults = new Set(PROMPTS.Actions.adults);
    state.settings.category = "Actions";
    state.used = [];
    state.customDecks = [];
    state.settings.level = "kids";
    state.teams.forEach((team) => { team.level = "kids"; });
    state.turnIndex = 0;
    const kidDeck = buildDeck().map((card) => card.prompt);
    state.settings.level = "adults";
    state.teams.forEach((team) => { team.level = "adults"; });
    const adultDeck = buildDeck().map((card) => card.prompt);
    state.settings.level = "all";
    state.teams[0].level = "kids";
    state.teams[1].level = "adults";
    state.used = [];
    state.turnIndex = 0;
    const pull = (n) => {
      const queueCards = buildDeck();
      const got = [];
      for (let i = 0; i < n && i < queueCards.length; i += 1) {
        got.push(queueCards[i].prompt);
        state.used.push(queueCards[i].key);
      }
      return got;
    };
    const kidTurn = pull(12);
    state.turnIndex = 1;
    const adultTurn = pull(12);
    const both = kidTurn.concat(adultTurn);
    saveCustomDeck("Stars", "Star Cookies\\nMoon Pies\\nComet Candy");
    const custom = state.customDecks[state.customDecks.length - 1];
    state.settings.level = "kids";
    state.teams[0].level = "kids";
    state.turnIndex = 0;
    state.settings.category = "custom:" + custom.id;
    state.used = [];
    const customDealt = buildDeck().map((card) => card.prompt);
    return {
      kidCount: kidDeck.length,
      kidOk: kidDeck.length === kids.size && kidDeck.every((prompt) => kids.has(prompt)),
      adultCount: adultDeck.length,
      adultOk: adultDeck.length === adults.size && adultDeck.every((prompt) => adults.has(prompt)),
      kidTurnOk: kidTurn.length === 12 && kidTurn.every((prompt) => kids.has(prompt) && !adults.has(prompt)),
      adultTurnOk: adultTurn.length === 12 && adultTurn.every((prompt) => adults.has(prompt) && !kids.has(prompt)),
      unique: new Set(both).size === both.length,
      customDealt: customDealt.slice().sort().join("|"),
      customShown: deckCount("custom:" + custom.id),
      editorHidden: document.getElementById("deck-editor").hidden === true
    };
  })()`);
  check("kids-only and adults-only games stay in level", draws.kidOk === true && draws.adultOk === true, draws.kidCount + "/" + draws.adultCount);
  check(
    "a kids team and an adults team draw only their own cards",
    draws.kidTurnOk === true && draws.adultTurnOk === true && draws.unique === true,
    JSON.stringify({ kidTurnOk: draws.kidTurnOk, adultTurnOk: draws.adultTurnOk, unique: draws.unique })
  );
  check(
    "custom decks ignore the level",
    draws.customDealt === "Comet Candy|Moon Pies|Star Cookies" && draws.customShown === 3 && draws.editorHidden === true,
    JSON.stringify({ dealt: draws.customDealt, shown: draws.customShown, editorHidden: draws.editorHidden })
  );

  await setViewport(844, 390);
  await closeShotDialogs();
  const badges = await ev(`(() => {
    state.customDecks = [];
    state.settings.level = "all";
    state.teams[0].level = "all";
    state.teams[1].level = "adults";
    state.teams[0].score = 3;
    state.teams[1].score = 1;
    renderHome();
    const allHome = [...document.querySelectorAll("#home-standings .level-badge")].map((el) => el.textContent);
    state.teams[0].level = "kids";
    state.turnIndex = 0;
    applySettings();
    renderTeams();
    showPassPhone();
    const passKids = (document.querySelector("#pass-team .level-badge") || {}).textContent || "";
    document.body.dataset.phase = "prep";
    paintTeamFaces();
    const prepKids = (document.querySelector("#prep-who .level-badge") || {}).textContent || "";
    state.turnIndex = 1;
    showPassPhone();
    const passAdults = (document.querySelector("#pass-team .level-badge") || {}).textContent || "";
    renderRecap({ name: "Team 1", level: "kids", roundPoints: 3, total: 3, guessed: ["Running", "Jumping", "Swimming"], passed: ["Dancing"], timeUp: "", nextName: "Team 2" });
    document.body.dataset.phase = "recap";
    const recap = (document.querySelector("#recap-line .level-badge") || {}).textContent || "";
    const stand = [...document.querySelectorAll("#standings .level-badge")].map((el) => el.textContent);
    renderHome();
    const home = [...document.querySelectorAll("#home-standings .level-badge")].map((el) => el.textContent);
    renderWinner({ name: "Team 1", roundPoints: 3, total: 3, guessed: [], passed: [], timeUp: "", nextName: "Team 2" });
    const winner = [...document.querySelectorAll("#winner-standings .level-badge")].map((el) => el.textContent);
    return { allHome: allHome, passKids: passKids, prepKids: prepKids, passAdults: passAdults, recap: recap, stand: stand, home: home, winner: winner };
  })()`);
  check(
    "level badges show on the turn screen, recap and standings",
    badges.allHome.join(",") === "Adults" && badges.passKids === "Kids" && badges.prepKids === "Kids" && badges.passAdults === "Adults" && badges.recap === "Kids" && badges.stand.slice().sort().join(",") === "Adults,Kids" && badges.home.slice().sort().join(",") === "Adults,Kids" && badges.winner.slice().sort().join(",") === "Adults,Kids",
    JSON.stringify(badges)
  );
  await ev(`openSetup("round"); document.body.dataset.phase = "setup"; document.body.classList.remove("playing", "portrait"); document.querySelector(".setup-scroll").scrollTop = 0;`);
  await v82Pair("setup-level");
  await ev(`(() => {
    const scroller = document.querySelector(".setup-scroll");
    const list = document.getElementById("team-list");
    scroller.scrollTop = Math.max(0, list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8);
  })()`);
  await v82Pair("teams");
  await ev(`state.turnIndex = 0; showPassPhone();`);
  await closeShotDialogs();
  await v82Pair("pass-kids");
  await ev(`state.turnIndex = 1; showPassPhone();`);
  await v82Pair("pass-adults");
  await ev(`(() => {
    state.turnIndex = 0;
    state.teams[0].level = "kids";
    state.settings.category = "Actions";
    state.settings.style = "describe";
    queue = [{ category: "Actions", prompt: "Running", key: "Actions\\nRunning" }];
    document.body.classList.remove("portrait");
    document.body.classList.add("playing");
    paintCategory();
    deal();
    paintTeamFaces();
  })()`);
  await assertDialogsClosed("v8.2 kids play");
  await v84Shot("play-kids.png");
  await v82Pair("play-kids");
  await ev(`(() => {
    state.turnIndex = 1;
    state.teams[1].level = "adults";
    queue = [{ category: "Actions", prompt: "Parallel Parking", key: "Actions\\nParallel Parking" }];
    paintCategory();
    deal();
    paintTeamFaces();
  })()`);
  await assertDialogsClosed("v8.2 adults play");
  await v82Pair("play-adults");
  await ev(`(() => {
    state.teams[0].level = "kids";
    state.teams[1].level = "adults";
    state.teams[0].score = 3;
    state.teams[1].score = 0;
    document.body.classList.remove("playing");
    renderRecap({ name: "Team 1", level: "kids", roundPoints: 3, total: 3, guessed: ["Running", "Jumping", "Swimming"], passed: ["Dancing"], timeUp: "Dancing", nextName: "Team 2" });
    document.body.dataset.phase = "recap";
  })()`);
  await assertDialogsClosed("v8.2 recap");
  await v82Pair("recap");
  await closeShotDialogs();
  await v83Pair("recap");
  const standLayout = await ev(`(() => {
    const measure = (id) => [...document.querySelectorAll("#" + id + " li")].map((row) => {
      const label = row.querySelector(".stand-label");
      const badge = row.querySelector(".level-badge");
      const bar = row.querySelector(".stand-bar");
      const labelBox = label.getBoundingClientRect();
      const barBox = bar.getBoundingClientRect();
      const badgeBox = badge ? badge.getBoundingClientRect() : null;
      const style = getComputedStyle(label);
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      const overlap = (a, b) => !!(a && b && a.width > 0 && b.width > 0 && a.right > b.left + 0.5 && a.left < b.right - 0.5 && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5);
      return {
        text: label.textContent,
        oneLine: style.whiteSpace === "nowrap" && label.getClientRects().length === 1 && labelBox.height <= line + 2,
        clear: !overlap(badgeBox, barBox) && !overlap(labelBox, barBox)
      };
    });
    state.teams[0].name = "The Very Long Family Team";
    state.teams[1].name = "Grownups At The Far End";
    state.teams[0].level = "kids";
    state.teams[1].level = "adults";
    state.teams[0].score = 3;
    state.teams[1].score = 1;
    renderRecap({ name: "Team 1", level: "kids", roundPoints: 3, total: 3, guessed: ["Running"], passed: ["Dancing"], timeUp: "", nextName: "Team 2" });
    document.body.dataset.phase = "recap";
    const recap = measure("standings");
    document.body.dataset.phase = "home";
    renderHome();
    const home = measure("home-standings");
    renderWinner({ name: "Team 1", roundPoints: 3, total: 3, guessed: [], passed: [], timeUp: "", nextName: "Team 2" });
    document.body.dataset.phase = "winner";
    const winner = measure("winner-standings");
    state.teams[0].name = "";
    state.teams[1].name = "";
    return { recap: recap, home: home, winner: winner };
  })()`);
  const standRows = standLayout.recap.concat(standLayout.home, standLayout.winner);
  check(
    "standings names stay on one line and badges clear the bar",
    standRows.length >= 6 && standRows.every((row) => row.oneLine && row.clear),
    JSON.stringify(standLayout)
  );
  await ev(`(() => {
    state.settings.level = "kids";
    document.querySelectorAll('input[name="level"]').forEach((input) => { input.checked = input.value === "kids"; });
    openSetup("deck");
    document.body.classList.remove("playing", "portrait");
    const scroller = document.querySelector(".setup-scroll");
    if (scroller) scroller.scrollTop = 0;
  })()`);
  await closeShotDialogs();
  await v83Pair("deck-kids");
  await v84Shot("deck-kids.png");

  await ev(`
    state.settings.level = "all";
    state.teams[0].level = "kids";
    state.teams[1].level = "adults";
    state.settings.tutorialSeen = true;
    state.settings.category = "Actions";
    state.customDecks = [];
    saveState();
  `);
  await cdp.send("Page.reload");
  await waitFor("document.readyState === 'complete' && !!document.getElementById('btn-tap-start')", 10000, "team level resume");
  const resumedLevels = await ev(`({
    level: state.settings.level,
    teams: state.teams.map((team) => team.level)
  })`);
  check("resume keeps the per-team levels", resumedLevels.level === "all" && resumedLevels.teams.join(",") === "kids,adults", JSON.stringify(resumedLevels));

  await delay(600);
  const errors = consoleEvents.filter((event) => event.type === "error");
  check("zero console errors", errors.length === 0, errors.map((event) => event.text).join(" || ") || "none");
  writeFileSync(QA + "\\results.json", JSON.stringify({
    checks,
    shots,
    rendered,
    counts: Object.fromEntries(EXPECTED.map((name) => {
      const deck = promptMap[name] || { kids: [], adults: [] };
      return [name, { kids: (deck.kids || []).length, adults: (deck.adults || []).length }];
    })),
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
