import {
  FilesetResolver,
  HandLandmarker,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const videoWrap = document.getElementById("videoWrap");
const touchPad = document.getElementById("touchPad");
const touchCanvas = document.getElementById("touchCanvas");
const touchCtx = touchCanvas.getContext("2d");
const touchHint = document.getElementById("touchHint");

const offlineBadge = document.getElementById("offlineBadge");
const wsBadge = document.getElementById("wsBadge");
const rttBadge = document.getElementById("rttBadge");
const wsDot = document.getElementById("wsDot");
const btnEstop = document.getElementById("btnEstop");
const handStatus = document.getElementById("handStatus");
const fpsLabel = document.getElementById("fpsLabel");
const handBadge = document.getElementById("handBadge");

const btnStartCam = document.getElementById("btnStartCam");
const btnFlipCam = document.getElementById("btnFlipCam");
const btnHoldActive = document.getElementById("btnHoldActive");
const chkLatchMode = document.getElementById("chkLatchMode");
const chkMirrorView = document.getElementById("chkMirrorView");
const rngAlpha = document.getElementById("rngAlpha");
const rngDeadband = document.getElementById("rngDeadband");
const rngSlew = document.getElementById("rngSlew");
const lblAlpha = document.getElementById("lblAlpha");
const lblDeadband = document.getElementById("lblDeadband");
const lblSlew = document.getElementById("lblSlew");

const valM1 = document.getElementById("valM1");
const openBar = document.getElementById("openBar");
const openPctText = document.getElementById("openPctText");
const selMotionMode = document.getElementById("selMotionMode");
const touchSensWrap = document.getElementById("touchSensWrap");
const rngTouchSens = document.getElementById("rngTouchSens");
const lblTouchSens = document.getElementById("lblTouchSens");
const calBtnsRow = document.getElementById("calBtnsRow");
const btnCalOpen = document.getElementById("btnCalOpen");
const btnCalClosed = document.getElementById("btnCalClosed");
const btnCalReset = document.getElementById("btnCalReset");

const chkSimMode = document.getElementById("chkSimMode");
const pidChart = document.getElementById("pidChart");
const pidCtx = pidChart.getContext("2d");
const pidSpEl = document.getElementById("pidSp");
const pidActEl = document.getElementById("pidAct");
const pidErrEl = document.getElementById("pidErr");
const pidOsEl = document.getElementById("pidOs");
const pidRiseEl = document.getElementById("pidRise");
const pidSettleEl = document.getElementById("pidSettle");
const inpKp = document.getElementById("inpKp");
const inpKi = document.getElementById("inpKi");
const inpKd = document.getElementById("inpKd");
const inpMinPwm = document.getElementById("inpMinPwm");
const inpMaxPwm = document.getElementById("inpMaxPwm");
const btnApplyPid = document.getElementById("btnApplyPid");
const btnSaveFlash = document.getElementById("btnSaveFlash");
const btnStepTest = document.getElementById("btnStepTest");
const btnStepTestNeg = document.getElementById("btnStepTestNeg");
const btnExportCsv = document.getElementById("btnExportCsv");
const btnClearPlot = document.getElementById("btnClearPlot");

const wsUrlInput = document.getElementById("wsUrlInput");
const chkAutoReconnect = document.getElementById("chkAutoReconnect");
const btnConnectWs = document.getElementById("btnConnectWs");
const btnTrustCert = document.getElementById("btnTrustCert");
const chkInvert = document.getElementById("chkInvert");
const inpGain = document.getElementById("inpGain");
const manRange0 = document.getElementById("manRange0");
const manLbl0 = document.getElementById("manLbl0");
const btnSendManual = document.getElementById("btnSendManual");
const btnCenterAll = document.getElementById("btnCenterAll");

let handLandmarker = null;
let drawingUtils = new DrawingUtils(ctx);
let facingMode = "user";
let stream = null;
let running = false;
let isArmed = false;
let ws = null;
let reconnectTimer = null;
let lastSendTime = 0;
let lastPingTs = 0;
let lastVideoTime = -1;
let lastFrameMs = performance.now();

let smoothedAngle = 0;
let slewedAngle = 0;
let lastSentAngle = 0;
let lastRatio = null;

const DEFAULT_SAVED = {
  mode: "index_cam",
  indexMinDeg: -180,
  indexMaxDeg: 180,
  palmMinDeg: -180,
  palmMaxDeg: 180,
  thumbOpenRatio: 1.55,
  thumbClosedRatio: 0.85,
  openRatio: 1.90,
  closedRatio: 0.85,
  touchSens: 0.5,
  invert: false,
  gain: 1.0
};

let saved = { ...DEFAULT_SAVED, ...(JSON.parse(localStorage.getItem("tekmotor_v2_calib") || "null") || {}) };
function saveCalib() { localStorage.setItem("tekmotor_v2_calib", JSON.stringify(saved)); }

selMotionMode.value = saved.mode;
chkInvert.checked = saved.invert;
inpGain.value = saved.gain;
rngTouchSens.value = saved.touchSens;
lblTouchSens.textContent = `${saved.touchSens}x`;

function syncModeUI() {
  const isTouch = saved.mode === "touch_pad";
  touchPad.classList.toggle("active", isTouch);
  touchSensWrap.style.display = isTouch ? "block" : "none";
  calBtnsRow.style.display = isTouch ? "none" : "";
  if (isTouch) {
    handBadge.textContent = "Dokunma Modu";
    handBadge.className = "mini-status ok";
  }
}
syncModeUI();

selMotionMode.addEventListener("change", () => {
  saved.mode = selMotionMode.value;
  saveCalib();
  syncModeUI();
});
rngTouchSens.addEventListener("input", () => {
  saved.touchSens = Number(rngTouchSens.value);
  lblTouchSens.textContent = `${saved.touchSens}x`;
  saveCalib();
});
chkInvert.addEventListener("change", () => { saved.invert = chkInvert.checked; saveCalib(); });
inpGain.addEventListener("change", () => { saved.gain = Number(inpGain.value) || 1.0; saveCalib(); });

btnCalOpen.addEventListener("click", () => {
  if (lastRatio === null) { alert("Önce kamerada elinizi gösterin."); return; }
  if (saved.mode === "index_cam") saved.indexMinDeg = lastRatio;
  else if (saved.mode === "palm_tilt") saved.palmMinDeg = lastRatio;
  else if (saved.mode === "thumb_slide") saved.thumbOpenRatio = lastRatio;
  else saved.openRatio = lastRatio;
  saveCalib();
});

btnCalClosed.addEventListener("click", () => {
  if (lastRatio === null) { alert("Önce kamerada elinizi gösterin."); return; }
  if (saved.mode === "index_cam") saved.indexMaxDeg = lastRatio;
  else if (saved.mode === "palm_tilt") saved.palmMaxDeg = lastRatio;
  else if (saved.mode === "thumb_slide") saved.thumbClosedRatio = lastRatio;
  else saved.closedRatio = lastRatio;
  saveCalib();
});

btnCalReset.addEventListener("click", () => {
  const mode = saved.mode;
  saved = { ...DEFAULT_SAVED, mode };
  chkInvert.checked = saved.invert;
  inpGain.value = saved.gain;
  rngTouchSens.value = saved.touchSens;
  lblTouchSens.textContent = `${saved.touchSens}x`;
  saveCalib();
});

// --- Görsel Yön Göstergeli Dokunma / Kaydırma Modu ---
let touchStart = null;
let touchPrev = null;
let touchDir = null;

function drawTouchOverlay(curr) {
  const rect = touchPad.getBoundingClientRect();
  touchCanvas.width = rect.width;
  touchCanvas.height = rect.height;
  touchCtx.clearRect(0, 0, rect.width, rect.height);
  if (!touchStart || !curr) return;

  const sx = touchStart.x - rect.left;
  const sy = touchStart.y - rect.top;
  const cx = curr.x - rect.left;
  const cy = curr.y - rect.top;


  // Başlangıç -> parmak çizgisi
  touchCtx.strokeStyle = "#38bdf8";
  touchCtx.lineWidth = 3;
  touchCtx.beginPath();
  touchCtx.moveTo(sx, sy);
  touchCtx.lineTo(cx, cy);
  touchCtx.stroke();

  touchCtx.fillStyle = "#38bdf8";
  touchCtx.beginPath();
  touchCtx.arc(sx, sy, 6, 0, Math.PI * 2);
  touchCtx.fill();

  touchCtx.fillStyle = "#22c55e";
  touchCtx.beginPath();
  touchCtx.arc(cx, cy, 9, 0, Math.PI * 2);
  touchCtx.fill();
}

function updateAngleUI(angle) {
  valM1.textContent = `${Math.round(angle)}°`;
  const pct = Math.round(((angle + 180) / 360) * 100);
  openBar.style.width = `${pct}%`;
  openPctText.textContent = `Konum: %${pct}`;
}

touchPad.addEventListener("pointerdown", (e) => {
  touchPad.setPointerCapture(e.pointerId);
  touchStart = { x: e.clientX, y: e.clientY };
  touchPrev = { x: e.clientX, y: e.clientY };
  touchDir = null;
  touchHint.style.opacity = "0.25";
  drawTouchOverlay(touchStart);
});

touchPad.addEventListener("pointermove", (e) => {
  if (!touchPrev) return;
    const dx = e.clientX - touchPrev.x;
    const boxW = touchPad.clientWidth || 360;
    let delta = dx * (180 / boxW) * (saved.touchSens || 0.5) * saved.gain;
    if (saved.invert) delta = -delta;
    smoothedAngle = clamp(smoothedAngle + delta, -180, 180);
    slewedAngle = smoothedAngle;
    updateAngleUI(slewedAngle);

    const now = performance.now();
    if (isArmed && now - lastSendTime >= 33) {
      sendTarget(slewedAngle, true);
      lastSentAngle = slewedAngle;
      lastSendTime = now;
    }
  touchPrev = { x: e.clientX, y: e.clientY };
  drawTouchOverlay(touchPrev);
});

function endTouch() {
  touchStart = null;
  touchPrev = null;
  touchDir = null;
  touchHint.style.opacity = "1";
  touchCtx.clearRect(0, 0, touchCanvas.width, touchCanvas.height);
}
touchPad.addEventListener("pointerup", endTouch);
touchPad.addEventListener("pointercancel", endTouch);

// Sekmeler
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab, .panel").forEach((el) => el.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "pidTab") drawPidChart();
  });
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(console.error);
}

