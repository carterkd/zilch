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
    room: {
      mode: "local",
      devicePlayers: []
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
    return combos.map((combo) => ({
      points: combo.points,
      descriptions: combo.descriptions.slice(),
      usedDice: combo.usedDice.slice(),
      remainingDice: combo.remainingDice.slice()
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

  function parsePlayers(rawNames) {
    const unique = [];
    const names = Array.isArray(rawNames) ? rawNames : String(rawNames).split(/\n|,/);
    names
      .map((name) => String(name).trim())
      .filter(Boolean)
      .forEach((name) => {
        if (!unique.includes(name)) unique.push(name);
      });
    return unique.length ? unique : ["Kent", "Sonja"];
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
    list.appendChild(input);
    input.focus();
  }

  function getSetupPlayerNames() {
    return parsePlayers(Array.from(document.querySelectorAll("#player-list .player-name-input")).map((input) => input.value));
  }

  function getOnlineDevicePlayerNames() {
    return parsePlayers(Array.from(document.querySelectorAll("#online-player-list .player-name-input")).map((input) => input.value));
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
    const hasFirebase = Boolean(window.ZILCH_FIREBASE_CONFIG);

    panel.classList.remove("hidden");
    panel.dataset.mode = mode;
    title.textContent = mode === "create" ? "Create online room" : "Join online room";
    action.textContent = mode === "create" ? "Create room" : "Join room";
    input.classList.toggle("hidden", mode === "create");
    input.value = "";
    copy.textContent = hasFirebase
      ? "Add everyone playing from this device before connecting to the room."
      : "Online sync still needs Firebase config. You can already set who is playing from this device.";
    action.disabled = !hasFirebase;
    const firstDevicePlayer = document.querySelector("#online-player-list .player-name-input");
    if (mode === "join" && hasFirebase) input.focus();
    else if (firstDevicePlayer) firstDevicePlayer.focus();
  }

  function handleRoomAction() {
    const panel = document.getElementById("online-room-panel");
    const input = document.getElementById("room-code-input");
    const mode = panel.dataset.mode || "create";
    const roomCode = input.value.trim().toUpperCase();
    const devicePlayers = getOnlineDevicePlayerNames();

    if (mode === "join" && !roomCode) {
      input.focus();
      return;
    }

    window.ZILCH_PENDING_ROOM = {
      mode,
      roomCode,
      devicePlayers
    };
  }

  function rollForFirst(names) {
    return rollForFirstWithHistory(names).result;
  }

  function rollForFirstWithHistory(names) {
    if (names.length <= 1) {
      return {
        result: { names, detail: "Solo table" },
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
        names: orderedNames,
        detail: `${first} rolled into first.`
      },
      history: history.concat({
        title: "Order set",
        rows: orderedNames.map((name, index) => ({ name, note: index === 0 ? "first" : `${index + 1}` }))
      })
    };
  }

  function shuffleNames(names) {
    const shuffled = names.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = secureRandomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function getOrderPlan(names, orderMode) {
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
          { title: "Shuffling", rows: names.map((name) => ({ name, note: "in" })) },
          {
            title: "Order set",
            rows: orderedNames.map((name, index) => ({ name, note: index === 0 ? "first" : `${index + 1}` }))
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
          rows: names.map((name, index) => ({ name, note: index === 0 ? "first" : `${index + 1}` }))
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
    state.log = state.log.slice(0, 10);
  }

  function currentPlayer() {
    return state.players[state.currentIndex];
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

  function setRoomContext(mode, devicePlayers) {
    state.room = {
      mode,
      devicePlayers: mode === "online" ? parsePlayers(devicePlayers) : []
    };
  }

  function allFinalTurnsPlayed() {
    return state.players.length > 0 && state.players.every((player) => state.playedFinalTurns[player.name]);
  }

  function startGameFromOrder(orderedNames, orderDetail, roomContext = { mode: "local", devicePlayers: [] }) {
    state.players = orderedNames.map((name) => ({ name, score: 0 }));
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
    addLog(orderDetail);

    document.getElementById("setup-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    prepareNextTurn();
  }

  function normalizeSnapshotPlayers(players) {
    if (!Array.isArray(players) || !players.length) {
      return parsePlayers([]).map((name) => ({ name, score: 0 }));
    }

    return players
      .map((player) => {
        if (typeof player === "string") return { name: player.trim(), score: 0 };
        return {
          name: String(player.name || "").trim(),
          score: Number(player.score || 0)
        };
      })
      .filter((player) => player.name);
  }

  function renderRoomSnapshot(snapshot) {
    const next = snapshot || {};
    const players = normalizeSnapshotPlayers(next.players);
    const currentIndex = Number.isInteger(next.currentIndex) ? next.currentIndex : 0;
    const turn = next.turn || {};
    const dice = Array.isArray(turn.dice) ? turn.dice.slice() : [];
    const phase = turn.phase || "await-roll";
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
    state.log = Array.isArray(next.log) ? next.log.slice(0, 10) : [];
    setRoomContext("online", next.room && next.room.devicePlayers ? next.room.devicePlayers : []);
    state.turn = {
      playerName: turn.playerName || players[state.currentIndex].name,
      inheritedScore: Number(turn.inheritedScore || 0),
      lockedPoints: Number(turn.lockedPoints || 0),
      looseScore: Number(turn.looseScore || 0),
      freeDice: Number(turn.freeDice || 10),
      dice,
      options,
      selectedOptionIndex: Number.isInteger(turn.selectedOptionIndex) ? turn.selectedOptionIndex : null,
      phase,
      rollId: Number(turn.rollId || 0)
    };

    clearAutoChoiceTimer();
    document.getElementById("mode-screen").classList.add("hidden");
    document.getElementById("setup-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    render();
  }

  async function startGame(names, orderMode) {
    const plan = getOrderPlan(names, orderMode);
    await playSetupAnimation(plan.steps);
    startGameFromOrder(plan.orderedNames, plan.orderDetail);
  }

  function prepareNextTurn() {
    const player = currentPlayer();
    const hasInheritedOffer = state.inheritedScore > 0;
    state.turn = {
      playerName: player.name,
      inheritedScore: hasInheritedOffer ? state.inheritedScore : 0,
      lockedPoints: 0,
      looseScore: 0,
      freeDice: 10,
      dice: [],
      options: [],
      selectedOptionIndex: null,
      phase: hasInheritedOffer ? "offer" : "await-roll"
    };

    if (state.turn.phase === "await-roll") {
      addLog(`${player.name} starts fresh.`);
    }
    render();
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
    render();
  }

  function rollForTurn() {
    const turn = state.turn;
    if (!turn || !["await-roll", "choose-next"].includes(turn.phase)) return;
    if (!isCurrentTurnLocal()) return;
    clearAutoChoiceTimer();

    turn.dice = rollDice(turn.freeDice);
    turn.options = calculateScoreRecursive(turn.dice);
    turn.selectedOptionIndex = null;
    turn.rollId = (turn.rollId || 0) + 1;

    if (turn.options.length === 0) {
      turn.phase = "zilch";
      addLog(`${turn.playerName} rolled ${turn.dice.join(", ")} and zilched.`);
      render();
      return;
    }

    turn.phase = "choose-option";
    addLog(`${turn.playerName} rolled ${turn.dice.join(", ")}.`);
    render();
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
    turn.dice = [];
    turn.options = [];

    if (turn.freeDice === 0) {
      turn.lockedPoints += turn.looseScore;
      addLog(`${turn.playerName} locked ${formatScore(turn.lockedPoints)} and reloads all dice.`);
      turn.inheritedScore = 0;
      turn.looseScore = 0;
      turn.freeDice = 10;
      turn.phase = "await-roll";
    } else {
      turn.phase = "choose-next";
      addLog(`${turn.playerName} scores ${formatScore(option.points)} with ${turn.freeDice} free dice.`);
    }
    render();
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
    render();
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
    const isRemoteTurn = Boolean(turn && isRoomMode() && !isCurrentTurnLocal() && !state.gameOver);

    panel.classList.toggle("hidden", !isRemoteTurn);
    if (!isRemoteTurn) return;

    panel.classList.toggle("zilch", turn.phase === "zilch");
    label.textContent = "Waiting on another device";
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
      if (isRoomMode() && isPlayerOnThisDevice(player.name)) card.classList.add("on-this-device");
      if (state.finalRound && state.playedFinalTurns[player.name]) card.classList.add("final-done");
      const name = document.createElement("span");
      name.textContent = player.name;
      const score = document.createElement("strong");
      score.textContent = formatScore(player.score);
      card.append(name, score);
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
    const localTurn = isCurrentTurnLocal();

    turn.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-card";
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
    const localTurn = isCurrentTurnLocal();

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
    panel.innerHTML = `<div class="winner-panel"><h2>${winners.join(" and ")} wins</h2><p>${formatScore(highScore)} points</p></div>`;
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
        await startGame(getSetupPlayerNames(), orderMode);
      } catch (error) {
        buttons.forEach((button) => {
          button.disabled = false;
        });
        throw error;
      }
    });

    document.getElementById("add-player").addEventListener("click", () => addPlayerInput());
    document
      .getElementById("add-online-player")
      .addEventListener("click", () => addPlayerInput("", "online-player-list", "online-player-name-input"));
    document.getElementById("room-action").addEventListener("click", handleRoomAction);
    document.getElementById("fresh-turn").addEventListener("click", () => acceptInheritedTurn(false));
    document.getElementById("build-turn").addEventListener("click", () => acceptInheritedTurn(true));
    document.getElementById("roll-dice").addEventListener("click", rollForTurn);
    document.getElementById("bank-turn").addEventListener("click", () => {
      finishTurn(state.turn && state.turn.phase === "zilch");
    });
  }

  if (typeof document !== "undefined") {
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
