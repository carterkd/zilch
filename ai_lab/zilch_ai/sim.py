"""Game simulator for Zilch AI policies."""

from __future__ import annotations

from dataclasses import dataclass
from random import Random
from typing import Sequence

from .policies import Policy, TurnView
from .rules import NUM_DICE, TARGET_SCORE, roll_dice, score_options


@dataclass(frozen=True)
class GameResult:
    winner_index: int
    scores: tuple[int, ...]
    turns: int


def play_turn(
    policy: Policy,
    player_index: int,
    scores: list[int],
    inherited_score: int,
    inherited_free_dice: int,
    final_round: bool,
    rng: Random,
) -> tuple[int, int, int, bool]:
    view = TurnView(
        player_index=player_index,
        scores=tuple(scores),
        inherited_score=inherited_score,
        inherited_free_dice=inherited_free_dice,
        locked_points=0,
        loose_score=0,
        free_dice=NUM_DICE,
        final_round=final_round,
    )
    if inherited_score > 0 and policy.choose_build(view):
        loose_score = inherited_score
        free_dice = inherited_free_dice
    else:
        loose_score = 0
        free_dice = NUM_DICE

    locked_points = 0

    while True:
        dice = roll_dice(free_dice, rng)
        options = score_options(dice)
        if not options:
            return locked_points, 0, NUM_DICE, True

        view = TurnView(
            player_index=player_index,
            scores=tuple(scores),
            inherited_score=inherited_score,
            inherited_free_dice=inherited_free_dice,
            locked_points=locked_points,
            loose_score=loose_score,
            free_dice=free_dice,
            final_round=final_round,
        )
        selected = policy.choose_option(dice, options, view)
        loose_score += selected.points
        free_dice = selected.free_dice

        if free_dice == 0:
            locked_points += loose_score
            loose_score = 0
            free_dice = NUM_DICE
            continue

        view = TurnView(
            player_index=player_index,
            scores=tuple(scores),
            inherited_score=inherited_score,
            inherited_free_dice=inherited_free_dice,
            locked_points=locked_points,
            loose_score=loose_score,
            free_dice=free_dice,
            final_round=final_round,
        )
        if policy.should_bank(view):
            earned = locked_points + loose_score
            return earned, earned, free_dice, False


def play_game(
    policies: Sequence[Policy],
    seed: int | None = None,
    target_score: int = TARGET_SCORE,
    max_turns: int = 20_000,
) -> GameResult:
    rng = Random(seed)
    scores = [0 for _ in policies]
    inherited_score = 0
    inherited_free_dice = NUM_DICE
    final_round = False
    played_final_turn = [False for _ in policies]
    current_index = 0

    for turn_number in range(1, max_turns + 1):
        if final_round and played_final_turn[current_index]:
            current_index = (current_index + 1) % len(policies)
            continue

        earned, next_inherited, next_free_dice, zilched = play_turn(
            policies[current_index],
            current_index,
            scores,
            inherited_score,
            inherited_free_dice,
            final_round,
            rng,
        )
        scores[current_index] += earned

        if zilched:
            inherited_score = 0
            inherited_free_dice = NUM_DICE
        else:
            inherited_score = next_inherited
            inherited_free_dice = next_free_dice

        if not final_round and scores[current_index] >= target_score:
            final_round = True

        if final_round:
            played_final_turn[current_index] = True
            if all(played_final_turn):
                winner_index = max(range(len(scores)), key=lambda index: scores[index])
                return GameResult(winner_index, tuple(scores), turn_number)

        current_index = (current_index + 1) % len(policies)

    winner_index = max(range(len(scores)), key=lambda index: scores[index])
    return GameResult(winner_index, tuple(scores), max_turns)


def simulate_games(policies: Sequence[Policy], games: int, seed: int = 20260617) -> list[GameResult]:
    rng = Random(seed)
    return [play_game(policies, seed=rng.randrange(2**32)) for _ in range(games)]
