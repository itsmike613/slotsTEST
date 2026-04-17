const state = {
    balance: 150,
    bonusSpins: 0,
    streak: 0,
    bet: 5,
    isSpinning: false,
    auto: false,
    sound: true,
    vibrate: true,
    lastWin: 0,
    lastCombo: ["❔", "❔", "❔"],
    bestCombo: ["❔", "❔", "❔"],
    bestComboValue: 0,
    currentSymbols: ["🪙", "💵", "💰"],
    autoTimer: null,
    audioCtx: null,
};

const PAYOUTS = {
    "🪙": 5,
    "💵": 25,
    "💰": 50,
    "👑": 100,
    "⭐": 100,
};

const WINNERS = ["🪙", "💵", "💰", "👑"];
const GARBAGE = ["🥾", "🦴", "💀", "🪨", "🪶"];
const SPECIALS = ["⭐", "🎁"];
const ALL_SYMBOLS = [...WINNERS, ...GARBAGE, ...SPECIALS];

let els = {};

function getEls() {
    return {
        fullscreenGate: document.getElementById("fullscreenGate"),
        enterFullscreenBtn: document.getElementById("enterFullscreenBtn"),
        app: document.getElementById("app"),
        balance: document.getElementById("balance"),
        bonusSpins: document.getElementById("bonusSpins"),
        streak: document.getElementById("streak"),
        status: document.getElementById("status"),
        reels: [
            document.getElementById("reel1"),
            document.getElementById("reel2"),
            document.getElementById("reel3"),
        ],
        reelWindows: Array.from(document.querySelectorAll(".reel-window")),
        minusBet: document.getElementById("minusBet"),
        plusBet: document.getElementById("plusBet"),
        betValue: document.getElementById("betValue"),
        spinBtn: document.getElementById("spinBtn"),
        autoBtn: document.getElementById("autoBtn"),
        bonusBtn: document.getElementById("bonusBtn"),
        soundBtn: document.getElementById("soundBtn"),
        vibrateBtn: document.getElementById("vibrateBtn"),
        lastWin: document.getElementById("lastWin"),
        bestCombo: document.getElementById("bestCombo"),
        lastCombo: document.getElementById("lastCombo"),
        coinsLayer: document.getElementById("coinsLayer"),
    };
}

function validateEls() {
    const required = [
        "fullscreenGate",
        "enterFullscreenBtn",
        "app",
        "balance",
        "bonusSpins",
        "streak",
        "status",
        "minusBet",
        "plusBet",
        "betValue",
        "spinBtn",
        "autoBtn",
        "bonusBtn",
        "soundBtn",
        "vibrateBtn",
        "lastWin",
        "bestCombo",
        "lastCombo",
        "coinsLayer",
    ];

    for (const key of required) {
        if (!els[key]) {
            console.error(`Missing required element: #${key}`);
            return false;
        }
    }

    if (els.reels.some((el) => !el)) {
        console.error("Missing one or more reel elements: #reel1 #reel2 #reel3");
        return false;
    }

    if (els.reelWindows.length < 3) {
        console.error("Missing .reel-window elements");
        return false;
    }

    return true;
}

function init() {
    els = getEls();

    if (!validateEls()) {
        return;
    }

    bindEvents();
    renderAll();
    setStatus("Ready");
    ensureFullscreenState();
}

function bindEvents() {
    els.enterFullscreenBtn.addEventListener("click", async () => {
        await requestFullscreen();
        ensureFullscreenState();
    });

    document.addEventListener("fullscreenchange", ensureFullscreenState);
    window.addEventListener("resize", ensureFullscreenState);

    els.minusBet.addEventListener("click", () => adjustBet(-5));
    els.plusBet.addEventListener("click", () => adjustBet(5));
    els.spinBtn.addEventListener("click", () => spin(false));
    els.bonusBtn.addEventListener("click", () => spin(true));

    els.autoBtn.addEventListener("click", () => {
        state.auto = !state.auto;
        els.autoBtn.textContent = state.auto ? "Stop" : "Auto";
        els.autoBtn.classList.toggle("active", state.auto);

        if (state.auto) {
            setStatus("Auto spinning...");
            spin(false, true);
        } else {
            clearAuto();
            setStatus("Auto stopped");
        }
    });

    els.soundBtn.addEventListener("click", () => {
        state.sound = !state.sound;
        els.soundBtn.textContent = state.sound ? "Sound" : "Muted";
        els.soundBtn.classList.toggle("muted", !state.sound);
    });

    els.vibrateBtn.addEventListener("click", () => {
        state.vibrate = !state.vibrate;
        els.vibrateBtn.textContent = state.vibrate ? "Vibrate" : "Smooth";
        els.vibrateBtn.classList.toggle("muted", !state.vibrate);
    });
}

