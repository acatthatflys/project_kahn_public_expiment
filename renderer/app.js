/* Project Kahn crisis renderer — replays tournament CSVs on a scenario map. */

const $ = (id) => document.getElementById(id);

const SCENARIO_KEYS = {
  "Territorial Dispute (Baseline)": "v6_baseline",
  "Alliance Leadership Test": "v7_alliance",
  "Strategic Resource Race": "v7_resource",
  "Strategic Chokepoint Crisis": "v7_strait",
  "Power Transition Crisis": "v7_power_transition",
  "Power Transition Crisis (State A Rising)": "v7_power_transition_a_rising",
  "Power Transition Crisis (State B Rising)": "v7_power_transition_b_rising",
  "Pre-Ceasefire Land Grab": "v7_land_grab",
  "First Strike Crisis": "v8_first_strike_fear",
  "Regime Survival Crisis": "v9_regime_survival",
  "Strategic Standoff Crisis": "v10_standoff_crisis",
};

let rows = [];
let turn = 0;
let playing = false;
let timer = null;
let animT = 0;
let lastNuke = 0;
let models = { a: "State A", b: "State B" };

function parseCSV(text) {
  const lines = [];
  let i = 0, field = "", row = [], inQ = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { if (row.length) lines.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") pushField();
      else if (c === "\n") { pushField(); pushRow(); }
      else if (c !== "\r") field += c;
    }
    i++;
  }
  if (field.length || row.length) { pushField(); pushRow(); }
  if (!lines.length) return [];
  const headers = lines[0];
  return lines.slice(1).filter((r) => r.length > 1).map((r) => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = r[idx] ?? ""; });
    return o;
  });
}

function num(v, d = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
}
function truthy(v) {
  return v === true || v === "True" || v === "true" || v === "1";
}

function inferModels(filename) {
  // kahn_game_v12_MODEL_vs_MODEL_agg_...
  const m = filename.match(/kahn_game_v1[12]_(.+)_vs_(.+)_agg_/);
  if (m) return { a: m[1], b: m[2] };
  return { a: "State A", b: "State B" };
}

function scenarioKey(row) {
  const name = (row && row.scenario) || "";
  return SCENARIO_KEYS[name] || "v6_baseline";
}

function actionClass(val) {
  if (val >= 450) return "hot";
  if (val >= 125) return "warn";
  return "";
}

function clip(s, n = 900) {
  s = (s || "").trim();
  if (s.length <= n) return s || "—";
  return s.slice(0, n) + "…";
}

async function loadGameList() {
  try {
    const res = await fetch("/api/games");
    const games = await res.json();
    const sel = $("gameSelect");
    sel.innerHTML = "";
    games.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.file;
      opt.textContent = g.label;
      sel.appendChild(opt);
    });
    if (games.length) await loadNamed(games[0].file);
  } catch (e) {
    $("gameSelect").innerHTML = "<option>Could not list games — upload a CSV</option>";
  }
}

async function loadNamed(file) {
  const res = await fetch("/api/game/" + encodeURIComponent(file));
  const text = await res.text();
  models = inferModels(file);
  applyRows(parseCSV(text));
}

function applyRows(data) {
  rows = data;
  turn = 0;
  stop();
  $("turnSlider").max = Math.max(0, rows.length - 1);
  $("turnSlider").value = 0;
  render();
}

$("gameSelect").addEventListener("change", (e) => loadNamed(e.target.value));
$("fileIn").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  models = inferModels(f.name);
  const reader = new FileReader();
  reader.onload = () => applyRows(parseCSV(reader.result));
  reader.readAsText(f);
});

$("btnNext").onclick = () => { stop(); step(1); };
$("btnPrev").onclick = () => { stop(); step(-1); };
$("btnPlay").onclick = () => (playing ? stop() : play());
$("turnSlider").oninput = (e) => { stop(); turn = +e.target.value; render(); };

