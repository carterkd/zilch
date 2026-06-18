"""Bot policies for the Zilch simulator."""

from __future__ import annotations

from dataclasses import dataclass
from random import Random

from .ev import EVTable
from .rules import NUM_DICE, TARGET_SCORE, ScoreOption, score_options


@dataclass
class TurnView:
    player_index: int
    scores: tuple[int, ...]
    inherited_score: int
    inherited_free_dice: int
    locked_points: int
    loose_score: int
    free_dice: int
    final_round: bool = False


class Policy:
    name = "policy"

    def choose_build(self, view: TurnView) -> bool:
        return False

    def choose_option(self, dice: tuple[int, ...], options: tuple[ScoreOption, ...], view: TurnView) -> ScoreOption:
        return options[0]

    def should_bank(self, view: TurnView) -> bool:
        return view.loose_score > 0


class RandomPolicy(Policy):
    name = "random"

    def __init__(self, rng: Random | None = None) -> None:
        self.rng = rng or Random()

    def choose_build(self, view: TurnView) -> bool:
        return view.inherited_score > 0 and self.rng.random() < 0.5

    def choose_option(self, dice: tuple[int, ...], options: tuple[ScoreOption, ...], view: TurnView) -> ScoreOption:
        return self.rng.choice(options)

    def should_bank(self, view: TurnView) -> bool:
        return view.loose_score > 0 and self.rng.random() < 0.5


class GreedyThresholdPolicy(Policy):
    name = "greedy-750"

    def __init__(self, bank_threshold: int = 750) -> None:
        self.bank_threshold = bank_threshold
        self.name = f"greedy-{bank_threshold}"

    def choose_build(self, view: TurnView) -> bool:
        return view.inherited_score >= 500 or view.inherited_free_dice >= 7

    def choose_option(self, dice: tuple[int, ...], options: tuple[ScoreOption, ...], view: TurnView) -> ScoreOption:
        return max(options, key=lambda option: (option.points, option.free_dice))

    def should_bank(self, view: TurnView) -> bool:
        if view.loose_score + view.locked_points >= self.bank_threshold:
            return True
        return view.free_dice <= 2 and view.loose_score + view.locked_points >= 350


class EVPolicy(Policy):
    name = "ev"

    def __init__(self, table: EVTable | None = None, target_score: int = TARGET_SCORE) -> None:
        self.table = table or EVTable()
        self.target_score = target_score

    def choose_build(self, view: TurnView) -> bool:
        if view.inherited_score <= 0:
            return False
        build_value = self.table.roll_value(view.inherited_score, view.inherited_free_dice)
        fresh_value = self.table.roll_value(0, NUM_DICE)
        return build_value > fresh_value

    def choose_option(self, dice: tuple[int, ...], options: tuple[ScoreOption, ...], view: TurnView) -> ScoreOption:
        decision = self.table.best_option(dice, view.loose_score)
        return decision.option or options[0]

    def should_bank(self, view: TurnView) -> bool:
        if view.free_dice <= 0:
            return False
        earned = view.locked_points + view.loose_score
        total_if_bank = view.scores[view.player_index] + earned
        other_best = max(
            (score for index, score in enumerate(view.scores) if index != view.player_index),
            default=0,
        )
        if view.final_round and total_if_bank > other_best:
            return True
        if not view.final_round and total_if_bank >= self.target_score:
            return True
        if view.final_round and total_if_bank <= other_best:
            return False
        decision = self.table.choose_after_score(view.loose_score, view.free_dice)
        return decision.action == "bank"


def legal_options(dice: tuple[int, ...]) -> tuple[ScoreOption, ...]:
    return score_options(tuple(sorted(dice)))