function ensureFullscreenState() {
    const isFullscreen = !!document.fullscreenElement;
    if (els.fullscreenGate) els.fullscreenGate.hidden = isFullscreen;
    if (els.app) els.app.classList.toggle("blurred", !isFullscreen);
}

async function requestFullscreen() {
    try {
        const root = document.documentElement;
        if (!document.fullscreenElement && root.requestFullscreen) {
            await root.requestFullscreen();
        }
    } catch (err) {
        setStatus("Fullscreen blocked by browser");
    }
}

function adjustBet(delta) {
    if (state.isSpinning) return;
    state.bet = clamp(state.bet + delta, 5, 100);
    renderBet();
    tick();
}

async function spin(useBonusSpin = false, triggeredByAuto = false) {
    if (state.isSpinning) return;

    if (useBonusSpin) {
        if (state.bonusSpins <= 0) {
            setStatus("No bonus spins available");
            badBuzz();
            return;
        }
    } else {
        if (state.balance < state.bet) {
            setStatus("Not enough balance");
            badBuzz();
            if (state.auto) {
                state.auto = false;
                els.autoBtn.textContent = "Auto";
                els.autoBtn.classList.remove("active");
            }
            return;
        }
    }

    state.isSpinning = true;
    disableControls(true);

    if (useBonusSpin) {
        state.bonusSpins -= 1;
    } else {
        state.balance -= state.bet;
    }

    renderTop();
    renderStats();
    setStatus("Spinning...");
    playSpinStart();
    softBuzz([20, 20, 30]);

    const finalSymbols = buildFinalSpin();
    await animateSpinSequence(finalSymbols);

    state.currentSymbols = finalSymbols.slice();
    state.lastCombo = finalSymbols.slice();

    const result = evaluateSpin(finalSymbols, state.bet);

    if (result.win > 0) {
        state.balance += result.win;
        state.lastWin = result.win;
        state.streak += 1;

        if (result.comboValue > state.bestComboValue) {
            state.bestComboValue = result.comboValue;
            state.bestCombo = finalSymbols.slice();
        }

        if (result.bonusAward > 0) {
            state.bonusSpins += result.bonusAward;
        }

        renderTop();
        renderStats();
        renderReels(finalSymbols);

        setStatus(
            result.bonusAward > 0
                ? `Won $${result.win} + ${result.bonusAward} bonus spin${result.bonusAward > 1 ? "s" : ""}`
                : `Won $${result.win}`
        );

        playWin(result.win);
        softBuzz([40, 30, 60]);
        animateCoins(result.win);
    } else {
        state.lastWin = 0;
        state.streak = 0;
        renderTop();
        renderStats();
        renderReels(finalSymbols);

        setStatus(
            result.bonusAward > 0
                ? `No cash win, but got ${result.bonusAward} bonus spin${result.bonusAward > 1 ? "s" : ""}`
                : "No win"
        );

        if (result.bonusAward > 0) {
            state.bonusSpins += result.bonusAward;
            renderTop();
            playCoinMini();
        } else {
            playLose();
            badBuzz();
        }
    }

    state.isSpinning = false;
    disableControls(false);

    if (state.auto && !useBonusSpin) {
        clearAuto();
        state.autoTimer = setTimeout(() => {
            if (state.auto && !state.isSpinning) {
                spin(false, true);
            }
        }, 520);
    } else if (!state.auto && triggeredByAuto) {
        clearAuto();
    }
}

function buildFinalSpin() {
    const roll = Math.random();
    if (roll < 0.18) return makeWinningCombo();
    if (roll < 0.27) return makeBonusCombo();
    return makeLosingCombo();
}

function makeWinningCombo() {
    const kindRoll = Math.random();

    if (kindRoll < 0.12) return ["⭐", "⭐", "⭐"];

    const base = pick(WINNERS);

    if (kindRoll < 0.32) {
        return shuffle([base, base, "⭐"]);
    }

    return [base, base, base];
}