chkMirrorView.addEventListener("change", () => videoWrap.classList.toggle("mirrored", chkMirrorView.checked));
rngAlpha.addEventListener("input", () => (lblAlpha.textContent = rngAlpha.value));
rngDeadband.addEventListener("input", () => (lblDeadband.textContent = `${rngDeadband.value}°`));
rngSlew.addEventListener("input", () => (lblSlew.textContent = `${rngSlew.value}°/sn`));
manRange0.addEventListener("input", () => (manLbl0.textContent = `${manRange0.value}°`));

// Hızlı Ön Ayarlar (-180, -90, 0, +90, +180)
document.querySelectorAll(".preset-btn").forEach((b) => {
  b.addEventListener("click", () => {
    const deg = Number(b.dataset.deg);
    manRange0.value = deg;
    manLbl0.textContent = `${deg}°`;
    smoothedAngle = deg;
    slewedAngle = deg;
    updateAngleUI(deg);
    sendTarget(deg, true);
  });
});

// E-STOP
function triggerEstop() {
  setArmed(false);
  sendWs({ type: "estop" });
}
btnEstop.addEventListener("click", triggerEstop);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && document.activeElement?.tagName !== "INPUT") {
    e.preventDefault();
    triggerEstop();
  }
});

function setArmed(state) {
  isArmed = state;
  btnHoldActive.classList.toggle("armed", state);
  btnHoldActive.textContent = state ? "MOTOR AKTİF (Canlı)" : "Motor Kilitli (Basılı Tut / Aç)";
  if (state) slewedAngle = lastSentAngle;
  else sendTarget(lastSentAngle, false);
}

