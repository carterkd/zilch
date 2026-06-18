(function () {
  const TARGET_SCORE = 20000;
  const DIE_PIPS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };
  const scoreCache = new Map();
  const AUTO_ACTION_MS = 10000;
  const TABLE_LOG_LIMIT = 50;
  const FIREBASE_SDK_VERSION = "12.15.0";
  const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const ONLINE_DEFAULT_PLAYERS = ["Sonja", ""];
  const AI_DEFAULT_NAMES = [
    "DiceGPT",
    "Zilchbot 9000",
    "HAL 10K",
    "Bank-O-Tron",
    "Risk-E Business",
    "Roll Model T",
    "Bytey McRollface",
    "Circuit Breaker",
    "Probability Pete",
    "Lady Luck.exe",
    "The Bankinator",
    "Captain Combo",
    "Free Dice Fred",
    "Professor Pips",
    "Odds Engine",
    "Stack Overflow",
    "Botimus Prime",
    "Roll Matrix",
    "Count Zero",
    "The Zilch Whisperer",
    "Algorithm Al",
    "Data McBankface",
    "Risk Calculator",
    "Dice Dynamo",
    "Bank Holiday",
    "Pip Squeak",
    "Neural Nettie",
    "Expected Val",
    "Robo Roller",
    "The Hot Dice Kid",
    "Combo Wombo",
    "Sir Rolls-a-Lot",
    "Ada Lovelace Dice",
    "Greedy Gus",
    "Deep Blue Dice",
    "Monte Carlo",
    "The Re-Roller",
    "Loose Points Larry",
    "Fifty Point Frank",
    "Tin Can Tanner",
    "Bank Shot Betty",
    "Roll Bot Ross"
  ];
  const AI_NAME_CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const AI_DELAY_MS = {
    offer: 1200,
    roll: 950,
    optionThink: 1200,
    optionTake: 1350,
    next: 1250,
    zilch: 1400
  };
  const EV_STEP = 50;
  const EV_MAX_LOOSE = 8000;
  const EV_HORIZON = 5;
  const evRollCache = new Map();
  const evOutcomeCache = new Map();
  const factorials = Array.from({ length: 11 }, (_, index) => {
    let total = 1;
    for (let i = 2; i <= index; i += 1) total *= i;
    return total;
  });

  const state = {
    players: [],
    currentIndex: 0,
    finalRound: false,
    playedFinalTurns: {},
    inheritedScore: 0,
    inheritedFreeDice: 10,
    previousTurnPlayer: "",
    turn: null,
    gameOver: false,
    log: [],
    autoChoice: null,
    aiAction: null,
    room: {
      mode: "local",
      devicePlayers: []
    },
    online: {
      firebase: null,
      db: null,
      roomCode: "",
      deviceId: "",
      isHost: false,
      devicePlayers: [],
      roomData: null,
      unsubscribe: null,
      isApplyingRemote: false
    }
  };

  function formatScore(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function secureRandomInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("maxExclusive must be a positive integer");
    }

    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
      const range = 0x100000000;
      const limit = range - (range % maxExclusive);
      const values = new Uint32Array(1);
      do {
        cryptoApi.getRandomValues(values);
      } while (values[0] >= limit);
      return values[0] % maxExclusive;
    }

    return Math.floor(Math.random() * maxExclusive);
  }

  function rollDice(numDice) {
    return Array.from({ length: numDice }, () => secureRandomInt(6) + 1).sort((a, b) => a - b);
  }

  function countsFor(dice) {
    const counts = {};
    for (let i = 1; i <= 6; i += 1) counts[i] = dice.filter((die) => die === i).length;
    return counts;
  }

  function removeDice(source, values) {
    const remaining = source.slice();
    values.forEach((value) => {
      const index = remaining.indexOf(value);
      if (index >= 0) remaining.splice(index, 1);
    });
    return remaining;
  }

  function comboKey(combo) {
    return JSON.stringify([
      combo.points,
      combo.descriptions.slice().sort(),
      combo.usedDice.slice().sort((a, b) => a - b),
      combo.remainingDice
    ]);
  }

  function cloneCombos(combos) {
    return listValues(combos).map((combo) => ({
      points: Number(combo.points || 0),
      descriptions: listValues(combo.descriptions).map(String),
      usedDice: listValues(combo.usedDice).map(Number),
      remainingDice: listValues(combo.remainingDice).map(Number)
    }));
  }

  function scoringMoves(dice) {
    const moves = [];
    const counts = countsFor(dice);

    if ([1, 2, 3, 4, 5, 6].every((num) => counts[num] >= 1)) {
      const straight = [1, 2, 3, 4, 5, 6];
      moves.push({
        points: 1500,
        descriptions: ["1-6 (1500)"],
        usedDice: straight,
        remainingDice: removeDice(dice, straight)
      });
    }

    for (let num = 1; num <= 6; num += 1) {
      const count = counts[num];
      if (count >= 3) {
        if (num === 1) {
          for (let n = 3; n <= count; n += 1) {
            let points;
            if (n === 3) points = 1000;
            else if (n === 4) continue;
            else points = 1000 + (n - 4) * 1000;

            const scoringDice = Array(n).fill(num);
            moves.push({
              points,
              descriptions: [`${n} ${num}'s (${points})`],
              usedDice: scoringDice,
              remainingDice: removeDice(dice, scoringDice)
            });
          }
        } else {
          if (count >= 4) {
            for (let n = 4; n <= count; n += 1) {
              const points = 1000 + (n - 4) * 1000;
              const scoringDice = Array(n).fill(num);
              moves.push({
                points,
                descriptions: [`${n} ${num}'s (${points})`],
                usedDice: scoringDice,
                remainingDice: removeDice(dice, scoringDice)
              });
            }
          }

          const points = num * 100;
          const scoringDice = Array(3).fill(num);
          moves.push({
            points,
            descriptions: [`3 ${num}'s (${points})`],
            usedDice: scoringDice,
            remainingDice: removeDice(dice, scoringDice)
          });
        }
      }
    }

    [1, 5].forEach((num) => {
      if (counts[num] > 0) {
        const points = num === 1 ? 100 : 50;
        moves.push({
          points,
          descriptions: [`${num} (${points})`],
          usedDice: [num],
          remainingDice: removeDice(dice, [num])
        });
      }
    });

    return moves;
  }

  function scoreOptionsForDice(dice) {
    const sortedDice = dice.slice().sort((a, b) => a - b);
    const cacheKey = sortedDice.join(",");
    if (scoreCache.has(cacheKey)) return cloneCombos(scoreCache.get(cacheKey));

    const combinations = [];
    scoringMoves(sortedDice).forEach((move) => {
      combinations.push(move);
      scoreOptionsForDice(move.remainingDice).forEach((tail) => {
        combinations.push({
          points: move.points + tail.points,
          descriptions: move.descriptions.concat(tail.descriptions),
          usedDice: move.usedDice.concat(tail.usedDice),
          remainingDice: tail.remainingDice
        });
      });
    });

    const unique = [];
    const seen = new Set();
    combinations.forEach((combo) => {
      const key = comboKey(combo);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(combo);
      }
    });

    unique.sort((a, b) => b.points - a.points);
    scoreCache.set(cacheKey, cloneCombos(unique));
    return cloneCombos(unique);
  }

  function calculateScoreRecursive(
    dice,
    descriptions = [],
    scoringCombinations = [],
    currentScore = 0,
    usedDice = []
  ) {
    const shifted = scoreOptionsForDice(dice).map((option) => ({
      points: currentScore + option.points,
      descriptions: descriptions.concat(option.descriptions),
      usedDice: usedDice.concat(option.usedDice),
      remainingDice: option.remainingDice.slice()
    }));
    return scoringCombinations.concat(shifted).sort((a, b) => b.points - a.points);
  }

  function snapEvValue(value) {
    return Math.round(value / EV_STEP) * EV_STEP;
  }

  function diceFromCounts(counts) {
    const dice = [];
    counts.forEach((count, index) => {
      for (let i = 0; i < count; i += 1) dice.push(index + 1);
    });
    return dice;
  }

  function multinomialOutcomes(numDice) {
    const outcomes = [];
    const totalRolls = 6 ** numDice;

    function visit(remaining, slots, prefix) {
      if (slots === 1) {
        const counts = prefix.concat(remaining);
        let ways = factorials[numDice];
        counts.forEach((count) => {
          ways /= factorials[count];
        });
        outcomes.push({ counts, probability: ways / totalRolls });
        return;
      }

      for (let count = 0; count <= remaining; count += 1) {
        visit(remaining - count, slots - 1, prefix.concat(count));
      }
    }

    visit(numDice, 6, []);
    return outcomes;
  }

  function evOutcomeSummaries(freeDice) {
    if (evOutcomeCache.has(freeDice)) return evOutcomeCache.get(freeDice);
    const summaries = multinomialOutcomes(freeDice).map((outcome) => {
      const dice = diceFromCounts(outcome.counts);
      return {
        probability: outcome.probability,
        options: scoreOptionsForDice(dice).map((option) => ({
          points: option.points,
          freeDice: option.remainingDice.length
        }))
      };
    });
    evOutcomeCache.set(freeDice, summaries);
    return summaries;
  }

  function evRollValue(looseScore, freeDice, depth = EV_HORIZON) {
    const diceCount = freeDice > 0 ? freeDice : 10;
    if (looseScore > EV_MAX_LOOSE) return looseScore;
    const snappedLoose = snapEvValue(looseScore);
    const key = `${snappedLoose}:${diceCount}:${depth}`;
    if (evRollCache.has(key)) return evRollCache.get(key);
    if (depth <= 0) return snappedLoose;

    let total = 0;
    evOutcomeSummaries(diceCount).forEach((outcome) => {
      if (!outcome.options.length) return;
      let best = 0;
      outcome.options.forEach((option) => {
        const nextLoose = snappedLoose + option.points;
        let value;
        if (option.freeDice === 0) {
          value = nextLoose + evRollValue(0, 10, depth - 1);
        } else if (nextLoose > EV_MAX_LOOSE) {
          value = nextLoose;
        } else {
          value = Math.max(nextLoose, evRollValue(nextLoose, option.freeDice, depth - 1));
        }
        best = Math.max(best, value);
      });
      total += outcome.probability * best;
    });

    evRollCache.set(key, total);
    return total;
  }

  function evChooseAfterScore(looseScore, freeDice) {
    if (freeDice <= 0) {
      return {
        action: "roll",
        value: looseScore + evRollValue(0, 10),
        bankValue: looseScore,
        rollValue: looseScore + evRollValue(0, 10)
      };
    }

    const rollValue = evRollValue(looseScore, freeDice);
    return {
      action: looseScore >= rollValue ? "bank" : "roll",
      value: Math.max(looseScore, rollValue),
      bankValue: looseScore,
      rollValue
    };
  }

  function evOptionDecision(looseScore, option) {
    const nextLoose = looseScore + option.points;
    if (option.remainingDice.length === 0) {
      return {
        action: "lock and roll",
        value: nextLoose + evRollValue(0, 10),
        bankValue: nextLoose,
        rollValue: nextLoose + evRollValue(0, 10)
      };
    }

    return evChooseAfterScore(nextLoose, option.remainingDice.length);
  }

  function bestEvOption(turn) {
    let best = null;
    (turn.options || []).forEach((option, index) => {
      const decision = evOptionDecision(turn.looseScore, option);
      const candidate = { index, option, decision };
      if (
        !best ||
        decision.value > best.decision.value ||
        (decision.value === best.decision.value && option.points > best.option.points)
      ) {
        best = candidate;
      }
    });
    return best;
  }

  function parsePlayers(rawNames, fallback = ["Kent", "Sonja"]) {
    const unique = [];
    const names = Array.isArray(rawNames) ? rawNames : String(rawNames).split(/\n|,/);
    names
      .map((name) => String(name).trim())
      .filter(Boolean)
      .forEach((name) => {
        if (!unique.includes(name)) unique.push(name);
      });
    return unique.length ? unique : fallback.slice();
  }

  function normalizePlayerEntry(player, fallbackAi = false) {
    if (typeof player === "string") {
      return { name: player.trim(), score: 0, isAi: fallbackAi };
    }

    return {
      name: String(player && player.name ? player.name : "").trim(),
      score: Number(player && player.score ? player.score : 0),
      isAi: Boolean(player && player.isAi)
    };
  }

  function parsePlayerEntries(rawPlayers, fallback = [
    { name: "Kent", isAi: false },
    { name: "Sonja", isAi: false }
  ]) {
    const unique = [];
    listValues(rawPlayers).forEach((rawPlayer) => {
      const player = normalizePlayerEntry(rawPlayer);
      if (!player.name || unique.some((item) => item.name === player.name)) return;
      unique.push({ name: player.name, isAi: player.isAi });
    });
    return unique.length ? unique : fallback.map((player) => ({ ...player }));
  }

  function playerName(player) {
    return typeof player === "string" ? player : player.name;
  }

  function orderItems(items, orderedNames) {
    return orderedNames.map((name) => items.find((item) => playerName(item) === name) || name);
  }

  function hasFirebaseConfig() {
    const config = window.ZILCH_FIREBASE_CONFIG;
    return Boolean(
      config &&
        config.apiKey &&
        !String(config.apiKey).includes("YOUR_") &&
        config.databaseURL &&
        !String(config.databaseURL).includes("YOUR_") &&
        config.projectId &&
        !String(config.projectId).includes("YOUR_") &&
        config.appId &&
        !String(config.appId).includes("YOUR_")
    );
  }

  async function loadFirebase() {
    if (state.online.firebase && state.online.db) return state.online;
    if (!hasFirebaseConfig()) {
      throw new Error("Firebase config is missing. Fill in firebase-config.js first.");
    }

    const [appModule, databaseModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`)
    ]);
    const app = appModule.getApps().length
      ? appModule.getApp()
      : appModule.initializeApp(window.ZILCH_FIREBASE_CONFIG);

    state.online.firebase = databaseModule;
    state.online.db = databaseModule.getDatabase(app);
    return state.online;
  }

  function generateDeviceId() {
    try {
      const existing = window.localStorage.getItem("zilchDeviceId");
      if (existing) return existing;
      const next = `device-${secureRandomInt(0xffffffff).toString(36)}-${Date.now().toString(36)}`;
      window.localStorage.setItem("zilchDeviceId", next);
      return next;
    } catch (error) {
      return `device-${secureRandomInt(0xffffffff).toString(36)}-${Date.now().toString(36)}`;
    }
  }

  function generateRoomCode(length = 5) {
    return Array.from({ length }, () => ROOM_CODE_ALPHABET[secureRandomInt(ROOM_CODE_ALPHABET.length)]).join("");
  }

  function listValues(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null);
    if (typeof value === "object") return Object.values(value);
    return [];
  }

  function playerNames(players) {
    return parsePlayerEntries(players, []).map((player) => player.name);
  }

  function roomPlayers(roomData) {
    const devices = roomData && roomData.devices
      ? listValues(roomData.devices).sort((a, b) => Number(a.joinedAt || 0) - Number(b.joinedAt || 0))
      : [];
    const unique = [];
    devices
      .flatMap((device) => parsePlayerEntries(listValues(device.players), []))
      .forEach((player) => {
        if (!unique.some((item) => item.name === player.name)) unique.push(player);
      });
    return unique;
  }

  function roomPlayerNames(roomData) {
    return roomPlayers(roomData).map((player) => player.name);
  }

  function roomRef(roomCode = state.online.roomCode) {
    return state.online.firebase.ref(state.online.db, `rooms/${roomCode}`);
  }

  function roomDeviceRef(roomCode = state.online.roomCode, deviceId = state.online.deviceId) {
    return state.online.firebase.ref(state.online.db, `rooms/${roomCode}/devices/${deviceId}`);
  }

  function addPlayerInput(value = "", listId = "player-list", extraClass = "") {
    const list = document.getElementById(listId);
    if (!list) return;
    const input = document.createElement("input");
    input.className = ["player-name-input", extraClass].filter(Boolean).join(" ");
    input.type = "text";
    input.value = value;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", `Player ${list.children.length + 1}`);
    markDefaultNameInput(input, value);
    list.appendChild(input);
    input.focus();
  }

  function markDefaultNameInput(input, value = input.value) {
    const defaultValue = String(value || "").trim();
    if (defaultValue) {
      input.dataset.defaultName = defaultValue;
      input.dataset.userEdited = "false";
    } else {
      delete input.dataset.defaultName;
      input.dataset.userEdited = "false";
    }
  }

  function installNameInputBehavior(root = document) {
    root.querySelectorAll(".player-name-input").forEach((input) => {
      if (input.dataset.nameBehaviorReady === "true") return;
      input.dataset.nameBehaviorReady = "true";
      if (input.value.trim() && !input.dataset.defaultName) markDefaultNameInput(input);

      input.addEventListener("pointerdown", () => {
        if (
          input.dataset.defaultName &&
          input.dataset.userEdited !== "true" &&
          input.value === input.dataset.defaultName
        ) {
          input.value = "";
          input.dataset.userEdited = "true";
        }
      });

      input.addEventListener("input", () => {
        input.dataset.userEdited = "true";
      });
    });
  }

  function nextAiName(listId = "player-list") {
    const used = new Set(
      Array.from(document.querySelectorAll(`#${listId} .player-name-input`))
        .map((input) => input.value.trim())
        .filter(Boolean)
    );
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const base = AI_DEFAULT_NAMES[secureRandomInt(AI_DEFAULT_NAMES.length)];
      const code = Array.from({ length: 3 }, () => AI_NAME_CODE[secureRandomInt(AI_NAME_CODE.length)]).join("");
      const name = `${base} ${code}`;
      if (!used.has(name)) return name;
    }
    return `Zilchbot ${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  function addPlayerEntry(value = "", isAi = false, listId = "player-list", extraClass = "") {
    const list = document.getElementById(listId);
    if (!list) return;
    const entry = document.createElement("div");
    entry.className = `player-entry${isAi ? " ai" : ""}`;
    entry.dataset.kind = isAi ? "ai" : "human";

    const input = document.createElement("input");
    input.className = "player-name-input";
    if (extraClass) input.classList.add(extraClass);
    input.type = "text";
    input.value = value;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", `${isAi ? "AI" : "Player"} ${list.children.length + 1}`);
    markDefaultNameInput(input, value);

    const kind = document.createElement("span");
    kind.className = "player-kind";
    kind.textContent = isAi ? "AI" : "Human";

    entry.append(input, kind);
    list.appendChild(entry);
    installNameInputBehavior(entry);
    input.focus();
    input.select();
  }

  function addLocalPlayerEntry(value = "", isAi = false) {
    addPlayerEntry(value, isAi, "player-list");
  }

  function addOnlinePlayerEntry(value = "", isAi = false) {
    addPlayerEntry(value, isAi, "online-player-list", "online-player-name-input");
  }

  function resetOnlineDevicePlayerInputs() {
    const list = document.getElementById("online-player-list");
    const entries = Array.from(document.querySelectorAll("#online-player-list .player-entry"));
    entries.forEach((entry, index) => {
      const input = entry.querySelector(".player-name-input");
      if (index < ONLINE_DEFAULT_PLAYERS.length) {
        entry.dataset.kind = "human";
        entry.classList.remove("ai");
        const kind = entry.querySelector(".player-kind");
        if (kind) kind.textContent = "Human";
        if (input) {
          input.value = ONLINE_DEFAULT_PLAYERS[index];
          markDefaultNameInput(input, ONLINE_DEFAULT_PLAYERS[index]);
        }
        return;
      }
      entry.remove();
    });
    while (list && document.querySelectorAll("#online-player-list .player-entry").length < ONLINE_DEFAULT_PLAYERS.length) {
      addOnlinePlayerEntry(ONLINE_DEFAULT_PLAYERS[document.querySelectorAll("#online-player-list .player-entry").length], false);
    }
  }

  function getSetupPlayers() {
    const entries = Array.from(document.querySelectorAll("#player-list .player-entry")).map((entry) => ({
      name: entry.querySelector(".player-name-input") ? entry.querySelector(".player-name-input").value : "",
      isAi: entry.dataset.kind === "ai"
    }));

    if (entries.length) return parsePlayerEntries(entries);

    return parsePlayers(Array.from(document.querySelectorAll("#player-list .player-name-input")).map((input) => input.value))
      .map((name) => ({ name, isAi: false }));
  }

  function getOnlineDevicePlayers() {
    const entries = Array.from(document.querySelectorAll("#online-player-list .player-entry")).map((entry) => ({
      name: entry.querySelector(".player-name-input") ? entry.querySelector(".player-name-input").value : "",
      isAi: entry.dataset.kind === "ai"
    }));

    if (entries.length) return parsePlayerEntries(entries, []);

    return parsePlayers(Array.from(document.querySelectorAll("#online-player-list .player-name-input")).map((input) => input.value), [])
      .map((name) => ({ name, isAi: false }));
  }

  function showSetupScreen() {
    document.getElementById("mode-screen").classList.add("hidden");
    document.getElementById("setup-screen").classList.remove("hidden");
    const firstInput = document.querySelector("#player-list .player-name-input");
    if (firstInput) firstInput.focus();
  }

  function showOnlineRoomPanel(mode) {
    const panel = document.getElementById("online-room-panel");
    const title = document.getElementById("online-room-title");
    const copy = document.getElementById("online-room-copy");
    const action = document.getElementById("room-action");
    const input = document.getElementById("room-code-input");
    const hasFirebase = hasFirebaseConfig();

    resetOnlineDevicePlayerInputs();
    panel.classList.remove("hidden");
    panel.dataset.mode = mode;
    title.textContent = mode === "create" ? "Create online room" : "Join online room";
    action.textContent = mode === "create" ? "Create room" : "Join room";
    input.classList.toggle("hidden", mode === "create");
    input.value = "";
    copy.textContent = hasFirebase
      ? "Add everyone playing from this device before connecting to the room."
      : "Online sync needs your Firebase config. You can still set who is playing from this device.";
    action.disabled = !hasFirebase;
    const firstDevicePlayer = document.querySelector("#online-player-list .player-name-input");
    if (mode === "join" && hasFirebase) input.focus();
    else if (firstDevicePlayer) firstDevicePlayer.focus();
  }

  function showRoomError(message) {
    const copy = document.getElementById("online-room-copy");
    copy.textContent = message;
  }

  async function createUniqueRoomCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = generateRoomCode();
      const snapshot = await state.online.firebase.get(roomRef(code));
      if (!snapshot.exists()) return code;
    }
    throw new Error("Could not find an open room code. Try again.");
  }

  async function enterOnlineRoom(roomCode, isHost, devicePlayers) {
    if (state.online.unsubscribe) state.online.unsubscribe();
    const parsedDevicePlayers = parsePlayerEntries(devicePlayers, []);
    state.online.roomCode = roomCode;
    state.online.deviceId = state.online.deviceId || generateDeviceId();
    state.online.isHost = isHost;
    state.online.devicePlayers = parsedDevicePlayers.map((player) => player.name);
    setRoomContext("online", state.online.devicePlayers);

    state.online.unsubscribe = state.online.firebase.onValue(roomRef(roomCode), (snapshot) => {
      const roomData = snapshot.val();
      state.online.roomData = roomData;
      if (!roomData) {
        showRoomError("That room is gone. Create a new one or check the code.");
        return;
      }

      state.online.isHost = roomData.hostDeviceId === state.online.deviceId;
      if (roomData.status === "playing" || roomData.status === "finished") {
        renderRoomSnapshot({
          ...(roomData.game || {}),
          room: { devicePlayers: state.online.devicePlayers }
        });
        return;
      }

      renderRoomLobby(roomData);
    });
  }

  async function createOnlineRoom(devicePlayers) {
    await loadFirebase();
    const roomCode = await createUniqueRoomCode();
    const deviceId = generateDeviceId();
    const parsedDevicePlayers = parsePlayerEntries(devicePlayers, []);
    state.online.deviceId = deviceId;
    const now = Date.now();

    await state.online.firebase.set(roomRef(roomCode), {
      status: "lobby",
      createdAt: now,
      updatedAt: now,
      hostDeviceId: deviceId,
      devices: {
        [deviceId]: {
          players: parsedDevicePlayers,
          joinedAt: now,
          updatedAt: now
        }
      }
    });
    await enterOnlineRoom(roomCode, true, devicePlayers);
  }

  async function joinOnlineRoom(roomCode, devicePlayers) {
    await loadFirebase();
    const parsedDevicePlayers = parsePlayerEntries(devicePlayers, []);
    const cleanCode = roomCode.trim().toUpperCase();
    const snapshot = await state.online.firebase.get(roomRef(cleanCode));
    if (!snapshot.exists()) {
      throw new Error("No room found with that code.");
    }
    if (snapshot.val().status !== "lobby") {
      throw new Error("That game already started.");
    }

    const deviceId = generateDeviceId();
    const now = Date.now();
    state.online.deviceId = deviceId;
    await state.online.firebase.update(roomDeviceRef(cleanCode, deviceId), {
      players: parsedDevicePlayers,
      joinedAt: now,
      updatedAt: now
    });
    await state.online.firebase.update(roomRef(cleanCode), { updatedAt: now });
    await enterOnlineRoom(cleanCode, snapshot.val().hostDeviceId === deviceId, devicePlayers);
  }

  async function handleRoomAction() {
    const panel = document.getElementById("online-room-panel");
    const input = document.getElementById("room-code-input");
    const action = document.getElementById("room-action");
    const mode = panel.dataset.mode || "create";
    const roomCode = input.value.trim().toUpperCase();
    const devicePlayers = getOnlineDevicePlayers();

    if (!devicePlayers.length) {
      showRoomError("Add at least one player on this device.");
      const firstDevicePlayer = document.querySelector("#online-player-list .player-name-input");
      if (firstDevicePlayer) firstDevicePlayer.focus();
      return;
    }

    if (mode === "join" && !roomCode) {
      input.focus();
      return;
    }

    action.disabled = true;
    action.textContent = mode === "create" ? "Creating..." : "Joining...";
    showRoomError("Connecting to Firebase...");

    try {
      if (mode === "create") await createOnlineRoom(devicePlayers);
      else await joinOnlineRoom(roomCode, devicePlayers);
    } catch (error) {
      showRoomError(error.message || "Could not connect to the room.");
      action.disabled = !hasFirebaseConfig();
      action.textContent = mode === "create" ? "Create room" : "Join room";
    }
  }

  function rollForFirst(names) {
    return rollForFirstWithHistory(names).result;
  }

  function rollForFirstWithHistory(items) {
    const names = items.map(playerName);
    if (items.length <= 1) {
      return {
        result: { names: items, detail: "Solo table" },
        history: [{ title: "Solo table", rows: names.map((name) => ({ name, note: "first" })) }]
      };
    }

    let candidates = names.slice();
    const history = [];
    while (candidates.length > 1) {
      const rolls = {};
      candidates.forEach((name) => {
        rolls[name] = rollDice(1)[0];
      });
      const high = Math.max(...Object.values(rolls));
      history.push({
        title: candidates.length === names.length ? `Rolling for first: high roll ${high}` : `Tie roll: high roll ${high}`,
        rows: candidates.map((name) => ({
          name,
          roll: rolls[name],
          note: rolls[name] === high ? "high roll" : "out"
        }))
      });
      candidates = candidates.filter((name) => rolls[name] === high);
    }

    const first = candidates[0];
    const firstIndex = names.indexOf(first);
    const orderedNames = [first].concat(names.slice(firstIndex + 1), names.slice(0, firstIndex));
    return {
      result: {
        names: orderItems(items, orderedNames),
        detail: `${first} rolled into first.`
      },
      history: history.concat({
        title: "Order set",
        rows: orderedNames.map((name, index) => ({ name, note: index === 0 ? "first" : `${index + 1}` }))
      })
    };
  }

  function shuffleNames(items) {
    const shuffled = items.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = secureRandomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function getOrderPlan(names, orderMode) {
    const orderNames = names.map(playerName);
    if (orderMode === "roll") {
      const rolled = rollForFirstWithHistory(names);
      return {
        orderedNames: rolled.result.names,
        orderDetail: rolled.result.detail,
        steps: rolled.history
      };
    }

    if (orderMode === "shuffle") {
      const orderedNames = shuffleNames(names);
      return {
        orderedNames,
        orderDetail: "Order shuffled.",
        steps: [
          { title: "Shuffling", rows: orderNames.map((name) => ({ name, note: "in" })) },
          {
            title: "Order set",
            rows: orderedNames.map((item, index) => ({ name: playerName(item), note: index === 0 ? "first" : `${index + 1}` }))
          }
        ]
      };
    }

    return {
      orderedNames: names,
      orderDetail: "Order kept.",
      steps: [
        {
          title: "Order kept",
          rows: orderNames.map((name, index) => ({ name, note: index === 0 ? "first" : `${index + 1}` }))
        }
      ]
    };
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function renderSetupStep(step) {
    const panel = document.getElementById("setup-animation");
    const title = document.getElementById("setup-animation-title");
    const stage = document.getElementById("setup-animation-stage");

    panel.classList.remove("hidden");
    title.textContent = step.title;
    stage.innerHTML = "";
    step.rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "order-step";

      const player = document.createElement("div");
      player.className = "order-player";
      const name = document.createElement("span");
      name.textContent = row.name;
      const note = document.createElement("small");
      note.textContent = row.roll ? row.note : row.note;
      player.append(name, note);

      const result = document.createElement("div");
      result.className = "order-result";
      if (row.roll) {
        const label = document.createElement("span");
        label.className = "order-roll-label";
        label.textContent = "rolled";
        const die = document.createElement("b");
        die.className = "order-roll";
        die.setAttribute("aria-label", `${row.name} rolled ${row.roll}`);
        DIE_PIPS[row.roll].forEach((position) => {
          const pip = document.createElement("span");
          pip.className = `pip p${position}${row.roll === 1 || row.roll === 5 ? " red" : ""}`;
          die.appendChild(pip);
        });
        result.append(label, die);
      } else {
        const label = document.createElement("small");
        label.textContent = row.note;
        result.appendChild(label);
      }

      item.append(player, result);
      stage.appendChild(item);
    });
  }

  async function playSetupAnimation(steps) {
    for (const step of steps) {
      renderSetupStep(step);
      const hasRolls = step.rows.some((row) => row.roll);
      await delay(hasRolls ? 1650 : 1350);
    }
  }

  function addLog(message) {
    state.log.unshift(message);
    state.log = state.log.slice(0, TABLE_LOG_LIMIT);
  }

  function currentPlayer() {
    return state.players[state.currentIndex];
  }

  function isAiPlayer(player) {
    return Boolean(player && player.isAi);
  }

  function isCurrentTurnAi() {
    return isAiPlayer(currentPlayer());
  }

  function isRoomMode() {
    return state.room && state.room.mode === "online";
  }

  function isPlayerOnThisDevice(playerName) {
    return !isRoomMode() || state.room.devicePlayers.includes(playerName);
  }

  function isCurrentTurnLocal() {
    const player = currentPlayer();
    return Boolean(player && isPlayerOnThisDevice(player.name));
  }

  function isCurrentTurnHumanLocal() {
    return isCurrentTurnLocal() && !isCurrentTurnAi();
  }

  function setRoomContext(mode, devicePlayers) {
    state.room = {
      mode,
      devicePlayers: mode === "online" ? parsePlayers(devicePlayers, []) : []
    };
  }

  function allFinalTurnsPlayed() {
    return state.players.length > 0 && state.players.every((player) => state.playedFinalTurns[player.name]);
  }

  function startGameFromOrder(orderedNames, orderDetail, roomContext = { mode: "local", devicePlayers: [] }) {
    state.players = orderedNames.map((player) => {
      const normalized = normalizePlayerEntry(player);
      return { name: normalized.name, score: 0, isAi: normalized.isAi };
    });
    state.currentIndex = 0;
    state.finalRound = false;
    state.playedFinalTurns = Object.fromEntries(state.players.map((player) => [player.name, false]));
    state.inheritedScore = 0;
    state.inheritedFreeDice = 10;
    state.previousTurnPlayer = "";
    state.turn = null;
    state.gameOver = false;
    state.log = [];
    setRoomContext(roomContext.mode || "local", roomContext.devicePlayers || []);
    clearAutoChoiceTimer();
    clearAiActionTimer();
    addLog(orderDetail);

    document.getElementById("setup-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    prepareNextTurn();
  }

  function normalizeSnapshotPlayers(players) {
    const rawPlayers = listValues(players);
    if (!rawPlayers.length) {
      return parsePlayers([]).map((name) => ({ name, score: 0, isAi: false }));
    }

    return rawPlayers
      .map((player) => {
        if (typeof player === "string") return { name: player.trim(), score: 0, isAi: false };
        return {
          name: String(player.name || "").trim(),
          score: Number(player.score || 0),
          isAi: Boolean(player.isAi)
        };
      })
      .filter((player) => player.name);
  }

  function renderRoomSnapshot(snapshot) {
    const next = snapshot || {};
    const players = normalizeSnapshotPlayers(next.players);
    const currentIndex = Number.isInteger(next.currentIndex) ? next.currentIndex : 0;
    const turn = next.turn || {};
    const dice = listValues(turn.dice).map(Number);
    const phase = turn.phase || "await-roll";
    const incomingSelectedOptionIndex = Number.isInteger(turn.selectedOptionIndex) ? turn.selectedOptionIndex : null;
    const selectedOptionIndex =
      state.turn &&
      state.turn.rollId === Number(turn.rollId || 0) &&
      state.turn.phase === phase &&
      Number.isInteger(state.turn.selectedOptionIndex) &&
      incomingSelectedOptionIndex === null
        ? state.turn.selectedOptionIndex
        : incomingSelectedOptionIndex;
    const options = Array.isArray(turn.options)
      ? cloneCombos(turn.options)
      : phase === "choose-option"
        ? calculateScoreRecursive(dice)
        : [];

    state.players = players;
    state.currentIndex = Math.min(Math.max(currentIndex, 0), players.length - 1);
    state.finalRound = Boolean(next.finalRound);
    state.playedFinalTurns = next.playedFinalTurns || Object.fromEntries(players.map((player) => [player.name, false]));
    state.inheritedScore = Number(next.inheritedScore || 0);
    state.inheritedFreeDice = Number(next.inheritedFreeDice || 10);
    state.previousTurnPlayer = String(next.previousTurnPlayer || "");
    state.gameOver = Boolean(next.gameOver);
    state.log = listValues(next.log).map(String).slice(0, TABLE_LOG_LIMIT);
    setRoomContext("online", next.room && next.room.devicePlayers ? next.room.devicePlayers : []);
    state.turn = {
      playerName: turn.playerName || players[state.currentIndex].name,
      inheritedScore: Number(turn.inheritedScore || 0),
      lockedPoints: Number(turn.lockedPoints || 0),
      looseScore: Number(turn.looseScore || 0),
      freeDice: Number(turn.freeDice || 10),
      dice,
      options,
      selectedOptionIndex,
      aiExplanation:
        state.turn &&
        state.turn.rollId === Number(turn.rollId || 0) &&
        state.turn.phase === phase &&
        state.turn.aiExplanation &&
        !turn.aiExplanation
          ? state.turn.aiExplanation
          : String(turn.aiExplanation || ""),
      phase,
      rollId: Number(turn.rollId || 0)
    };

    clearAutoChoiceTimer();
    showOnlyScreen("game-screen");
    state.online.isApplyingRemote = true;
    render();
    state.online.isApplyingRemote = false;
  }

  function showOnlyScreen(screenId) {
    ["mode-screen", "setup-screen", "room-screen", "game-screen"].forEach((id) => {
      document.getElementById(id).classList.toggle("hidden", id !== screenId);
    });
  }

  function renderRoomLobby(roomData) {
    const players = roomPlayers(roomData);
    const playerList = document.getElementById("room-player-list");
    const note = document.getElementById("room-lobby-note");
    const startButtons = Array.from(document.querySelectorAll("[data-room-order]"));

    showOnlyScreen("room-screen");
    document.getElementById("room-code-display").textContent = state.online.roomCode || "-----";
    playerList.innerHTML = "";

    players.forEach((player) => {
      const chip = document.createElement("div");
      chip.className = "room-player-chip";
      if (player.isAi) chip.classList.add("ai");
      const label = document.createElement("span");
      label.textContent = player.name;
      chip.appendChild(label);
      if (player.isAi) {
        const ai = document.createElement("small");
        ai.textContent = "AI bot";
        chip.appendChild(ai);
      }
      if (state.online.devicePlayers.includes(player.name)) {
        chip.classList.add("local");
        const local = document.createElement("small");
        local.textContent = "This device";
        chip.appendChild(local);
      }
      playerList.appendChild(chip);
    });

    if (!players.length) {
      const empty = document.createElement("div");
      empty.className = "room-player-chip";
      empty.textContent = "No players yet";
      playerList.appendChild(empty);
    }

    note.textContent = state.online.isHost
      ? "You are hosting. Start when everyone is listed."
      : "Waiting for the host to start the game.";
    startButtons.forEach((button) => {
      button.disabled = !state.online.isHost || players.length < 1;
    });
  }

  function createInitialGameSnapshot(orderedNames, orderDetail) {
    const players = orderedNames.map((player) => {
      const normalized = normalizePlayerEntry(player);
      return { name: normalized.name, score: 0, isAi: normalized.isAi };
    });
    const first = players[0];
    return {
      players,
      currentIndex: 0,
      finalRound: false,
      playedFinalTurns: Object.fromEntries(players.map((player) => [player.name, false])),
      inheritedScore: 0,
      inheritedFreeDice: 10,
      previousTurnPlayer: "",
      gameOver: false,
      log: [`${first.name} starts fresh.`, orderDetail],
      turn: {
        playerName: first.name,
        inheritedScore: 0,
        lockedPoints: 0,
        looseScore: 0,
        freeDice: 10,
        dice: [],
        options: [],
        selectedOptionIndex: null,
        aiExplanation: "",
        phase: "await-roll",
        rollId: 0
      }
    };
  }

  async function startOnlineGame(orderMode) {
    if (!state.online.roomCode || !state.online.deviceId) return;
    await loadFirebase();
    const snapshot = await state.online.firebase.get(roomRef());
    const roomData = snapshot.val();
    if (!roomData || roomData.hostDeviceId !== state.online.deviceId) return;
    const players = roomPlayers(roomData);
    if (!players.length) return;
    const plan = getOrderPlan(players, orderMode);
    const game = createInitialGameSnapshot(plan.orderedNames, plan.orderDetail);
    await state.online.firebase.update(roomRef(), {
      status: "playing",
      updatedAt: Date.now(),
      game
    });
  }

  function currentGameSnapshot() {
    return {
      players: state.players.map((player) => ({ name: player.name, score: player.score, isAi: player.isAi })),
      currentIndex: state.currentIndex,
      finalRound: state.finalRound,
      playedFinalTurns: { ...state.playedFinalTurns },
      inheritedScore: state.inheritedScore,
      inheritedFreeDice: state.inheritedFreeDice,
      previousTurnPlayer: state.previousTurnPlayer,
      gameOver: state.gameOver,
      log: state.log.slice(0, TABLE_LOG_LIMIT),
      turn: state.turn
        ? {
            playerName: state.turn.playerName,
            inheritedScore: state.turn.inheritedScore,
            lockedPoints: state.turn.lockedPoints,
            looseScore: state.turn.looseScore,
            freeDice: state.turn.freeDice,
            dice: state.turn.dice.slice(),
            options: cloneCombos(state.turn.options || []),
            selectedOptionIndex: state.turn.selectedOptionIndex,
            aiExplanation: state.turn.aiExplanation || "",
            phase: state.turn.phase,
            rollId: state.turn.rollId || 0
          }
        : null
    };
  }

  function syncOnlineGameState() {
    if (!isRoomMode() || !state.online.roomCode || state.online.isApplyingRemote) return;
    if (!state.online.firebase || !state.online.db || !state.turn) return;
    state.online.firebase
      .update(roomRef(), {
        status: state.gameOver ? "finished" : "playing",
        updatedAt: Date.now(),
        game: currentGameSnapshot()
      })
      .catch((error) => {
        addLog(`Room sync failed: ${error.message || error}`);
        renderLog();
      });
  }

  function renderAndSync() {
    render();
    syncOnlineGameState();
  }

  async function startGame(names, orderMode) {
    const plan = getOrderPlan(names, orderMode);
    await playSetupAnimation(plan.steps);
    startGameFromOrder(plan.orderedNames, plan.orderDetail);
  }

  function prepareNextTurn() {
    const player = currentPlayer();
    const hasInheritedOffer = state.inheritedScore > 0;
    clearAiActionTimer();
    state.turn = {
      playerName: player.name,
      inheritedScore: hasInheritedOffer ? state.inheritedScore : 0,
      lockedPoints: 0,
      looseScore: 0,
      freeDice: 10,
      dice: [],
      options: [],
      selectedOptionIndex: null,
      aiExplanation: "",
      phase: hasInheritedOffer ? "offer" : "await-roll"
    };

    if (state.turn.phase === "await-roll") {
      addLog(`${player.name} starts fresh.`);
    }
    renderAndSync();
  }

  function acceptInheritedTurn(build) {
    const turn = state.turn;
    if (!turn || turn.phase !== "offer") return;
    if (!isCurrentTurnLocal()) return;

    if (build) {
      turn.looseScore = state.inheritedScore;
      turn.freeDice = state.inheritedFreeDice;
      addLog(`${turn.playerName} builds on ${formatScore(state.inheritedScore)}.`);
    } else {
      turn.inheritedScore = 0;
      turn.freeDice = 10;
      addLog(`${turn.playerName} rolls all 10.`);
    }
    turn.phase = "await-roll";
    renderAndSync();
  }

  function rollForTurn() {
    const turn = state.turn;
    if (!turn || !["await-roll", "choose-next"].includes(turn.phase)) return;
    if (!isCurrentTurnLocal()) return;
    clearAutoChoiceTimer();

    turn.dice = rollDice(turn.freeDice);
    turn.options = calculateScoreRecursive(turn.dice);
    turn.selectedOptionIndex = null;
    turn.aiExplanation = "";
    turn.rollId = (turn.rollId || 0) + 1;

    if (turn.options.length === 0) {
      turn.phase = "zilch";
      addLog(`${turn.playerName} rolled ${turn.dice.join(", ")} and zilched.`);
      renderAndSync();
      return;
    }

    turn.phase = "choose-option";
    addLog(`${turn.playerName} rolled ${turn.dice.join(", ")}.`);
    renderAndSync();
  }

  function selectOption(index) {
    const turn = state.turn;
    if (!turn || turn.phase !== "choose-option") return;
    if (!isCurrentTurnLocal()) return;
    const option = turn.options[index];
    if (!option) return;
    clearAutoChoiceTimer();

    turn.selectedOptionIndex = index;
    turn.looseScore += option.points;
    turn.freeDice = option.remainingDice.length;
    const optionDetail = option.descriptions.length ? ` (${option.descriptions.join(" + ")})` : "";
    turn.dice = [];
    turn.options = [];
    turn.aiExplanation = "";

    if (turn.freeDice === 0) {
      turn.lockedPoints += turn.looseScore;
      addLog(`${turn.playerName} locked ${formatScore(turn.lockedPoints)} and reloads all dice.`);
      turn.inheritedScore = 0;
      turn.looseScore = 0;
      turn.freeDice = 10;
      turn.phase = "await-roll";
    } else {
      turn.phase = "choose-next";
      addLog(`${turn.playerName} scores ${formatScore(option.points)}${optionDetail}, leaving ${turn.freeDice} free dice.`);
    }
    renderAndSync();
  }

  function finishTurn(zilched) {
    const turn = state.turn;
    if (!turn) return;
    if (!isCurrentTurnLocal()) return;
    clearAutoChoiceTimer();
    const player = currentPlayer();
    const earned = zilched ? turn.lockedPoints : turn.lockedPoints + turn.looseScore;

    player.score += earned;
    if (zilched) {
      state.inheritedScore = 0;
      state.inheritedFreeDice = 10;
      state.previousTurnPlayer = "";
      addLog(`${player.name} zilched and kept ${formatScore(earned)} locked.`);
    } else {
      state.inheritedScore = earned;
      state.inheritedFreeDice = turn.freeDice;
      state.previousTurnPlayer = player.name;
      addLog(`${player.name} banks ${formatScore(earned)} with ${turn.freeDice} free dice.`);
    }

    if (!state.finalRound && player.score >= TARGET_SCORE) {
      state.finalRound = true;
      addLog(`${player.name} starts the final round.`);
    }

    if (state.finalRound) {
      state.playedFinalTurns[player.name] = true;
    }

    if (state.finalRound && allFinalTurnsPlayed()) {
      endGame();
      return;
    }

    advancePlayer();
  }

  function advancePlayer() {
    if (state.gameOver) return;
    do {
      state.currentIndex = (state.currentIndex + 1) % state.players.length;
    } while (state.finalRound && state.playedFinalTurns[currentPlayer().name]);
    prepareNextTurn();
  }

  function clearAutoChoiceTimer() {
    if (!state.autoChoice) return;
    clearTimeout(state.autoChoice.timeoutId);
    clearInterval(state.autoChoice.intervalId);
    state.autoChoice = null;
  }

  function clearAiActionTimer() {
    if (!state.aiAction) return;
    clearTimeout(state.aiAction.timeoutId);
    state.aiAction = null;
  }

  function startAiActionTimer(key, delayMs, action) {
    if (state.aiAction && state.aiAction.key === key) return;
    clearAiActionTimer();
    state.aiAction = {
      key,
      timeoutId: setTimeout(() => {
        state.aiAction = null;
        action();
      }, delayMs)
    };
  }

  function aiTurnView() {
    const turn = state.turn || {};
    return {
      player: currentPlayer(),
      scores: state.players.map((player) => player.score),
      inheritedScore: state.inheritedScore,
      inheritedFreeDice: state.inheritedFreeDice,
      lockedPoints: Number(turn.lockedPoints || 0),
      looseScore: Number(turn.looseScore || 0),
      freeDice: Number(turn.freeDice || 10),
      finalRound: state.finalRound
    };
  }

  function aiShouldBuild() {
    const buildValue = evRollValue(state.inheritedScore, state.inheritedFreeDice);
    const freshValue = evRollValue(0, 10);
    return {
      build: state.inheritedScore > 0 && buildValue > freshValue,
      buildValue,
      freshValue
    };
  }

  function aiShouldBank() {
    const view = aiTurnView();
    const earned = view.lockedPoints + view.looseScore;
    const totalIfBank = view.player.score + earned;
    const otherBest = Math.max(0, ...state.players.filter((player) => player !== view.player).map((player) => player.score));

    if (view.finalRound && totalIfBank > otherBest) {
      return {
        bank: true,
        reason: `banking passes the leader at ${formatScore(totalIfBank)}`
      };
    }

    if (!view.finalRound && totalIfBank >= TARGET_SCORE) {
      return {
        bank: true,
        reason: `banking reaches the ${formatScore(TARGET_SCORE)} target`
      };
    }

    if (view.finalRound && totalIfBank <= otherBest) {
      return {
        bank: false,
        reason: `banking would still trail ${formatScore(otherBest)}`
      };
    }

    const decision = evChooseAfterScore(view.looseScore, view.freeDice);
    return {
      bank: decision.action === "bank",
      reason: `EV bank ${formatScore(decision.bankValue)} vs roll ${formatScore(Math.round(decision.rollValue))}`
    };
  }

  function describeOptionChoice(choice) {
    const option = choice.option;
    const decision = choice.decision;
    const used = option.usedDice.slice().sort((a, b) => a - b).join(", ");
    const detail = option.descriptions.join(" + ");
    return `${state.turn.playerName} chooses ${formatScore(option.points)} with [${used}]${detail ? `: ${detail}` : ""}. ` +
      `It leaves ${option.remainingDice.length} free dice; EV says ${decision.action} ` +
      `(${formatScore(Math.round(decision.value))} value).`;
  }

  function maybeScheduleAiAction() {
    const turn = state.turn;
    if (!turn || state.gameOver || !isCurrentTurnAi() || !isCurrentTurnLocal()) {
      clearAiActionTimer();
      return;
    }

    if (turn.phase === "offer") {
      const key = `ai:offer:${state.currentIndex}:${state.inheritedScore}:${state.inheritedFreeDice}`;
      startAiActionTimer(key, AI_DELAY_MS.offer, () => {
        const decision = aiShouldBuild();
        addLog(
          `${turn.playerName} compares build ${formatScore(Math.round(decision.buildValue))} EV vs fresh ` +
            `${formatScore(Math.round(decision.freshValue))} EV, then ${decision.build ? "builds" : "starts fresh"}.`
        );
        acceptInheritedTurn(decision.build);
      });
      return;
    }

    if (turn.phase === "await-roll") {
      const key = `ai:roll:${state.currentIndex}:${turn.freeDice}:${turn.lockedPoints}:${turn.looseScore}:${turn.rollId || 0}`;
      startAiActionTimer(key, AI_DELAY_MS.roll, () => {
        addLog(`${turn.playerName} rolls ${turn.freeDice} dice.`);
        rollForTurn();
      });
      return;
    }

    if (turn.phase === "choose-option") {
      const rollId = turn.rollId || 0;
      if (Number.isInteger(turn.selectedOptionIndex)) {
        return;
      }

      const key = `ai:choose-option:${state.currentIndex}:${rollId}`;
      startAiActionTimer(key, AI_DELAY_MS.optionThink, () => {
        const choice = bestEvOption(turn);
        if (!choice) return;
        turn.selectedOptionIndex = choice.index;
        turn.aiExplanation = describeOptionChoice(choice);
        addLog(turn.aiExplanation);
        renderAndSync();
        startAiActionTimer(`ai:take-option:${state.currentIndex}:${rollId}:${choice.index}`, AI_DELAY_MS.optionTake, () => {
          selectOption(choice.index);
        });
      });
      return;
    }

    if (turn.phase === "choose-next") {
      const decision = aiShouldBank();
      const key = `ai:next:${state.currentIndex}:${turn.freeDice}:${turn.lockedPoints}:${turn.looseScore}:${turn.rollId || 0}`;
      turn.aiExplanation = `${turn.playerName} is deciding whether to bank or roll: ${decision.reason}.`;
      startAiActionTimer(key, AI_DELAY_MS.next, () => {
        addLog(`${turn.playerName} ${decision.bank ? "banks" : "keeps rolling"} because ${decision.reason}.`);
        if (decision.bank) finishTurn(false);
        else rollForTurn();
      });
      return;
    }

    if (turn.phase === "zilch") {
      const key = `ai:zilch:${state.currentIndex}:${turn.rollId || 0}`;
      startAiActionTimer(key, AI_DELAY_MS.zilch, () => finishTurn(true));
      return;
    }

    clearAiActionTimer();
  }

  function updateAutoChoiceCountdown() {
    if (!state.autoChoice) return;
    const badges = document.querySelectorAll(".auto-countdown");
    const seconds = Math.max(0, Math.ceil((state.autoChoice.deadline - Date.now()) / 1000));
    badges.forEach((badge) => {
      badge.textContent = `${state.autoChoice.label} ${seconds}`;
    });
  }

  function startAutoActionTimer(key, label, action) {
    if (state.autoChoice && state.autoChoice.key === key) {
      updateAutoChoiceCountdown();
      return;
    }
    clearAutoChoiceTimer();
    const deadline = Date.now() + AUTO_ACTION_MS;
    state.autoChoice = {
      key,
      label,
      deadline,
      intervalId: setInterval(updateAutoChoiceCountdown, 250),
      timeoutId: setTimeout(action, AUTO_ACTION_MS)
    };
    updateAutoChoiceCountdown();
  }

  function appendCountdown(target, initialText) {
    const countdown = document.createElement("span");
    countdown.className = "auto-countdown";
    countdown.textContent = initialText;
    target.appendChild(countdown);
  }

  function setButtonContents(button, label, countdownText = "") {
    button.innerHTML = "";
    const text = document.createElement("span");
    text.textContent = label;
    button.appendChild(text);
    if (countdownText) {
      button.appendChild(document.createTextNode(" "));
      appendCountdown(button, countdownText);
    }
  }

  function endGame() {
    state.gameOver = true;
    const highScore = Math.max(...state.players.map((player) => player.score));
    const winners = state.players.filter((player) => player.score === highScore).map((player) => player.name);
    addLog(`${winners.join(" and ")} wins with ${formatScore(highScore)}.`);
    state.turn = {
      playerName: winners.join(" and "),
      inheritedScore: 0,
      lockedPoints: 0,
      looseScore: 0,
      freeDice: 0,
      dice: [],
      options: [],
      selectedOptionIndex: null,
      phase: "game-over"
    };
    renderAndSync();
  }

  function createDie(value, small = false) {
    const die = document.createElement("span");
    die.className = small ? "mini-die" : "die";
    die.setAttribute("aria-label", `${value}`);

    if (small) {
      die.textContent = value;
      return die;
    }

    DIE_PIPS[value].forEach((position) => {
      const pip = document.createElement("span");
      pip.className = `pip p${position}${value === 1 || value === 5 ? " red" : ""}`;
      die.appendChild(pip);
    });
    return die;
  }

  function renderDice(values) {
    const diceRow = document.getElementById("dice-row");
    diceRow.innerHTML = "";
    if (!values.length) {
      const placeholder = document.createElement("p");
      placeholder.className = "eyebrow";
      placeholder.textContent =
        state.turn && ["await-roll", "choose-next"].includes(state.turn.phase)
          ? `${state.turn.freeDice} dice ready`
          : "No dice";
      diceRow.appendChild(placeholder);
      return;
    }
    values.forEach((value) => diceRow.appendChild(createDie(value)));
  }

  function remoteTurnSummary(turn) {
    if (!turn) return "";
    if (turn.aiExplanation) return turn.aiExplanation;
    if (turn.phase === "offer") {
      return `${turn.playerName} is choosing whether to build on ${formatScore(state.inheritedScore)} or roll all 10.`;
    }
    if (turn.phase === "await-roll") {
      return `${turn.playerName} has ${turn.freeDice} dice ready.`;
    }
    if (turn.phase === "choose-option") {
      return `${turn.playerName} rolled ${turn.dice.join(", ")} and is choosing a score.`;
    }
    if (turn.phase === "choose-next") {
      return `${turn.playerName} has ${formatScore(turn.looseScore)} loose with ${turn.freeDice} dice free.`;
    }
    if (turn.phase === "zilch") {
      return `${turn.playerName} rolled ${turn.dice.join(", ")} and zilched.`;
    }
    return "";
  }

  function renderRemoteTurnPanel() {
    const panel = document.getElementById("remote-turn-panel");
    const label = document.getElementById("remote-turn-label");
    const title = document.getElementById("remote-turn-title");
    const copy = document.getElementById("remote-turn-copy");
    const dice = document.getElementById("remote-turn-dice");
    const turn = state.turn;
    const isAiTurn = Boolean(turn && isCurrentTurnAi() && !state.gameOver);
    const isRemoteTurn = Boolean(turn && isRoomMode() && !isCurrentTurnLocal() && !state.gameOver);
    const shouldShow = isRemoteTurn || isAiTurn;

    panel.classList.toggle("hidden", !shouldShow);
    if (!shouldShow) return;

    panel.classList.toggle("zilch", turn.phase === "zilch");
    label.textContent = isAiTurn ? "AI bot thinking" : "Waiting on another device";
    title.textContent = `${turn.playerName}'s move`;
    copy.textContent = remoteTurnSummary(turn);
    dice.innerHTML = "";

    if (turn.dice.length) {
      turn.dice.forEach((value) => dice.appendChild(createDie(value, true)));
      return;
    }

    const waiting = document.createElement("span");
    waiting.className = "remote-waiting";
    waiting.textContent = `${turn.freeDice} dice ready`;
    dice.appendChild(waiting);
  }

  function renderScores() {
    const scoreStrip = document.getElementById("score-strip");
    scoreStrip.innerHTML = "";
    state.players.forEach((player, index) => {
      const card = document.createElement("article");
      card.className = "score-card";
      if (index === state.currentIndex && !state.gameOver) card.classList.add("active");
      if (player.isAi) card.classList.add("ai-player");
      if (isRoomMode() && isPlayerOnThisDevice(player.name)) card.classList.add("on-this-device");
      if (state.finalRound && state.playedFinalTurns[player.name]) card.classList.add("final-done");
      const name = document.createElement("span");
      name.textContent = player.name;
      const score = document.createElement("strong");
      score.textContent = formatScore(player.score);
      card.append(name, score);
      if (player.isAi) {
        const badge = document.createElement("small");
        badge.textContent = "AI bot";
        card.appendChild(badge);
      }
      if (isRoomMode() && isPlayerOnThisDevice(player.name)) {
        const badge = document.createElement("small");
        badge.textContent = "This device";
        card.appendChild(badge);
      }
      scoreStrip.appendChild(card);
    });
  }

  function renderOptions() {
    const panel = document.getElementById("options-panel");
    panel.innerHTML = "";
    const turn = state.turn;
    if (!turn || turn.phase !== "choose-option") return;
    const localTurn = isCurrentTurnHumanLocal();

    turn.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-card";
      if (turn.selectedOptionIndex === index) {
        button.classList.add(isCurrentTurnAi() ? "ai-choice" : "selected");
      }
      button.disabled = !localTurn;
      if (!localTurn) button.classList.add("remote-option");
      button.addEventListener("click", () => selectOption(index));

      const head = document.createElement("div");
      head.className = "option-head";
      head.innerHTML = `<strong>${formatScore(option.points)}</strong><span>${option.remainingDice.length} free</span>`;
      button.appendChild(head);

      const dice = document.createElement("div");
      dice.className = "mini-dice";
      option.usedDice.slice().sort((a, b) => a - b).forEach((value) => dice.appendChild(createDie(value, true)));
      button.appendChild(dice);

      const meta = document.createElement("div");
      meta.className = "option-meta";
      meta.textContent = option.descriptions.join(" + ");
      button.appendChild(meta);

      if (localTurn && turn.options.length === 1) {
        appendCountdown(button, "Auto picks in 10");
      }
      panel.appendChild(button);
    });

    if (localTurn && turn.options.length === 1) {
      const rollId = turn.rollId || 0;
      startAutoActionTimer(`score:${rollId}`, "Auto picks in", () => {
        const activeTurn = state.turn;
        if (activeTurn && activeTurn.phase === "choose-option" && activeTurn.options.length === 1 && activeTurn.rollId === rollId) {
          selectOption(0);
        }
      });
    } else if (localTurn) {
      clearAutoChoiceTimer();
    }
  }

  function renderLog() {
    const log = document.getElementById("game-log");
    log.innerHTML = "";
    state.log.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry;
      log.appendChild(item);
    });
  }

  function renderTurnControls() {
    const turn = state.turn;
    const offerPanel = document.getElementById("offer-panel");
    const rollButton = document.getElementById("roll-dice");
    const bankButton = document.getElementById("bank-turn");
    const rollPanel = document.getElementById("roll-panel");
    const rollMessage = document.getElementById("roll-message");
    const localTurn = isCurrentTurnHumanLocal();

    offerPanel.classList.toggle("hidden", !turn || turn.phase !== "offer" || !localTurn);
    rollPanel.classList.toggle("hidden", !turn || turn.phase === "offer" || turn.phase === "game-over");

    if (turn && turn.phase === "offer") {
      document.getElementById("offer-text").textContent =
        `${state.previousTurnPlayer} left ${formatScore(state.inheritedScore)} and ${state.inheritedFreeDice} free dice.`;
      document.getElementById("build-turn").textContent = `Build with ${state.inheritedFreeDice}`;
    }

    rollMessage.classList.toggle("hidden", !turn || turn.phase !== "zilch");
    rollMessage.classList.toggle("zilch", Boolean(turn && turn.phase === "zilch"));
    rollMessage.textContent = turn && turn.phase === "zilch" ? "Zilch!" : "";

    rollButton.disabled = !turn || !localTurn || !["await-roll", "choose-next"].includes(turn.phase);
    bankButton.disabled = !turn || !localTurn || !["choose-next", "zilch"].includes(turn.phase);

    const rollText = turn && turn.freeDice > 0 ? `Roll ${turn.freeDice}` : "Roll";
    const bankText = turn && turn.phase === "zilch" ? "Accept Zilch" : "Bank";
    setButtonContents(rollButton, rollText);
    setButtonContents(bankButton, bankText);

    if (!turn) {
      clearAutoChoiceTimer();
      return;
    }

    if (!localTurn) {
      setButtonContents(rollButton, "Waiting");
      setButtonContents(bankButton, "Watching");
      clearAutoChoiceTimer();
      return;
    }

    if (turn.phase === "await-roll") {
      const key = `roll:${state.currentIndex}:${turn.freeDice}:${turn.lockedPoints}:${turn.looseScore}:${turn.rollId || 0}`;
      setButtonContents(rollButton, rollText, "Auto rolls in 10");
      startAutoActionTimer(key, "Auto rolls in", () => {
        const activeTurn = state.turn;
        if (activeTurn && activeTurn.phase === "await-roll") rollForTurn();
      });
    } else if (turn.phase === "zilch") {
      const key = `zilch:${state.currentIndex}:${turn.rollId || 0}`;
      setButtonContents(bankButton, bankText, "Auto accepts in 10");
      startAutoActionTimer(key, "Auto accepts in", () => {
        const activeTurn = state.turn;
        if (activeTurn && activeTurn.phase === "zilch") finishTurn(true);
      });
    } else if (turn.phase !== "choose-option") {
      clearAutoChoiceTimer();
    }
  }

  function renderGameOver() {
    if (!state.gameOver) return;
    const panel = document.getElementById("options-panel");
    const highScore = Math.max(...state.players.map((player) => player.score));
    const winners = state.players.filter((player) => player.score === highScore).map((player) => player.name);
    panel.innerHTML = "";
    const winnerPanel = document.createElement("div");
    winnerPanel.className = "winner-panel";
    const title = document.createElement("h2");
    title.textContent = `${winners.join(" and ")} wins`;
    const score = document.createElement("p");
    score.textContent = `${formatScore(highScore)} points`;
    const playAgain = document.createElement("button");
    playAgain.type = "button";
    playAgain.className = "primary-action";
    playAgain.textContent = "Play again";
    playAgain.addEventListener("click", () => {
      window.location.reload();
    });
    winnerPanel.append(title, score, playAgain);
    panel.appendChild(winnerPanel);
  }

  function render() {
    const turn = state.turn;
    const player = currentPlayer();
    const leader = state.players.reduce((best, contender) => (contender.score > best.score ? contender : best), state.players[0]);
    const leaderPercent = Math.min(100, Math.round((leader.score / TARGET_SCORE) * 100));

    document.getElementById("round-label").textContent = state.finalRound ? "Final round" : "Round";
    document.getElementById("turn-title").textContent = state.gameOver ? "Game over" : `${player.name}'s turn`;
    document.getElementById("target-label").textContent = `${formatScore(TARGET_SCORE)} target`;
    document.getElementById("leader-meter").style.width = `${leaderPercent}%`;

    document.getElementById("stat-inherited").textContent = formatScore(turn ? turn.inheritedScore : 0);
    document.getElementById("stat-locked").textContent = formatScore(turn ? turn.lockedPoints : 0);
    document.getElementById("stat-loose").textContent = formatScore(turn ? turn.looseScore : 0);
    document.getElementById("stat-free-dice").textContent = turn ? turn.freeDice : 0;
    document.getElementById("stat-safe-total").textContent = formatScore(turn ? player.score + turn.lockedPoints : 0);
    document.getElementById("stat-bank-total").textContent = formatScore(
      turn ? player.score + turn.lockedPoints + turn.looseScore : 0
    );

    renderScores();
    renderDice(turn ? turn.dice : []);
    renderRemoteTurnPanel();
    renderOptions();
    renderTurnControls();
    renderGameOver();
    renderLog();
    maybeScheduleAiAction();
  }

  function bindEvents() {
    document.getElementById("local-mode").addEventListener("click", showSetupScreen);
    document.getElementById("create-room-mode").addEventListener("click", () => showOnlineRoomPanel("create"));
    document.getElementById("join-room-mode").addEventListener("click", () => showOnlineRoomPanel("join"));

    document.getElementById("setup-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const orderMode = submitter ? submitter.dataset.order : "roll";
      const buttons = Array.from(document.querySelectorAll("#setup-form button"));
      buttons.forEach((button) => {
        button.disabled = true;
      });

      try {
        await startGame(getSetupPlayers(), orderMode);
      } catch (error) {
        buttons.forEach((button) => {
          button.disabled = false;
        });
        throw error;
      }
    });

    document.getElementById("add-player").addEventListener("click", () => addLocalPlayerEntry("", false));
    document.getElementById("add-ai-player").addEventListener("click", () => addLocalPlayerEntry(nextAiName(), true));
    document.getElementById("add-online-player").addEventListener("click", () => addOnlinePlayerEntry("", false));
    document
      .getElementById("add-online-ai-player")
      .addEventListener("click", () => addOnlinePlayerEntry(nextAiName("online-player-list"), true));
    document.getElementById("room-action").addEventListener("click", handleRoomAction);
    document.getElementById("copy-room-code").addEventListener("click", async () => {
      const code = state.online.roomCode;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        document.getElementById("room-lobby-note").textContent = "Room code copied.";
      } catch (error) {
        document.getElementById("room-lobby-note").textContent = `Room code: ${code}`;
      }
    });
    document.querySelectorAll("[data-room-order]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        document.getElementById("room-lobby-note").textContent = "Starting the game...";
        try {
          await startOnlineGame(button.dataset.roomOrder || "roll");
        } catch (error) {
          document.getElementById("room-lobby-note").textContent = error.message || "Could not start the game.";
          renderRoomLobby(state.online.roomData);
        }
      });
    });
    document.getElementById("fresh-turn").addEventListener("click", () => acceptInheritedTurn(false));
    document.getElementById("build-turn").addEventListener("click", () => acceptInheritedTurn(true));
    document.getElementById("roll-dice").addEventListener("click", rollForTurn);
    document.getElementById("bank-turn").addEventListener("click", () => {
      finishTurn(state.turn && state.turn.phase === "zilch");
    });
  }

  if (typeof document !== "undefined") {
    installNameInputBehavior();
    bindEvents();
    window.ZILCH_RENDER_ROOM_SNAPSHOT = renderRoomSnapshot;
  }

  if (typeof module !== "undefined") {
    module.exports = {
      calculateScoreRecursive,
      rollDice,
      rollForFirst,
      parsePlayers,
      renderRoomSnapshot
    };
  }
}());
