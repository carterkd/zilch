"""Expected-value solver for Zilch turn decisions."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from .rules import NUM_DICE, ScoreOption, dice_from_counts, multinomial_outcomes, score_options


STEP = 50


@dataclass(frozen=True)
class EVDecision:
    action: str
    value: float
    option: ScoreOption | None = None


class EVTable:
    """Finite-horizon expected-value solution for turn-level choices.

    Locked points are additive, so the solver only needs to model the risky
    loose portion of a turn. The horizon is measured in future rolls; increasing
    it makes the bot more ambitious at the cost of runtime.
    """

    def __init__(self, max_loose: int = 8_000, horizon: int = 7) -> None:
        if max_loose % STEP != 0:
            raise ValueError("max_loose must be divisible by 50")
        self.max_loose = max_loose
        self.horizon = horizon

    def roll_value(self, loose: int, free_dice: int) -> float:
        if free_dice <= 0:
            free_dice = NUM_DICE
        if loose > self.max_loose:
            return float(loose)
        return self._roll_value(self._snap(loose), free_dice, self.horizon)

    def choose_after_score(self, loose: int, free_dice: int) -> EVDecision:
        if free_dice <= 0:
            return EVDecision("roll", loose + self.roll_value(0, NUM_DICE))

        roll = self.roll_value(loose, free_dice)
        if loose >= roll:
            return EVDecision("bank", float(loose))
        return EVDecision("roll", roll)

    def option_decision(self, loose: int, option: ScoreOption) -> EVDecision:
        next_loose = loose + option.points
        if option.free_dice == 0:
            return EVDecision("lock-and-roll", next_loose + self.roll_value(0, NUM_DICE), option)

        followup = self.choose_after_score(next_loose, option.free_dice)
        return EVDecision(followup.action, followup.value, option)

    def best_option(self, dice: tuple[int, ...], loose: int = 0) -> EVDecision:
        options = score_options(tuple(sorted(dice)))
        if not options:
            return EVDecision("zilch", 0)

        return max((self.option_decision(loose, option) for option in options), key=lambda decision: decision.value)

    @lru_cache(maxsize=None)
    def _roll_value(self, loose: int, free_dice: int, depth: int) -> float:
        if depth <= 0:
            return float(loose)

        total = 0.0
        for probability, summaries in _outcome_summaries(free_dice):
            if not summaries:
                continue

            best = 0.0
            for points, next_free_dice in summaries:
                next_loose = loose + points
                if next_free_dice == 0:
                    value = next_loose + self._roll_value(0, NUM_DICE, depth - 1)
                elif next_loose > self.max_loose:
                    value = float(next_loose)
                else:
                    snapped = self._snap(next_loose)
                    value = max(float(next_loose), self._roll_value(snapped, next_free_dice, depth - 1))
                best = max(best, value)
            total += probability * best
        return total

    @staticmethod
    def _snap(value: int) -> int:
        return int(round(value / STEP) * STEP)


@lru_cache(maxsize=None)
def _outcome_summaries(free_dice: int) -> tuple[tuple[float, tuple[tuple[int, int], ...]], ...]:
    summaries = []
    for counts, probability in multinomial_outcomes(free_dice):
        dice = dice_from_counts(counts)
        options = tuple((option.points, option.free_dice) for option in score_options(dice))
        summaries.append((probability, options))
    return tuple(summaries)
