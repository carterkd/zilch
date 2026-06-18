"""Core Zilch rules shared by the AI lab.

This module mirrors the scoring behavior in app.js. Keep changes here aligned
with the web game, not with generic Farkle variants.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from math import factorial
from random import Random
from typing import Iterable


TARGET_SCORE = 20_000
NUM_SIDES = 6
NUM_DICE = 10


@dataclass(frozen=True, order=True)
class ScoreOption:
    points: int
    used_dice: tuple[int, ...]
    remaining_dice: tuple[int, ...]
    descriptions: tuple[str, ...] = ()

    @property
    def free_dice(self) -> int:
        return len(self.remaining_dice)


def roll_dice(num_dice: int, rng: Random) -> tuple[int, ...]:
    return tuple(sorted(rng.randint(1, NUM_SIDES) for _ in range(num_dice)))


def counts_for(dice: Iterable[int]) -> tuple[int, ...]:
    values = list(dice)
    return tuple(values.count(face) for face in range(1, NUM_SIDES + 1))


def dice_from_counts(counts: tuple[int, ...]) -> tuple[int, ...]:
    dice: list[int] = []
    for face, count in enumerate(counts, start=1):
        dice.extend([face] * count)
    return tuple(dice)


def remove_dice(source: Iterable[int], values: Iterable[int]) -> tuple[int, ...]:
    remaining = list(source)
    for value in values:
        remaining.remove(value)
    return tuple(remaining)


def _move_key(move: ScoreOption) -> tuple[int, tuple[int, ...], tuple[int, ...], tuple[str, ...]]:
    return (
        move.points,
        tuple(sorted(move.used_dice)),
        tuple(sorted(move.remaining_dice)),
        tuple(sorted(move.descriptions)),
    )


def scoring_moves(dice: tuple[int, ...]) -> tuple[ScoreOption, ...]:
    moves: list[ScoreOption] = []
    counts = counts_for(dice)

    if all(count >= 1 for count in counts):
        straight = (1, 2, 3, 4, 5, 6)
        moves.append(
            ScoreOption(
                points=1500,
                descriptions=("1-6 (1500)",),
                used_dice=straight,
                remaining_dice=remove_dice(dice, straight),
            )
        )

    for face, count in enumerate(counts, start=1):
        if count < 3:
            continue

        if face == 1:
            for n in range(3, count + 1):
                if n == 3:
                    points = 1000
                elif n == 4:
                    continue
                else:
                    points = 1000 + (n - 4) * 1000
                used = tuple([face] * n)
                moves.append(
                    ScoreOption(
                        points=points,
                        descriptions=(f"{n} {face}'s ({points})",),
                        used_dice=used,
                        remaining_dice=remove_dice(dice, used),
                    )
                )
        else:
            if count >= 4:
                for n in range(4, count + 1):
                    points = 1000 + (n - 4) * 1000
                    used = tuple([face] * n)
                    moves.append(
                        ScoreOption(
                            points=points,
                            descriptions=(f"{n} {face}'s ({points})",),
                            used_dice=used,
                            remaining_dice=remove_dice(dice, used),
                        )
                    )

            points = face * 100
            used = tuple([face] * 3)
            moves.append(
                ScoreOption(
                    points=points,
                    descriptions=(f"3 {face}'s ({points})",),
                    used_dice=used,
                    remaining_dice=remove_dice(dice, used),
                )
            )

    for face in (1, 5):
        if counts[face - 1] > 0:
            points = 100 if face == 1 else 50
            moves.append(
                ScoreOption(
                    points=points,
                    descriptions=(f"{face} ({points})",),
                    used_dice=(face,),
                    remaining_dice=remove_dice(dice, (face,)),
                )
            )

    return tuple(moves)


@lru_cache(maxsize=None)
def score_options(dice: tuple[int, ...]) -> tuple[ScoreOption, ...]:
    sorted_dice = tuple(sorted(dice))
    combinations: list[ScoreOption] = []

    for move in scoring_moves(sorted_dice):
        combinations.append(move)
        for tail in score_options(move.remaining_dice):
            combinations.append(
                ScoreOption(
                    points=move.points + tail.points,
                    descriptions=move.descriptions + tail.descriptions,
                    used_dice=move.used_dice + tail.used_dice,
                    remaining_dice=tail.remaining_dice,
                )
            )

    unique: dict[tuple[int, tuple[int, ...], tuple[int, ...], tuple[str, ...]], ScoreOption] = {}
    for combo in combinations:
        unique.setdefault(_move_key(combo), combo)

    return tuple(sorted(unique.values(), key=lambda option: option.points, reverse=True))


@lru_cache(maxsize=None)
def multinomial_outcomes(num_dice: int) -> tuple[tuple[tuple[int, ...], float], ...]:
    """Return unique dice-count outcomes without enumerating all ordered rolls."""
    outcomes: list[tuple[tuple[int, ...], float]] = []
    total = NUM_SIDES**num_dice

    def visit(remaining: int, slots: int, prefix: tuple[int, ...]) -> None:
        if slots == 1:
            counts = prefix + (remaining,)
            ways = factorial(num_dice)
            for count in counts:
                ways //= factorial(count)
            outcomes.append((counts, ways / total))
            return
        for count in range(remaining + 1):
            visit(remaining - count, slots - 1, prefix + (count,))

    visit(num_dice, NUM_SIDES, ())
    return tuple(outcomes)