btnHoldActive.addEventListener("pointerdown", () => { if (!chkLatchMode.checked) setArmed(true); });
btnHoldActive.addEventListener("pointerup", () => { if (!chkLatchMode.checked) setArmed(false); });
btnHoldActive.addEventListener("pointerleave", () => { if (!chkLatchMode.checked && isArmed) setArmed(false); });
btnHoldActive.addEventListener("click", () => { if (chkLatchMode.checked) setArmed(!isArmed); });

// MediaPipe
async function createLandmarker(vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.45,
    minTrackingConfidence: 0.45
  });
}

async function initMediaPipe() {
  try {
    offlineBadge.textContent = "El modeli yükleniyor (~13 MB)...";
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    try {
      handLandmarker = await createLandmarker(vision, "GPU");
      offlineBadge.textContent = "Çevrimdışı Hazır (GPU) ✓";
    } catch (_) {
      handLandmarker = await createLandmarker(vision, "CPU");
      offlineBadge.textContent = "Çevrimdışı Hazır (CPU) ✓";
    }
    offlineBadge.classList.add("ok");
  } catch (err) {
    offlineBadge.textContent = `Model hatası: ${err?.message || "İlk açılışta internet gerekir"}`;
  }
}
initMediaPipe();

// WebSocket + Auto-Reconnect + RTT
function connectWS() {
  clearTimeout(reconnectTimer);
  if (ws) ws.close();
  wsBadge.textContent = "ESP32: Bağlanıyor...";
  ws = new WebSocket(wsUrlInput.value.trim());

  ws.onopen = () => {
    wsBadge.textContent = "ESP32: Bağlı ✓";
    wsBadge.classList.add("ok");
    wsDot.classList.add("ok");
  };
  ws.onclose = () => {
    wsBadge.textContent = "ESP32: Bağlı Değil";
    wsBadge.classList.remove("ok");
    wsDot.classList.remove("ok");
    if (chkAutoReconnect.checked) reconnectTimer = setTimeout(connectWS, 2500);
  };
  ws.onerror = () => { wsBadge.textContent = "ESP32: SSL/Bağlantı Hatası"; };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "telemetry" && !chkSimMode.checked) onTelemetry(msg);
      if (msg.type === "pong" && lastPingTs > 0) {
        rttBadge.textContent = `RTT: ${Math.round(performance.now() - lastPingTs)} ms`;
      }
    } catch (_) {}
  };
}

