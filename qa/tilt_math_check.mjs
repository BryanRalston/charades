import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("/* tilt-math-start */");
const end = html.indexOf("/* tilt-math-end */");
if (start < 0 || end < 0) throw new Error("tilt math markers missing");
const source = html.slice(start, end);
const math = new Function(
  source +
    "\nreturn { normAngle, upFromOrientation, signedTilt, tiltDegrees, clampNeutral, normalizeUp, triggerFromDelta, TRIGGER_DEG, RETURN_DEG, DEBOUNCE_MS };"
)();

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: detail == null ? "" : String(detail) });
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
}

function near(actual, expected, slack) {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= slack;
}

function pose(angle, beta, gamma) {
  return math.tiltDegrees(beta, gamma, angle);
}

const poses = [
  ["angle 90 upright is 0", 90, 0, -90, 0],
  ["angle 90 face-down 30 is +30", 90, 180, 60, 30],
  ["angle 90 face-up 30 is -30", 90, 0, -60, -30],
  ["angle 90 qc face-down is about +40", 90, 180, 50, 40],
  ["angle 90 qc face-up is about -40", 90, 0, -50, -40],
  ["angle 90 small tilt is about -10", 90, 0, -80, -10],
  ["angle 270 upright is 0", 270, 0, 90, 0],
  ["angle 270 face-down 30 is +30", 270, 180, -60, 30],
  ["angle 270 face-up 30 is -30", 270, 0, 60, -30],
  ["angle 270 qc face-down is about +40", 270, 180, -50, 40],
  ["angle 270 qc face-up is about -40", 270, 0, 50, -40],
  ["angle 270 small tilt is about -10", 270, 0, 80, -10]
];
for (const [name, angle, beta, gamma, expected] of poses) {
  const value = pose(angle, beta, gamma);
  check(name, near(value, expected, 1.5), "tilt " + value);
}

const mirrored = pose(90, 0, 90);
check("old mirrored upright is not neutral", Number.isFinite(mirrored) && Math.abs(mirrored) > 90, "tilt " + mirrored);

function sweep(name, angle, points) {
  let previous = null;
  let worst = 0;
  for (const [beta, gamma] of points) {
    const value = pose(angle, beta, gamma);
    if (previous !== null) worst = Math.max(worst, Math.abs(value - previous));
    previous = value;
  }
  check(name, worst < 12, "max step " + worst.toFixed(2));
}

function range(from, to, step) {
  const values = [];
  if (from <= to) {
    for (let value = from; value <= to + 1e-9; value += step) values.push(value);
  } else {
    for (let value = from; value >= to - 1e-9; value -= step) values.push(value);
  }
  return values;
}
sweep("angle 90 face-up path stays continuous", 90, range(-90, -40, 5).map((gamma) => [0, gamma]));
sweep("angle 90 face-down path stays continuous", 90, range(80, 40, 5).map((gamma) => [180, gamma]));
sweep("angle 270 face-up path stays continuous", 270, range(90, 40, 5).map((gamma) => [0, gamma]));
sweep("angle 270 face-down path stays continuous", 270, range(-80, -40, 5).map((gamma) => [180, gamma]));

function motionTilt(angle, beta, gamma) {
  const up = math.upFromOrientation(beta, gamma);
  const scaled = math.normalizeUp(up.x * 9.8, up.y * 9.8, up.z * 9.8);
  return math.signedTilt(scaled.x, scaled.y, scaled.z, angle);
}
for (const [angle, beta, gamma, label] of [
  [90, 0, -90, "neutral"],
  [90, 180, 50, "face-down"],
  [90, 0, -50, "face-up"],
  [270, 0, 90, "neutral"],
  [270, 180, -50, "face-down"],
  [270, 0, 50, "face-up"]
]) {
  const orient = pose(angle, beta, gamma);
  const motion = motionTilt(angle, beta, gamma);
  check("motion gravity matches orientation " + angle + " " + label, near(motion, orient, 0.5), motion + " vs " + orient);
}

check("clampNeutral limits a steep neutral", math.clampNeutral(80) === 50 && math.clampNeutral(-80) === -50 && math.clampNeutral(10) === 10, "");

let armed = false;
let lastFire = 0;
let step = math.triggerFromDelta(40, armed, lastFire, 1000);
check("an unarmed delta does not fire", step.fire === "" && step.armed === false, JSON.stringify(step));
armed = step.armed;
step = math.triggerFromDelta(0, armed, lastFire, 1100);
check("returning inside 15 degrees arms the gate", step.fire === "" && step.armed === true, JSON.stringify(step));
armed = step.armed;
step = math.triggerFromDelta(40, armed, lastFire, 2000);
check("face-down delta fires correct once", step.fire === "correct" && step.armed === false, JSON.stringify(step));
lastFire = step.lastFire;
armed = step.armed;
step = math.triggerFromDelta(40, armed, lastFire, 2100);
check("holding the delta does not fire again", step.fire === "" && step.armed === false, JSON.stringify(step));
armed = step.armed;
step = math.triggerFromDelta(-40, armed, lastFire, 2200);
check("the opposite delta does not fire before a return", step.fire === "" && step.armed === false, JSON.stringify(step));
armed = step.armed;
step = math.triggerFromDelta(0, armed, lastFire, 2300);
check("a return to neutral arms the next tilt", step.fire === "" && step.armed === true, JSON.stringify(step));
armed = step.armed;
step = math.triggerFromDelta(-40, armed, lastFire, lastFire + 100);
check("a tilt inside 600ms does not fire", step.fire === "" && step.armed === true, JSON.stringify(step));
armed = step.armed;
step = math.triggerFromDelta(-40, armed, lastFire, lastFire + math.DEBOUNCE_MS + 50);
check("the same tilt fires pass after the debounce", step.fire === "pass" && step.armed === false, JSON.stringify(step));

const small = math.triggerFromDelta(-10, true, 0, 5000);
check("a 10 degree delta does not score", small.fire === "" && small.armed === true, JSON.stringify(small));
const edge = math.triggerFromDelta(35, true, 0, 5000);
const edgePass = math.triggerFromDelta(-35, true, 0, 5000);
check("35 degrees is the correct and pass threshold", edge.fire === "correct" && edgePass.fire === "pass", JSON.stringify(edge) + " " + JSON.stringify(edgePass));

const failed = checks.filter((item) => !item.ok);
console.log(failed.length ? "FAILED " + failed.length : "ALL PASS " + checks.length);
process.exitCode = failed.length ? 1 : 0;
