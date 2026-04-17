(() => {
  "use strict";

  const state = {
    balance: 100,
    bonusSpins: 0,
    streak: 0,
    bet: 5,
    lastWin: 0,
    bestCombo: ["—", "—", "—"],
    bestComboScore: 0,
    lastCombo: ["—", "—", "—"],
    isSpinning: false,
    autoSpin: false,
    soundOn: true,
    vibrateOn: true,
    audioCtx: null,
    autoTimer: null,
  };

  const SYMBOLS = {
    winners: ["🪙", "💵", "💰", "👑"],
    garbage: ["🥾", "🦴", "💀", "🪨", "🪶"],
    wild: "⭐",
    bonus: "🎁",
  };

  const PAYOUTS = {
    "🪙": 5,
    "💵": 25,
    "💰": 50,
    "👑": 100,
    "⭐": 100,
  };

  const BET_MIN = 5;
  const BET_MAX = 100;
  const BET_STEP = 5;

  let els = null;
  let reelIntervals = [null, null, null];

  function byId(id) {
    return document.getElementById(id);
  }

  function qs(sel) {
    return document.querySelector(sel);
  }

  function init() {
    els = getElements();

    if (!validateRequiredElements()) {
      console.error("Initialization aborted because required DOM elements are missing.");
      return;
    }

    bindEvents();
    renderAll();
    ensureFullscreenOverlay();
    setStatus("Ready to spin.");
  }

  function getElements() {
    return {
      fullscreenGate: byId("fullscreenGate"),
      enterFullscreenBtn: byId("enterFullscreenBtn"),

      balanceValue: byId("balanceValue"),
      bonusValue: byId("bonusValue"),
      streakValue: byId("streakValue"),
      statusText: byId("statusText"),

      reelWrap: byId("reelWrap"),
      reels: [byId("reel0"), byId("reel1"), byId("reel2")],

      betDownBtn: byId("betDownBtn"),
      betUpBtn: byId("betUpBtn"),
      betValue: byId("betValue"),
      betChip: byId("betChip"),

      spinBtn: byId("spinBtn"),
      autoBtn: byId("autoBtn"),
      bonusBtn: byId("bonusBtn"),
      soundBtn: byId("soundBtn"),
      vibrateBtn: byId("vibrateBtn"),

      lastWinValue: byId("lastWinValue"),
      bestComboValue: byId("bestComboValue"),
      lastComboValue: byId("lastComboValue"),

      coinBurst: byId("coinBurst"),
      machine: qs(".machine"),
    };
  }

  function validateRequiredElements() {
    const required = [
      "fullscreenGate",
      "enterFullscreenBtn",
      "balanceValue",
      "bonusValue",
      "streakValue",
      "statusText",
      "betDownBtn",
      "betUpBtn",
      "betValue",
      "spinBtn",
      "autoBtn",
      "bonusBtn",
      "soundBtn",
      "vibrateBtn",
      "lastWinValue",
      "bestComboValue",
      "lastComboValue",
      "coinBurst",
      "reelWrap",
    ];

    for (const key of required) {
      if (!els[key]) {
        console.error(`Missing required element: #${key}`);
        return false;
      }
    }

    if (!Array.isArray(els.reels) || els.reels.length !== 3 || els.reels.some((r) => !r)) {
      console.error("Missing one or more reel elements: #reel0, #reel1, #reel2");
      return false;
    }

    return true;
  }

  function bindEvents() {
    els.enterFullscreenBtn.addEventListener("click", handleFullscreenEntry, { passive: false });

    document.addEventListener("fullscreenchange", ensureFullscreenOverlay);
    document.addEventListener("webkitfullscreenchange", ensureFullscreenOverlay);
    window.addEventListener("resize", ensureFullscreenOverlay);

    els.betDownBtn.addEventListener("click", () => adjustBet(-BET_STEP));
    els.betUpBtn.addEventListener("click", () => adjustBet(BET_STEP));

    els.spinBtn.addEventListener("click", () => {
      spin({ useBonus: false });
    });

    els.bonusBtn.addEventListener("click", () => {
      spin({ useBonus: true });
    });

    els.autoBtn.addEventListener("click", toggleAutoSpin);
    els.soundBtn.addEventListener("click", toggleSound);
    els.vibrateBtn.addEventListener("click", toggleVibration);
  }

  async function handleFullscreenEntry() {
    unlockAudio();

    const entered = await requestFullscreenSafe();

    if (!entered) {
      setStatus("Fullscreen not supported or blocked. You can still play.");
      if (els.fullscreenGate) {
        els.fullscreenGate.style.display = "none";
      }
      return;
    }

    ensureFullscreenOverlay();
    setStatus("Ready to spin.");
  }

  async function requestFullscreenSafe() {
    const root = document.documentElement;
    const fn =
      root.requestFullscreen ||
      root.webkitRequestFullscreen ||
      root.mozRequestFullScreen ||
      root.msRequestFullscreen;

    if (!fn) {
      return false;
    }

    try {
      const result = fn.call(root);
      if (result && typeof result.then === "function") {
        await result;
      }
      return true;
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
      return false;
    }
  }

  function isFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  function ensureFullscreenOverlay() {
    if (!els || !els.fullscreenGate) return;

    const active = isFullscreenActive();
    els.fullscreenGate.style.display = active ? "none" : "flex";
  }

  function adjustBet(delta) {
    if (state.isSpinning) return;

    const next = clamp(state.bet + delta, BET_MIN, BET_MAX);
    if (next === state.bet) return;

    state.bet = next;
    renderBet();
    playUiTick();
    vibrate([8]);
  }

  function toggleAutoSpin() {
    state.autoSpin = !state.autoSpin;
    els.autoBtn.textContent = state.autoSpin ? "Stop" : "Auto";
    els.autoBtn.setAttribute("aria-pressed", String(state.autoSpin));

    if (state.autoSpin) {
      setStatus("Auto spinning...");
      if (!state.isSpinning) {
        spin({ useBonus: false, triggeredByAuto: true });
      }
    } else {
      clearAutoTimer();
      setStatus("Auto stopped.");
    }
  }

  function toggleSound() {
    state.soundOn = !state.soundOn;
    els.soundBtn.textContent = state.soundOn ? "Sound" : "Muted";
    els.soundBtn.setAttribute("aria-pressed", String(state.soundOn));
    if (state.soundOn) unlockAudio();
  }

  function toggleVibration() {
    state.vibrateOn = !state.vibrateOn;
    els.vibrateBtn.textContent = state.vibrateOn ? "Vibrate" : "Smooth";
    els.vibrateBtn.setAttribute("aria-pressed", String(state.vibrateOn));
  }

  async function spin({ useBonus = false, triggeredByAuto = false } = {}) {
    if (state.isSpinning) return;

    if (useBonus) {
      if (state.bonusSpins <= 0) {
        setStatus("No bonus spins available.");
        playLoseTone();
        vibrate([20, 30, 20]);
        return;
      }
    } else {
      if (state.balance < state.bet) {
        setStatus("Not enough balance.");
        playLoseTone();
        vibrate([20, 30, 20]);

        if (state.autoSpin) {
          state.autoSpin = false;
          els.autoBtn.textContent = "Auto";
          els.autoBtn.setAttribute("aria-pressed", "false");
          clearAutoTimer();
        }
        return;
      }
    }

    state.isSpinning = true;
    disableControls(true);

    unlockAudio();

    if (useBonus) {
      state.bonusSpins -= 1;
    } else {
      state.balance -= state.bet;
    }

    renderTopStats();
    setStatus("Spinning...");
    playSpinStart();
    vibrate([15, 20, 15]);

    const finalCombo = generateFinalCombo();

    await animateSpinSequence(finalCombo);

    const result = evaluateCombo(finalCombo, state.bet);

    state.lastCombo = [...finalCombo];
    state.lastWin = result.win;

    if (result.win > 0) {
      state.balance += result.win;
      state.streak += 1;

      if (result.score > state.bestComboScore) {
        state.bestComboScore = result.score;
        state.bestCombo = [...finalCombo];
      }
    } else {
      state.streak = 0;
    }

    if (result.bonusAward > 0) {
      state.bonusSpins += result.bonusAward;
    }

    renderAll();

    if (result.win > 0) {
      const bonusText =
        result.bonusAward > 0
          ? ` + ${result.bonusAward} bonus spin${result.bonusAward > 1 ? "s" : ""}`
          : "";
      setStatus(`Won $${result.win}${bonusText}`);
      playWinTone(result.win);
      spawnCoins(Math.max(6, Math.min(18, Math.floor(result.win / 25))));
      vibrate([35, 40, 60]);
    } else if (result.bonusAward > 0) {
      setStatus(`Got ${result.bonusAward} bonus spin${result.bonusAward > 1 ? "s" : ""}`);
      playBonusTone();
      vibrate([20, 40, 20]);
    } else {
      setStatus("No win.");
      playLoseTone();
      vibrate([18]);
    }

    state.isSpinning = false;
    disableControls(false);

    if (state.autoSpin && !useBonus) {
      clearAutoTimer();
      state.autoTimer = setTimeout(() => {
        if (state.autoSpin && !state.isSpinning) {
          spin({ useBonus: false, triggeredByAuto: true });
        }
      }, 500);
    } else if (!state.autoSpin && triggeredByAuto) {
      clearAutoTimer();
    }
  }

  function generateFinalCombo() {
    const roll = Math.random();

    if (roll < 0.18) {
      return buildWinningCombo();
    }

    if (roll < 0.30) {
      return buildBonusCombo();
    }

    return buildLosingCombo();
  }

  function buildWinningCombo() {
    const subRoll = Math.random();

    if (subRoll < 0.1) {
      return [SYMBOLS.wild, SYMBOLS.wild, SYMBOLS.wild];
    }

    const main = pick(SYMBOLS.winners);

    if (subRoll < 0.3) {
      return shuffle([main, main, SYMBOLS.wild]);
    }

    return [main, main, main];
  }

  function buildBonusCombo() {
    const gifts = Math.random() < 0.25 ? 2 : 1;
    const combo = [null, null, null];
    const positions = shuffle([0, 1, 2]).slice(0, gifts);

    for (const pos of positions) {
      combo[pos] = SYMBOLS.bonus;
    }

    for (let i = 0; i < 3; i++) {
      if (!combo[i]) {
        combo[i] = pick([...SYMBOLS.winners, SYMBOLS.wild, ...SYMBOLS.garbage]);
      }
    }

    if (createsUnwantedGarbagePair(combo) || countsAsWin(combo)) {
      return buildBonusCombo();
    }

    return combo;
  }

  function buildLosingCombo() {
    const pool = [...SYMBOLS.winners, ...SYMBOLS.garbage, SYMBOLS.wild];
    const combo = [pick(pool), pick(pool), pick(pool)];

    if (countsAsWin(combo)) return buildLosingCombo();
    if (createsUnwantedGarbagePair(combo)) return buildLosingCombo();
    if (combo.includes(SYMBOLS.bonus)) return buildLosingCombo();

    return combo;
  }

  function createsUnwantedGarbagePair(combo) {
    return SYMBOLS.garbage.some((g) => combo.filter((s) => s === g).length >= 2);
  }

  function countsAsWin(combo) {
    if (combo.every((s) => s === SYMBOLS.wild)) return true;

    for (const symbol of SYMBOLS.winners) {
      const count = combo.filter((s) => s === symbol).length;
      const wilds = combo.filter((s) => s === SYMBOLS.wild).length;
      if (count + wilds >= 3) return true;
    }

    return false;
  }

  function evaluateCombo(combo, bet) {
    const bonusAward = combo.filter((s) => s === SYMBOLS.bonus).length;
    let win = 0;
    let score = 0;

    if (combo.every((s) => s === SYMBOLS.wild)) {
      score = PAYOUTS[SYMBOLS.wild] * bet;
      win = score;
      return { win, bonusAward, score };
    }

    for (const symbol of SYMBOLS.winners) {
      const count = combo.filter((s) => s === symbol).length;
      const wilds = combo.filter((s) => s === SYMBOLS.wild).length;

      if (count + wilds >= 3) {
        score = PAYOUTS[symbol] * bet;
        win = score;
        return { win, bonusAward, score };
      }
    }

    return { win, bonusAward, score };
  }

  async function animateSpinSequence(finalCombo) {
    clearReelIntervals();

    const framePools = [
      buildFramePool(finalCombo[0], 0),
      buildFramePool(finalCombo[1], 1),
      buildFramePool(finalCombo[2], 2),
    ];

    startReelLoop(0, framePools[0]);
    await wait(120);

    startReelLoop(1, framePools[1]);
    await wait(120);

    startReelLoop(2, framePools[2]);

    await wait(400);

    stopReelLoop(0, finalCombo[0]);
    playReelStop(0);
    vibrate([10]);

    await wait(220);

    stopReelLoop(1, finalCombo[1]);
    playReelStop(1);
    vibrate([10]);

    await wait(220);

    stopReelLoop(2, finalCombo[2]);
    playReelStop(2);
    vibrate([16]);
  }

  function buildFramePool(finalSymbol, reelIndex) {
    const pool = [];
    const length = 14 + reelIndex * 4;
    const all = [...SYMBOLS.winners, ...SYMBOLS.garbage, SYMBOLS.wild, SYMBOLS.bonus];

    for (let i = 0; i < length; i++) {
      pool.push(pick(all));
    }

    pool[length - 1] = finalSymbol;
    return pool;
  }

  function startReelLoop(index, frames) {
    let cursor = 0;

    if (!els.reels[index]) return;

    els.reels[index].classList.add("is-spinning");

    reelIntervals[index] = setInterval(() => {
      if (!els.reels[index]) return;
      els.reels[index].textContent = frames[cursor % frames.length];
      cursor++;
    }, 75);
  }

  function stopReelLoop(index, finalSymbol) {
    if (reelIntervals[index]) {
      clearInterval(reelIntervals[index]);
      reelIntervals[index] = null;
    }

    if (els.reels[index]) {
      els.reels[index].classList.remove("is-spinning");
      els.reels[index].textContent = finalSymbol;
    }
  }

  function clearReelIntervals() {
    for (let i = 0; i < reelIntervals.length; i++) {
      if (reelIntervals[i]) {
        clearInterval(reelIntervals[i]);
        reelIntervals[i] = null;
      }
    }
  }

  function renderAll() {
    renderTopStats();
    renderBet();
    renderResultStats();
    renderButtons();
  }

  function renderTopStats() {
    els.balanceValue.textContent = `$${state.balance}`;
    els.bonusValue.textContent = String(state.bonusSpins);
    els.streakValue.textContent = String(state.streak);
  }

  function renderBet() {
    els.betValue.textContent = `$${state.bet}`;
  }

  function renderResultStats() {
    els.lastWinValue.textContent = `$${state.lastWin}`;
    els.bestComboValue.textContent = state.bestCombo.join(" ");
    els.lastComboValue.textContent = state.lastCombo.join(" ");
  }

  function renderButtons() {
    els.autoBtn.textContent = state.autoSpin ? "Stop" : "Auto";
    els.soundBtn.textContent = state.soundOn ? "Sound" : "Muted";
    els.vibrateBtn.textContent = state.vibrateOn ? "Vibrate" : "Smooth";
    els.bonusBtn.disabled = state.isSpinning || state.bonusSpins <= 0;
  }

  function disableControls(disabled) {
    els.betDownBtn.disabled = disabled;
    els.betUpBtn.disabled = disabled;
    els.spinBtn.disabled = disabled;
    els.bonusBtn.disabled = disabled || state.bonusSpins <= 0;
  }

  function setStatus(text) {
    if (els && els.statusText) {
      els.statusText.textContent = text;
    }
  }

  function spawnCoins(count) {
    if (!els.coinBurst || !els.balanceValue || !els.spinBtn) return;

    const balanceRect = els.balanceValue.getBoundingClientRect();
    const spinRect = els.spinBtn.getBoundingClientRect();

    for (let i = 0; i < count; i++) {
      const coin = document.createElement("div");
      coin.textContent = "🪙";
      coin.style.position = "fixed";
      coin.style.left = `${spinRect.left + spinRect.width / 2 + randomRange(-20, 20)}px`;
      coin.style.top = `${spinRect.top + spinRect.height / 2 + randomRange(-10, 10)}px`;
      coin.style.fontSize = "20px";
      coin.style.zIndex = "9999";
      coin.style.pointerEvents = "none";

      const tx = balanceRect.left + balanceRect.width / 2 - (spinRect.left + spinRect.width / 2) + randomRange(-10, 10);
      const ty = balanceRect.top + balanceRect.height / 2 - (spinRect.top + spinRect.height / 2) + randomRange(-10, 10);

      coin.animate(
        [
          { transform: "translate(0,0) scale(0.8)", opacity: 0 },
          { transform: "translate(0, -14px) scale(1)", opacity: 1, offset: 0.2 },
          { transform: `translate(${tx}px, ${ty}px) scale(0.7)`, opacity: 0 }
        ],
        {
          duration: 900,
          delay: i * 35,
          easing: "cubic-bezier(.2,.7,.2,1)",
          fill: "forwards",
        }
      );

      document.body.appendChild(coin);
      setTimeout(() => {
        coin.remove();
      }, 1200 + i * 35);
    }
  }

  function unlockAudio() {
    if (!state.soundOn) return null;

    if (!state.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      state.audioCtx = new AudioContextClass();
    }

    if (state.audioCtx.state === "suspended") {
      state.audioCtx.resume().catch(() => {});
    }

    return state.audioCtx;
  }

  function playTone(freq, duration = 0.08, type = "sine", gainValue = 0.04, when = 0) {
    if (!state.soundOn) return;

    const ctx = unlockAudio();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = ctx.currentTime + when;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startAt);
    osc.stop(startAt + duration + 0.03);
  }

  function playUiTick() {
    playTone(750, 0.03, "square", 0.02);
  }

  function playSpinStart() {
    playTone(220, 0.05, "square", 0.03, 0);
    playTone(300, 0.07, "square", 0.03, 0.05);
    playTone(360, 0.07, "square", 0.025, 0.11);
  }

  function playReelStop(index) {
    const tones = [290, 350, 430];
    playTone(tones[index] || 350, 0.05, "triangle", 0.03);
  }

  function playWinTone(amount) {
    playTone(520, 0.08, "triangle", 0.05, 0);
    playTone(660, 0.08, "triangle", 0.05, 0.08);
    playTone(880, 0.12, "triangle", 0.06, 0.16);

    if (amount >= 500) {
      playTone(1100, 0.14, "triangle", 0.06, 0.28);
      playTone(1320, 0.18, "triangle", 0.05, 0.38);
    }

    playBonusTone();
  }

  function playBonusTone() {
    playTone(980, 0.05, "square", 0.03, 0);
    playTone(1240, 0.06, "square", 0.025, 0.05);
  }

  function playLoseTone() {
    playTone(220, 0.07, "sawtooth", 0.025, 0);
    playTone(180, 0.09, "sawtooth", 0.02, 0.05);
  }

  function vibrate(pattern) {
    if (!state.vibrateOn) return;
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  function clearAutoTimer() {
    if (state.autoTimer) {
      clearTimeout(state.autoTimer);
      state.autoTimer = null;
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    const clone = arr.slice();
    for (let i = clone.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
  }

  function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();