function sendWs(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function sendTarget(angle, active) {
  const val = Number(angle.toFixed(1));
  sendWs({ type: "target", m1: val, active });
  if (chkSimMode.checked) sim.sp = val;
}

setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    lastPingTs = performance.now();
    sendWs({ type: "ping" });
  }
}, 2000);

btnConnectWs.addEventListener("click", connectWS);
btnTrustCert.addEventListener("click", () => {
  const url = wsUrlInput.value.trim().replace(/^wss:/i, "https:").replace(/\/ws.*$/i, "");
  window.open(url, "_blank");
});

btnSendManual.addEventListener("click", () => {
  const val = Number(manRange0.value);
  smoothedAngle = val;
  slewedAngle = val;
  updateAngleUI(val);
  sendTarget(val, true);
});

btnCenterAll.addEventListener("click", () => {
  manRange0.value = 0;
  manLbl0.textContent = "0°";
  smoothedAngle = 0;
  slewedAngle = 0;
  updateAngleUI(0);
  sendTarget(0, true);
});

// --- PID Analiz, HiDPI Grafik & Yerleşik Simülatör ---
const MAX_HIST = 160;
let pidHistory = [];
let stepStart = null;
let stepTarget = null;
let stepPeak = 0;
let stepStartTime = null;
let riseRecorded = false;
let settleCandidateTime = null;