function makeBonusCombo() {
    const giftCount = Math.random() < 0.25 ? 2 : 1;
    const positions = shuffle([0, 1, 2]).slice(0, giftCount);
    const result = [null, null, null];

    positions.forEach((pos) => {
        result[pos] = "🎁";
    });

    for (let i = 0; i < 3; i += 1) {
        if (!result[i]) {
            result[i] = pick([...WINNERS, "⭐", ...GARBAGE]);
        }
    }

    if (isAccidentalGarbageRepeat(result) || isAccidentalWin(result)) {
        return makeBonusCombo();
    }

    return result;
}

function makeLosingCombo() {
    const pool = [...WINNERS, ...GARBAGE, "⭐"];
    const result = [pick(pool), pick(pool), pick(pool)];

    if (isAccidentalWin(result)) return makeLosingCombo();
    if (isAccidentalGarbageRepeat(result)) return makeLosingCombo();
    if (countSymbol(result, "🎁") >= 1) return makeLosingCombo();

    return result;
}

function isAccidentalWin(arr) {
    const counts = {};
    arr.forEach((s) => {
        counts[s] = (counts[s] || 0) + 1;
    });

    if (counts["⭐"] === 3) return true;

    for (const winner of WINNERS) {
        const c = counts[winner] || 0;
        const stars = counts["⭐"] || 0;
        if (c + stars >= 3) return true;
    }

    return false;
}

function isAccidentalGarbageRepeat(arr) {
    for (const g of GARBAGE) {
        if (countSymbol(arr, g) >= 2) return true;
    }
    return false;
}

function countSymbol(arr, symbol) {
    return arr.filter((x) => x === symbol).length;
}

function evaluateSpin(symbols, betAmount) {
    const bonusAward = countSymbol(symbols, "🎁");
    let win = 0;
    let comboValue = 0;

    if (symbols.every((s) => s === "⭐")) {
        comboValue = PAYOUTS["⭐"] * betAmount;
        win = comboValue;
        return { win, bonusAward, comboValue };
    }

    for (const winner of WINNERS) {
        const count = countSymbol(symbols, winner);
        const wilds = countSymbol(symbols, "⭐");
        if (count + wilds >= 3) {
            comboValue = PAYOUTS[winner] * betAmount;
            win = comboValue;
            return { win, bonusAward, comboValue };
        }
    }

    return { win, bonusAward, comboValue };
}

async function animateSpinSequence(finalSymbols) {
    const pools = [[], [], []];

    for (let i = 0; i < 3; i += 1) {
        pools[i] = makeSpinFrames(finalSymbols[i], i);
    }

    els.reelWindows[0].classList.add("spinning");
    renderReelAt(0, pools[0][0]);
    await wait(110);

    els.reelWindows[1].classList.add("spinning");
    renderReelAt(1, pools[1][0]);
    await wait(110);

    els.reelWindows[2].classList.add("spinning");
    renderReelAt(2, pools[2][0]);

    const maxFrames = Math.max(pools[0].length, pools[1].length, pools[2].length);

    for (let frame = 0; frame < maxFrames; frame += 1) {
        if (frame < pools[0].length) renderReelAt(0, pools[0][frame]);
        if (frame < pools[1].length) renderReelAt(1, pools[1][frame]);
        if (frame < pools[2].length) renderReelAt(2, pools[2][frame]);

        if (frame === Math.floor(maxFrames * 0.62)) {
            els.reelWindows[0].classList.remove("spinning");
            playReelStop(0);
            softBuzz(12);
        }

        if (frame === Math.floor(maxFrames * 0.78)) {
            els.reelWindows[1].classList.remove("spinning");
            playReelStop(1);
            softBuzz(12);
        }

        await wait(70);
    }

    els.reelWindows[2].classList.remove("spinning");
    playReelStop(2);
    softBuzz(18);

    renderReels(finalSymbols);
}

function makeSpinFrames(finalSymbol, reelIndex) {
    const frames = [];
    const length = 14 + reelIndex * 4;

    for (let i = 0; i < length; i += 1) {
        frames.push(pick(ALL_SYMBOLS));
    }

    frames[frames.length - 1] = finalSymbol;
    frames[frames.length - 2] = pick(ALL_SYMBOLS);
    return frames;
}

function renderReels(symbols) {
    symbols.forEach((symbol, i) => renderReelAt(i, symbol));
}

function renderReelAt(index, symbol) {
    els.reels[index].textContent = symbol;
}