function step(d) {
  turn = Math.max(0, Math.min(rows.length - 1, turn + d));
  render();
}
function play() {
  playing = true;
  $("btnPlay").textContent = "Pause";
  const tick = () => {
    if (!playing) return;
    if (turn >= rows.length - 1) { stop(); return; }
    turn += 1;
    render(true);
    timer = setTimeout(tick, +$("speed").value);
  };
  timer = setTimeout(tick, +$("speed").value);
}
function stop() {
  playing = false;
  $("btnPlay").textContent = "Play";
  if (timer) clearTimeout(timer);
}

function render(animate = false) {
  if (!rows.length) return;
  const r = rows[turn];
  $("turnSlider").value = turn;
  $("turnLabel").textContent = `Turn ${r.turn || turn + 1} / ${rows.length}`;
  $("scenarioBadge").textContent = r.scenario || "scenario";
  const over = truthy(r.game_over);
  $("statusBadge").textContent = over ? `ended: ${r.end_reason || "complete"}` : "in progress";
  $("statusBadge").className = "badge" + (over ? " over" : "");

  $("modelA").textContent = models.a;
  $("modelB").textContent = models.b;

  const aC = num(r.a_conventional_power, 0.5);
  const bC = num(r.b_conventional_power, 0.5);
  const aN = num(r.a_nuclear_power, 0.5);
  const bN = num(r.b_nuclear_power, 0.5);
  $("aConv").textContent = aC.toFixed(2);
  $("bConv").textContent = bC.toFixed(2);
  $("aNuc").textContent = aN.toFixed(2);
  $("bNuc").textContent = bN.toFixed(2);
  $("aConvBar").style.width = `${Math.max(4, aC * 100)}%`;
  $("bConvBar").style.width = `${Math.max(4, bC * 100)}%`;
  $("aNucBar").style.width = `${Math.max(4, aN * 100)}%`;
  $("bNucBar").style.width = `${Math.max(4, bN * 100)}%`;

  $("aPublic").textContent = r.state_a_public_statement || "—";
  $("bPublic").textContent = r.state_b_public_statement || "—";

  const aVal = num(r.a_action_value);
  const bVal = num(r.b_action_value);
  const aChip = $("aActionChip");
  const bChip = $("bActionChip");
  aChip.textContent = r.a_action_rung || "—";
  bChip.textContent = r.b_action_rung || "—";
  aChip.className = "action-chip " + actionClass(aVal);
  bChip.className = "action-chip " + actionClass(bVal);

  $("aSignal").textContent = `signal value ${r.a_immediate_signal_value || "—"} · ${clip(r.a_conditional_signal_text, 140)}`;
  $("bSignal").textContent = `signal value ${r.b_immediate_signal_value || "—"} · ${clip(r.b_conditional_signal_text, 140)}`;
  $("aForecast").textContent = `predicts opponent: ${r.state_a_forecast_predicted_opponent_action || r.a_predicted_opponent_action || "—"} (${r.state_a_forecast_predictive_confidence || r.a_predictive_confidence || "?"})`;
  $("bForecast").textContent = `predicts opponent: ${r.state_b_forecast_predicted_opponent_action || r.b_predicted_opponent_action || "—"} (${r.state_b_forecast_predictive_confidence || r.b_predictive_confidence || "?"})`;

  $("aThought").textContent = [
    r.state_a_reflection_situational_assessment,
    r.state_a_forecast_prediction_reasoning,
    r.a_action_rationale,
    r.state_a_action_consistency_statement,
  ].filter(Boolean).map(clip).join("\n\n");

  $("bThought").textContent = [
    r.state_b_reflection_situational_assessment,
    r.state_b_forecast_prediction_reasoning,
    r.b_action_rationale,
    r.state_b_action_consistency_statement,
  ].filter(Boolean).map(clip).join("\n\n");

  const terr = num(r.territory_balance);
  $("terrLabel").textContent = `Territory ${terr.toFixed(2)} (Δ ${num(r.territory_change).toFixed(2)})  ·  A+ / B−`;

  const accA = truthy(r.a_accident);
  const accB = truthy(r.b_accident);
  if (accA || accB) {
    showToast(`ACCIDENT: ${accA ? "State A" : ""}${accA && accB ? " & " : ""}${accB ? "State B" : ""} escalated unintentionally`);
    $("statusBadge").className = "badge acc";
  }

  if (animate && (aVal >= 450 || bVal >= 450)) {
    flashNuke(aVal >= 1000 || bVal >= 1000);
    lastNuke = performance.now();
  }

  drawMap(r, animate);
}