const sim = { sp: 0, act: 0, vel: 0, integral: 0, prevAct: 0, out: 0 };

function getPidParams() {
  return {
    kp: Number(inpKp.value) || 0,
    ki: Number(inpKi.value) || 0,
    kd: Number(inpKd.value) || 0,
    minPwm: Number(inpMinPwm.value) || 0,
    maxPwm: Number(inpMaxPwm.value) || 200
  };
}

setInterval(() => {
  if (!chkSimMode.checked) return;
  const dt = 0.05;
  const p = getPidParams();
  const err = sim.sp - sim.act;
  sim.integral = clamp(sim.integral + err * dt, -100, 100);
  const dAct = (sim.act - sim.prevAct) / dt;
  sim.prevAct = sim.act;

  let out = p.kp * err + p.ki * sim.integral - p.kd * dAct;
  if (Math.abs(err) > 0.2 && Math.abs(out) < p.minPwm && Math.abs(out) > 1) {
    out = Math.sign(out) * p.minPwm;
  }
  out = clamp(out, -p.maxPwm, p.maxPwm);
  sim.out = out;

  const accel = (out * 4.2) - (sim.vel * 6.5);
  sim.vel += accel * dt;
  sim.act = clamp(sim.act + sim.vel * dt, -180, 180);

  onTelemetry({ sp: sim.sp, act: sim.act, err: sim.sp - sim.act, out: sim.out });
}, 50);

btnApplyPid.addEventListener("click", () => sendWs({ type: "pid", ...getPidParams() }));
btnSaveFlash.addEventListener("click", () => sendWs({ type: "save_pid" }));

function triggerStep(delta) {
  pidHistory = [];
  stepTarget = null;
  stepStart = null;
  stepPeak = 0;
  stepStartTime = performance.now();
  riseRecorded = false;
  settleCandidateTime = null;
  pidRiseEl.textContent = "—";
  pidSettleEl.textContent = "—";

  if (chkSimMode.checked) {
    sim.sp = clamp(sim.sp + delta, -180, 180);
    return;
  }
  sendWs({ type: "step", delta });
}

btnStepTest.addEventListener("click", () => triggerStep(30));
btnStepTestNeg.addEventListener("click", () => triggerStep(-30));
btnClearPlot.addEventListener("click", () => {
  pidHistory = [];
  stepTarget = null;
  pidRiseEl.textContent = "—";
  pidSettleEl.textContent = "—";
  drawPidChart();
});

btnExportCsv.addEventListener("click", () => {
  if (pidHistory.length === 0) return;
  const rows = ["zaman_ms,hedef_sp,gercek_enc,hata,pwm"];
  pidHistory.forEach((p) => rows.push(`${p.t},${p.sp.toFixed(2)},${p.act.toFixed(2)},${p.err.toFixed(2)},${p.out.toFixed(1)}`));
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tekmotor_v2_pid.csv";
  a.click();
});

function onTelemetry(t) {
  const now = performance.now();
  pidSpEl.textContent = `${Number(t.sp).toFixed(1)}°`;
  pidActEl.textContent = `${Number(t.act).toFixed(1)}°`;
  pidErrEl.textContent = `${Number(t.err).toFixed(1)}°`;

  if (stepTarget === null) {
    stepTarget = t.sp;
    stepStart = t.act;
    stepPeak = t.act;
    stepStartTime = now;
    riseRecorded = false;
  } else if (Math.abs(t.sp - stepTarget) > 0.5) {
    stepStart = t.act;
    stepTarget = t.sp;
    stepPeak = t.act;
    stepStartTime = now;
    riseRecorded = false;
    settleCandidateTime = null;
    pidRiseEl.textContent = "—";
    pidSettleEl.textContent = "—";
  } else {
    const dir = stepTarget >= stepStart ? 1 : -1;
    if (dir > 0) stepPeak = Math.max(stepPeak, t.act);
    else stepPeak = Math.min(stepPeak, t.act);
  }

  const stepSize = Math.abs(stepTarget - stepStart);
  if (stepSize > 2) {
    const progress = Math.abs(t.act - stepStart) / stepSize;
    if (!riseRecorded && progress >= 0.9) {
      riseRecorded = true;
      pidRiseEl.textContent = `${Math.round(now - stepStartTime)} ms`;
    }
    const osDeg = stepTarget >= stepStart ? (stepPeak - stepTarget) : (stepTarget - stepPeak);
    pidOsEl.textContent = `${Math.max(0, (osDeg / stepSize) * 100).toFixed(1)}%`;
  } else {
    pidOsEl.textContent = "0.0%";
  }

  if (Math.abs(t.err) <= 1.5) {
    if (!settleCandidateTime) settleCandidateTime = now;
    if (now - settleCandidateTime >= 200 && stepStartTime) {
      pidSettleEl.textContent = `${Math.round(settleCandidateTime - stepStartTime)} ms`;
    }
  } else {
    settleCandidateTime = null;
  }

  pidHistory.push({ t: Math.round(now), sp: t.sp, act: t.act, err: t.err, out: t.out });
  if (pidHistory.length > MAX_HIST) pidHistory.shift();
  drawPidChart();
}

