import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = "C:\\Users\\bryma\\dev\\charades";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9334;
const BASE = "http://127.0.0.1:8765/";
const checks = [];

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

const promptMap = promptsFromHtml();
const names = Object.keys(promptMap);
let total = 0;
for (const name of names) {
  const count = promptMap[name].length;
  total += count;
  check(name + " has at least 40 prompts", count >= 40, String(count));
}
check("seventeen categories", names.length === 17, String(names.length));
console.log("total cards " + total);

const userData = process.env.TEMP + "\\charades-shuffle-" + Date.now();
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
  const consoleEvents = [];
  cdp.on((msg) => {
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      consoleEvents.push((msg.params.args || []).map((arg) => arg.value || arg.description || arg.type).join(" "));
    } else if (msg.method === "Runtime.exceptionThrown") {
      const details = msg.params.exceptionDetails || {};
      consoleEvents.push(details.text + " " + (details.exception && details.exception.description ? details.exception.description : ""));
    }
  });
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Log.enable");

  async function ev(expression) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.text + " " + (details.exception && details.exception.description ? details.exception.description : expression.slice(0, 160)));
    }
    return result.result ? result.result.value : undefined;
  }

  async function waitFor(expression, timeoutMs, label) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await ev(expression)) return;
      await delay(100);
    }
    const snap = await ev("document.body.dataset.phase + ' | ' + (document.getElementById('prompt')||{}).textContent");
    throw new Error("timed out waiting for " + label + " (" + snap + ")");
  }

  await cdp.send("Page.navigate", { url: BASE });
  await waitFor("document.readyState === 'complete' && typeof buildDeck === 'function'", 10000, "page load");
  await ev("localStorage.removeItem('charades.v1')");

  const direct = await ev(`(() => {
    const source = PROMPTS.Actions.slice();
    state.settings.category = "Actions";
    state.used = [];
    const first = buildDeck().map((card) => card.prompt);
    const second = buildDeck().map((card) => card.prompt);
    const allUsed = source.map((prompt) => "Actions\\n" + prompt);
    state.used = allUsed.slice();
    releaseUsed();
    const kept = state.used.slice();
    const deck = buildDeck();
    const leaked = deck.filter((card) => kept.indexOf(card.key) !== -1).map((card) => card.prompt);
    const mixKeys = [];
    CATEGORY_NAMES.forEach((name) => {
      PROMPTS[name].forEach((prompt) => mixKeys.push(name + "\\n" + prompt));
    });
    state.settings.category = "Mix";
    state.used = mixKeys.slice();
    releaseUsed();
    const mixKept = state.used.slice();
    const mixDeck = buildDeck();
    const mixLeak = mixDeck.filter((card) => mixKept.indexOf(card.key) !== -1).length;
    clearGame();
    return {
      sameOrder: first.join("\\n") === second.join("\\n"),
      sourceOrder: first.join("\\n") === source.join("\\n"),
      deck: deck.length,
      kept: kept.length,
      leaked: leaked.length,
      expectDeck: source.length - 24,
      mixDeck: mixDeck.length,
      mixKept: mixKept.length,
      mixExpect: mixKeys.length - 24,
      mixLeak: mixLeak
    };
  })()`);
  check("two shuffles differ", direct.sameOrder === false, JSON.stringify(direct));
  check("shuffle is not the page order", direct.sourceOrder === false, "");
  check("reshuffle holds back the latest 24", direct.deck === direct.expectDeck && direct.kept === 24 && direct.leaked === 0, "deck " + direct.deck + " kept " + direct.kept);
  check("mix reshuffle holds back the latest 24", direct.mixDeck === direct.mixExpect && direct.mixKept === 24 && direct.mixLeak === 0, "mix deck " + direct.mixDeck);

  await ev(`
    clearGame();
    document.querySelector('[data-category="Actions"]').click();
    document.querySelector('input[name="seconds"][value="90"]').click();
  `);
  await ev(`
    state.settings.tutorialSeen = true;
    saveState();
    const DOE = window.DeviceOrientationEvent;
    function grant() { return Promise.resolve("granted"); }
    try { DOE.requestPermission = grant; }
    catch (err) { Object.defineProperty(DOE, "requestPermission", { configurable: true, writable: true, value: grant }); }
    document.getElementById("btn-tap-start").click();
  `);
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0", 12000, "first round");
  const firstRound = await ev(`(() => {
    const seen = [];
    for (let i = 0; i < 24; i += 1) {
      seen.push(document.getElementById("prompt").textContent);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    }
    return seen;
  })()`);
  const uniqueFirst = new Set(firstRound);
  const sourcePrefix = promptMap.Actions.slice(0, 24).join("\n");
  check("a round deals 24 different cards", firstRound.length === 24 && uniqueFirst.size === 24, "unique " + uniqueFirst.size);
  check("those cards are not the list order", firstRound.join("\n") !== sourcePrefix, firstRound.slice(0, 4).join(", "));

  await cdp.send("Page.reload");
  await waitFor("document.body && document.body.dataset.phase === 'prep'", 10000, "reload prep");
  await ev(`
    const DOE = window.DeviceOrientationEvent;
    function grant() { return Promise.resolve("granted"); }
    try { DOE.requestPermission = grant; }
    catch (err) { Object.defineProperty(DOE, "requestPermission", { configurable: true, writable: true, value: grant }); }
    document.getElementById("btn-tap-start").click();
  `);
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0", 12000, "second round");
  const secondRound = await ev(`(() => {
    const seen = [];
    for (let i = 0; i < 24; i += 1) {
      seen.push(document.getElementById("prompt").textContent);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    }
    return seen;
  })()`);
  const overlap = secondRound.filter((prompt) => firstRound.indexOf(prompt) !== -1);
  check("the next round does not repeat those cards", overlap.length === 0, overlap.slice(0, 5).join(", ") || "none");

  const saved = {
    teams: [
      { id: "a", name: "Team 1", score: 0 },
      { id: "b", name: "Team 2", score: 0 }
    ],
    turnIndex: 0,
    used: promptMap.Actions.map((prompt) => "Actions\n" + prompt),
    settings: { seconds: 90, category: "Actions" }
  };
  const held = promptMap.Actions.slice(-24);
  await ev("localStorage.setItem('charades.v1', " + JSON.stringify(JSON.stringify(saved)) + ")");
  await cdp.send("Page.reload");
  await waitFor("document.readyState === 'complete' && document.body.dataset.phase === 'home'", 10000, "exhausted reload");
  await ev(`
    const DOE = window.DeviceOrientationEvent;
    function grant() { return Promise.resolve("granted"); }
    try { DOE.requestPermission = grant; }
    catch (err) { Object.defineProperty(DOE, "requestPermission", { configurable: true, writable: true, value: grant }); }
    document.getElementById("btn-tap-start").click();
  `);
  await waitFor("document.getElementById('deck-empty').hidden === false", 4000, "empty message");
  const emptyText = await ev("document.getElementById('deck-empty-text').textContent");
  check("an empty category still says so", emptyText === "No prompts left in this category.", emptyText);
  await ev("document.getElementById('btn-reshuffle').click()");
  await waitFor("document.body.dataset.phase === 'play' && document.getElementById('prompt').textContent.length > 0", 12000, "reshuffle deal");
  const after = await ev(`(() => {
    const seen = [];
    for (let i = 0; i < 20; i += 1) {
      seen.push(document.getElementById("prompt").textContent);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    }
    return seen;
  })()`);
  const cameBack = after.filter((prompt) => held.indexOf(prompt) !== -1);
  const known = after.every((prompt) => promptMap.Actions.indexOf(prompt) !== -1);
  check("reshuffle deals prompts again", known && new Set(after).size === after.length, after.slice(0, 4).join(", "));
  check("reshuffle skips the most recent cards", cameBack.length === 0, cameBack.join(", ") || "none");
  check("zero console errors", consoleEvents.length === 0, consoleEvents.join(" || ") || "none");
} catch (err) {
  console.error("SHUFFLE CHECK CRASHED: " + (err.stack || err));
  process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  chrome.kill();
}

const failed = checks.filter((item) => !item.ok);
if (failed.length) process.exitCode = 1;
console.log(failed.length ? "FAILED " + failed.length : "ALL PASS " + checks.length);
