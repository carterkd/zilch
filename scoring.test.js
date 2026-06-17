const assert = require("assert");
const { calculateScoreRecursive, rollForFirst, parsePlayers } = require("./app");

function scores(dice) {
  return calculateScoreRecursive(dice.slice().sort((a, b) => a - b)).map((combo) => ({
    points: combo.points,
    used: combo.usedDice.slice().sort((a, b) => a - b).join(""),
    free: combo.remainingDice.length,
    desc: combo.descriptions.join(" + ")
  }));
}

function has(dice, points, used, free) {
  const key = used.split("").sort().join("");
  assert(
    scores(dice).some((combo) => combo.points === points && combo.used === key && combo.free === free),
    `Expected ${dice} to include ${points}/${key}/${free}`
  );
}

assert.deepStrictEqual(parsePlayers("A\nB\nA\n\nC"), ["A", "B", "C"]);
assert.deepStrictEqual(parsePlayers(["   ", ""]), ["Kent", "Sonja"]);
assert.strictEqual(rollForFirst(["Solo"]).names[0], "Solo");

assert.strictEqual(scores([2, 3, 4, 6]).length, 0);
has([1, 2, 3, 4, 6], 100, "1", 4);
has([2, 3, 4, 5, 6], 50, "5", 4);
has([1, 2, 3, 4, 5, 6], 1500, "123456", 0);
has([1, 1, 1, 2, 3], 1000, "111", 2);
has([1, 1, 1, 1], 1100, "1111", 0);
has([1, 1, 1, 1, 1], 2000, "11111", 0);
has([2, 2, 2, 4, 6], 200, "222", 2);
has([2, 2, 2, 2], 1000, "2222", 0);
has([5, 5, 5, 5], 1000, "5555", 0);
has([5, 5, 5, 1], 600, "1555", 0);
has([1, 5, 5, 5, 6, 1, 5, 2, 1, 6], 2000, "1115555", 3);
has([1, 2, 3, 4, 5, 6, 1, 5], 1650, "11234565", 0);

console.log("Scoring tests passed.");