function renderTop() {
    els.balance.textContent = `$${state.balance}`;
    els.bonusSpins.textContent = `${state.bonusSpins}`;
    els.streak.textContent = `${state.streak}`;
    els.bonusBtn.disabled = state.bonusSpins <= 0 || state.isSpinning;
}

function renderBet() {
    els.betValue.textContent = `$${state.bet}`;
}

function renderStats() {
    els.lastWin.textContent = `$${state.lastWin}`;
    els.lastCombo.textContent = state.lastCombo.join(" ");
    els.bestCombo.textContent = state.bestCombo.join(" ");
}

function renderAll() {
    renderTop();
    renderBet();
    renderStats();
    renderReels(state.currentSymbols);
    els.soundBtn.textContent = state.sound ? "Sound" : "Muted";
    els.vibrateBtn.textContent = state.vibrate ? "Vibrate" : "Smooth";
}

function disableControls(disabled) {
    els.minusBet.disabled = disabled;
    els.plusBet.disabled = disabled;
    els.spinBtn.disabled = disabled;
    els.bonusBtn.disabled = disabled || state.bonusSpins <= 0;
}

function setStatus(text) {
    if (els.status) els.status.textContent = text;
}

function animateCoins(amount) {
    const count = Math.min(18, Math.max(6, Math.floor(amount / 20)));
    const balanceRect = els.balance.getBoundingClientRect();
    const spinRect = els.spinBtn.getBoundingClientRect();

    for (let i = 0; i < count; i += 1) {
        const coin = document.createElement("div");
        coin.className = "coin-fly";
        coin.textContent = "🪙";

        const startX = spinRect.left + spinRect.width / 2 + (Math.random() * 40 - 20);
        const startY = spinRect.top + 10 + (Math.random() * 12 - 6);
        const endX = balanceRect.left + balanceRect.width / 2 + (Math.random() * 20 - 10);
        const endY = balanceRect.top + balanceRect.height / 2;

        coin.style.left = `${startX}px`;
        coin.style.top = `${startY}px`;
        coin.style.setProperty("--tx", `${endX - startX}px`);
        coin.style.setProperty("--ty", `${endY - startY}px`);
        coin.style.animationDelay = `${i * 28}ms`;

        els.coinsLayer.appendChild(coin);

        setTimeout(() => coin.remove(), 1100 + i * 28);
    }
}

function tick() {
    playTone(720, 0.03, "square", 0.02);
}

function badBuzz() {
    if (state.vibrate && navigator.vibrate) navigator.vibrate([30, 25, 30]);
}

function softBuzz(pattern) {
    if (!state.vibrate || !navigator.vibrate) return;
    navigator.vibrate(pattern);
}

function ensureAudio() {
    if (!state.sound) return null;

    if (!state.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        state.audioCtx = new Ctx();
    }

    if (state.audioCtx.state === "suspended") {
        state.audioCtx.resume();
    }

    return state.audioCtx;
}

function playTone(freq, duration = 0.08, type = "sine", gainValue = 0.04, when = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + when;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
}

function playSpinStart() {
    playTone(240, 0.06, "square", 0.04, 0);
    playTone(320, 0.08, "square", 0.035, 0.05);
}

function playReelStop(index) {
    const freqs = [280, 340, 420];
    playTone(freqs[index] || 340, 0.05, "triangle", 0.03);
}

function playWin(amount) {
    const rich = amount >= 500;
    playTone(520, 0.08, "triangle", 0.05, 0);
    playTone(660, 0.08, "triangle", 0.05, 0.07);
    playTone(880, 0.12, "triangle", 0.06, 0.14);

    if (rich) {
        playTone(1100, 0.16, "triangle", 0.07, 0.24);
        playTone(1320, 0.18, "triangle", 0.06, 0.33);
    }

    playCoinMini();
}

function playCoinMini() {
    playTone(980, 0.05, "square", 0.03, 0);
    playTone(1240, 0.06, "square", 0.025, 0.05);
}

function playLose() {
    playTone(220, 0.07, "sawtooth", 0.03, 0);
    playTone(180, 0.1, "sawtooth", 0.025, 0.05);
}

function clearAuto() {
    if (state.autoTimer) {
        clearTimeout(state.autoTimer);
        state.autoTimer = null;
    }
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
    const clone = arr.slice();
    for (let i = clone.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

document.addEventListener("DOMContentLoaded", init);