function showToast(msg) {
  const t = $("toast");
  t.hidden = false;
  t.textContent = msg;
  setTimeout(() => { t.hidden = true; }, 2200);
}

function flashNuke(strategic) {
  const fx = $("fx");
  fx.className = "flash nuke";
  void fx.offsetWidth;
  fx.classList.add("nuke");
  if (strategic) showToast("STRATEGIC NUCLEAR WAR");
  else showToast("NUCLEAR USE");
}

/* ---------------- map ---------------- */
const canvas = $("map");
const ctx = canvas.getContext("2d");
let particles = [];

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = Math.max(1, rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (rows.length) drawMap(rows[turn], false);
}
window.addEventListener("resize", resize);

function W() { return canvas.getBoundingClientRect().width; }
function H() { return canvas.getBoundingClientRect().height; }

function drawMap(r, animate) {
  const w = W(), h = H();
  ctx.clearRect(0, 0, w, h);
  const key = scenarioKey(r);
  const terr = num(r.territory_balance); // -5 .. 5  A positive
  const shift = (terr / 5) * (w * 0.12);
  const aVal = num(r.a_action_value);
  const bVal = num(r.b_action_value);

  drawBackdrop(key, w, h);
  drawTerrain(key, w, h, shift);
  drawForces(key, w, h, shift, r);
  drawMissiles(w, h, aVal, bVal, shift);
  drawLabels(key, w, h, shift);

  if (animate) spawnActionFx(aVal, bVal, w, h, shift);
  stepParticles();
}