function drawPidChart() {
  const rect = pidChart.getBoundingClientRect();
  if (rect.width === 0) return;
  const dpr = window.devicePixelRatio || 1;
  pidChart.width = Math.round(rect.width * dpr);
  pidChart.height = Math.round(rect.height * dpr);
  pidCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width;
  const h = rect.height;
  pidCtx.clearRect(0, 0, w, h);

  const padL = 36;
  const plotW = w - padL - 6;
  const topH = h * 0.58;
  const botTop = h * 0.65;

  pidCtx.font = "10px system-ui, sans-serif";
  pidCtx.fillStyle = "#64748b";
  pidCtx.strokeStyle = "#1e293b";
  pidCtx.lineWidth = 1;

  [[10, "+180°"], [(10 + topH) / 2, "0°"], [topH, "-180°"]].forEach(([y, lbl], idx) => {
    pidCtx.beginPath();
    if (idx === 1) pidCtx.setLineDash([4, 4]); else pidCtx.setLineDash([]);
    pidCtx.moveTo(padL, y);
    pidCtx.lineTo(w - 6, y);
    pidCtx.stroke();
    pidCtx.fillText(lbl, 4, y + 3);
  });
  pidCtx.setLineDash([]);
  pidCtx.fillText("PWM", 4, botTop + 12);

  if (pidHistory.length < 2) return;

  const plotLine = (key, color, minV, maxV, yTop, yBot) => {
    pidCtx.strokeStyle = color;
    pidCtx.lineWidth = 2;
    pidCtx.beginPath();
    pidHistory.forEach((p, i) => {
      const x = padL + (i / (MAX_HIST - 1)) * plotW;
      const norm = clamp((p[key] - minV) / (maxV - minV), 0, 1);
      const y = yBot - norm * (yBot - yTop);
      if (i === 0) pidCtx.moveTo(x, y);
      else pidCtx.lineTo(x, y);
    });
    pidCtx.stroke();
  };

  plotLine("sp", "#38bdf8", -180, 180, 10, topH);
  plotLine("act", "#22c55e", -180, 180, 10, topH);
  plotLine("err", "#f59e0b", -90, 90, botTop, h - 8);
  plotLine("out", "#ef4444", -255, 255, botTop, h - 8);
}
window.addEventListener("resize", drawPidChart);

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }

function computeMotionAngle(wl) {
  if (saved.mode === "index_cam" || saved.mode === "palm_tilt") {
    const pA = saved.mode === "index_cam" ? wl[5] : wl[0];
    const pB = saved.mode === "index_cam" ? wl[8] : wl[9];
    const rawDeg = (Math.atan2(pB.x - pA.x, -(pB.y - pA.y)) * 180) / Math.PI;
    lastRatio = rawDeg;

    const minD = saved.mode === "index_cam" ? saved.indexMinDeg : saved.palmMinDeg;
    const maxD = saved.mode === "index_cam" ? saved.indexMaxDeg : saved.palmMaxDeg;
    let span = maxD - minD;
    if (Math.abs(span) < 5) span = span >= 0 ? 5 : -5;
    const openNorm = clamp((rawDeg - minD) / span, 0, 1);
    let angle = -180 + openNorm * 360;
    if (saved.invert) angle = -angle;
    return clamp(angle * saved.gain, -180, 180);
  }

  const palmSize = dist(wl[0], wl[9]) || 0.09;
  let ratio, minR, maxR;
  if (saved.mode === "thumb_slide") {
    ratio = dist(wl[4], wl[17]) / palmSize;
    minR = saved.thumbClosedRatio;
    maxR = saved.thumbOpenRatio;
  } else {
    const tipAvg = (dist(wl[0], wl[8]) + dist(wl[0], wl[12]) + dist(wl[0], wl[16]) + dist(wl[0], wl[20])) / 4;
    ratio = tipAvg / palmSize;
    minR = saved.closedRatio;
    maxR = saved.openRatio;
  }
  lastRatio = ratio;
  const span = Math.max(0.10, maxR - minR);
  const openNorm = clamp((ratio - minR) / span, 0, 1);
  let angle = 180 - openNorm * 360;
  if (saved.invert) angle = -angle;
  return clamp(angle * saved.gain, -180, 180);
}

async function startCamera() {
  if (!handLandmarker) { alert("El tanıma modeli henüz yükleniyor, birkaç saniye bekleyin."); return; }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  try { if ("wakeLock" in navigator) await navigator.wakeLock.request("screen"); } catch (_) {}
  running = true;
  lastFrameMs = performance.now();
  requestAnimationFrame(loop);
}

btnStartCam.addEventListener("click", startCamera);
btnFlipCam.addEventListener("click", () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  if (running) startCamera();
});

let frameCount = 0;
let fpsTimer = performance.now();

function loop(now) {
  if (!running) return;
  const dt = Math.min(0.1, Math.max(0.001, (now - lastFrameMs) / 1000));
  lastFrameMs = now;

  frameCount++;
  if (now - fpsTimer >= 1000) {
    fpsLabel.textContent = `${frameCount} FPS`;
    frameCount = 0;
    fpsTimer = now;
  }

  if (saved.mode !== "touch_pad" && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const res = handLandmarker.detectForVideo(video, now);
    if (res.landmarks && res.landmarks.length > 0 && res.worldLandmarks) {
      handBadge.textContent = "Algılandı";
      handBadge.className = "mini-status ok";
      handStatus.textContent = "El Algılandı ✓";
      handStatus.className = "pill ok";

      drawingUtils.drawConnectors(res.landmarks[0], HandLandmarker.HAND_CONNECTIONS, { color: "#38bdf8", lineWidth: 3 });
      drawingUtils.drawLandmarks(res.landmarks[0], { color: "#f8fafc", radius: 4 });

      const rawAngle = computeMotionAngle(res.worldLandmarks[0]);
      const alpha = Number(rngAlpha.value);
      const deadband = Number(rngDeadband.value);
      const maxStep = Number(rngSlew.value) * dt;

      smoothedAngle = alpha * rawAngle + (1 - alpha) * smoothedAngle;
      slewedAngle += clamp(smoothedAngle - slewedAngle, -maxStep, maxStep);
      updateAngleUI(slewedAngle);

      if (isArmed && now - lastSendTime >= 33) {
        if (Math.abs(slewedAngle - lastSentAngle) >= deadband) {
          sendTarget(slewedAngle, true);
          lastSentAngle = slewedAngle;
        } else {
          sendTarget(lastSentAngle, true);
        }
        lastSendTime = now;
      }
    } else {
      handBadge.textContent = "Yok";
      handBadge.className = "mini-status";
      handStatus.textContent = "El bekleniyor (Kilitli)";
      handStatus.className = "pill warn";
      if (isArmed) sendTarget(lastSentAngle, false);
    }
  }
  requestAnimationFrame(loop);
}