function drawBackdrop(key, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (key === "v7_strait") {
    g.addColorStop(0, "#0a2233"); g.addColorStop(1, "#061018");
  } else if (key === "v8_first_strike_fear") {
    g.addColorStop(0, "#1a1010"); g.addColorStop(1, "#0a0808");
  } else {
    g.addColorStop(0, "#102030"); g.addColorStop(1, "#0a121c");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function landBlob(x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();
}

function drawTerrain(key, w, h, shift) {
  const mid = w / 2 + shift;
  if (key === "v7_strait") {
    ctx.fillStyle = "#123a55";
    ctx.fillRect(0, 0, w, h);
    landBlob(w * 0.22, h * 0.5, w * 0.22, h * 0.42, "#1d4a38");
    landBlob(w * 0.78, h * 0.5, w * 0.22, h * 0.42, "#4a2a2a");
    // chokepoint
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(mid - 10, h * 0.28, 20, h * 0.44);
    ctx.fillStyle = "#0b2a3d";
    ctx.fillRect(mid - 6, 0, 12, h);
  } else if (key === "v7_resource") {
    landBlob(w * 0.3 + shift * 0.3, h * 0.5, w * 0.28, h * 0.38, "#2a4a32");
    landBlob(w * 0.7 + shift * 0.3, h * 0.5, w * 0.28, h * 0.38, "#4a3228");
    for (let i = 0; i < 7; i++) {
      const x = mid - 40 + (i % 4) * 28;
      const y = h * 0.42 + Math.floor(i / 4) * 28;
      ctx.fillStyle = "#d4af37";
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    }
  } else if (key === "v10_standoff_crisis") {
    ctx.fillStyle = "#2a3340";
    ctx.fillRect(w * 0.18, h * 0.18, w * 0.64, h * 0.64);
    ctx.fillStyle = "#4aa3ff33";
    ctx.fillRect(w * 0.18, h * 0.18, mid - w * 0.18, h * 0.64);
    ctx.fillStyle = "#ff6b6b33";
    ctx.fillRect(mid, h * 0.18, w * 0.82 - mid, h * 0.64);
    ctx.strokeStyle = "#f0c14b";
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(mid, h * 0.18); ctx.lineTo(mid, h * 0.82); ctx.stroke();
    ctx.setLineDash([]);
  } else if (key === "v9_regime_survival") {
    landBlob(w * 0.28, h * 0.5, w * 0.26, h * 0.36, "#1e3d4a");
    landBlob(w * 0.72, h * 0.5, w * 0.26, h * 0.36, "#4a1e28");
    star(w * 0.28, h * 0.48, 10, "#4aa3ff");
    star(w * 0.72, h * 0.48, 10, "#ff6b6b");
  } else if (key.startsWith("v7_power_transition")) {
    landBlob(w * 0.32, h * 0.52, w * 0.3, h * 0.34, "#254060");
    landBlob(w * 0.7, h * 0.48, w * 0.26, h * 0.3, "#603030");
    ctx.fillStyle = "rgba(240,193,75,0.25)";
    ctx.beginPath(); ctx.arc(mid, h * 0.5, 40, 0, Math.PI * 2); ctx.fill();
  } else if (key === "v8_first_strike_fear") {
    landBlob(w * 0.28, h * 0.5, w * 0.26, h * 0.36, "#2a3038");
    landBlob(w * 0.72, h * 0.5, w * 0.26, h * 0.36, "#382828");
    for (let i = 0; i < 4; i++) {
      silo(w * 0.18 + i * 28, h * 0.7, "#4aa3ff");
      silo(w * 0.62 + i * 28, h * 0.28, "#ff6b6b");
    }
  } else if (key === "v7_alliance") {
    landBlob(w * 0.3, h * 0.5, w * 0.24, h * 0.32, "#1d4a38");
    landBlob(w * 0.7, h * 0.5, w * 0.24, h * 0.32, "#4a2a2a");
    [[0.12, 0.22], [0.18, 0.78], [0.42, 0.18]].forEach(([x, y]) => landBlob(w * x, h * y, 28, 18, "#2a6a50"));
    [[0.88, 0.22], [0.82, 0.8], [0.58, 0.16]].forEach(([x, y]) => landBlob(w * x, h * y, 28, 18, "#6a3a3a"));
    disputed(mid, h * 0.5);
  } else if (key === "v7_land_grab") {
    landBlob(w * 0.5, h * 0.5, w * 0.42, h * 0.36, "#2a4034");
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "#f0c14b";
    ctx.beginPath(); ctx.moveTo(mid, h * 0.18); ctx.lineTo(mid, h * 0.82); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#4aa3ff55";
    ctx.fillRect(w * 0.12, h * 0.22, mid - w * 0.12, h * 0.56);
    ctx.fillStyle = "#ff6b6b55";
    ctx.fillRect(mid, h * 0.22, w * 0.88 - mid, h * 0.56);
  } else {
    landBlob(w * 0.28, h * 0.52, w * 0.26, h * 0.34, "#1e4a3a");
    landBlob(w * 0.72, h * 0.52, w * 0.26, h * 0.34, "#4a2a2a");
    disputed(mid, h * 0.5);
  }
}

function disputed(x, y) {
  ctx.fillStyle = "rgba(240,193,75,0.35)";
  ctx.beginPath();
  ctx.moveTo(x, y - 50);
  ctx.lineTo(x + 40, y);
  ctx.lineTo(x, y + 50);
  ctx.lineTo(x - 40, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#f0c14b";
  ctx.stroke();
}

function star(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2) / 5;
    const b = a + Math.PI / 5;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(b) * r * 0.4, y + Math.sin(b) * r * 0.4);
  }
  ctx.closePath(); ctx.fill();
}

function silo(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 10, 16);
  ctx.fillStyle = "#111";
  ctx.fillRect(x + 2, y + 2, 6, 8);
}

function drawForces(key, w, h, shift, r) {
  const aVal = num(r.a_action_value);
  const bVal = num(r.b_action_value);
  const ax = w * 0.28 + shift * 0.2, ay = h * 0.5;
  const bx = w * 0.72 + shift * 0.2, by = h * 0.5;
  unit(ax, ay, "#4aa3ff", Math.min(1, 0.4 + aVal / 400));
  unit(bx, by, "#ff6b6b", Math.min(1, 0.4 + bVal / 400));
  if (aVal >= 40 && aVal < 125) arrows(ax + 40, ay, 1, "#4aa3ff88");
  if (bVal >= 40 && bVal < 125) arrows(bx - 40, by, -1, "#ff6b6b88");
}

function unit(x, y, color, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0b1018";
  ctx.fillRect(-8, -3, 16, 6);
  ctx.restore();
}

function arrows(x, y, dir, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y - 16 + i * 16);
    ctx.lineTo(x + dir * 28, y - 16 + i * 16);
    ctx.stroke();
  }
}

function drawMissiles(w, h, aVal, bVal, shift) {
  const t = (performance.now() / 700) % 1;
  if (aVal >= 125) missile(w * 0.32, h * 0.62, w * 0.68, h * 0.38, t, "#4aa3ff", aVal);
  if (bVal >= 125) missile(w * 0.68, h * 0.38, w * 0.32, h * 0.62, (t + 0.4) % 1, "#ff6b6b", bVal);
}

function missile(x0, y0, x1, y1, t, color, val) {
  const x = x0 + (x1 - x0) * t;
  const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 40;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, val >= 450 ? 6 : 3, 0, Math.PI * 2); ctx.fill();
  if (val >= 450) {
    ctx.fillStyle = "rgba(255,200,80,0.5)";
    ctx.beginPath(); ctx.arc(x, y, 14 + Math.sin(t * 20) * 4, 0, Math.PI * 2); ctx.fill();
  }
  if (val >= 1000 && t > 0.85) {
    ctx.fillStyle = "rgba(255,255,200,0.7)";
    ctx.beginPath(); ctx.arc(x1, y1, 50, 0, Math.PI * 2); ctx.fill();
  }
}

function drawLabels(key, w, h, shift) {
  ctx.fillStyle = "#c9d6e8";
  ctx.font = "13px sans-serif";
  ctx.fillText("STATE A", 24, 28);
  ctx.textAlign = "right";
  ctx.fillText("STATE B", w - 24, 28);
  ctx.textAlign = "left";
  const titles = {
    v7_strait: "maritime chokepoint",
    v7_resource: "rare-earth deposits",
    v8_first_strike_fear: "silo fields on alert",
    v9_regime_survival: "capitals under threat",
    v10_standoff_crisis: "divided strategic city",
    v7_land_grab: "ceasefire line (closing)",
    v7_alliance: "watched by allied capitals",
    v7_power_transition: "order under challenge",
    v7_power_transition_a_rising: "A rising / B hegemon",
    v7_power_transition_b_rising: "B rising / A hegemon",
    v6_baseline: "disputed borderlands",
  };
  ctx.fillStyle = "#8ea0b8";
  ctx.font = "11px sans-serif";
  ctx.fillText(titles[key] || "", 24, h - 16);
}

function spawnActionFx(aVal, bVal, w, h, shift) {
  const burst = (x, y, color, n) => {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 40 + Math.random() * 20,
        color,
      });
    }
  };
  if (aVal >= 50) burst(w * 0.45, h * 0.5, "#4aa3ff", aVal >= 450 ? 40 : 12);
  if (bVal >= 50) burst(w * 0.55, h * 0.5, "#ff6b6b", bVal >= 450 ? 40 : 12);
}

function stepParticles() {
  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => {
    p.x += p.vx; p.y += p.vy; p.life -= 1;
    ctx.globalAlpha = Math.max(0, p.life / 50);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3, 3);
    ctx.globalAlpha = 1;
  });
}

function loop() {
  animT += 1;
  if (rows.length) drawMap(rows[turn], false);
  requestAnimationFrame(loop);
}

resize();
loadGameList().then(() => requestAnimationFrame(loop));
