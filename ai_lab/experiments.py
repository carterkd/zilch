"""Command-line experiments for the Zilch AI lab."""

from __future__ import annotations

import argparse
from collections import Counter

from .zilch_ai.ev import EVTable
from .zilch_ai.policies import EVPolicy, GreedyThresholdPolicy, RandomPolicy
from .zilch_ai.sim import simulate_games


def print_turn_table() -> None:
    table = EVTable()
    print("Expected turn value when forced to roll:")
    print("loose,free_dice,roll_ev,decision_after_score")
    for loose in (0, 250, 500, 750, 1000, 1500, 2000, 3000, 5000):
        for dice in range(1, 11):
            roll_ev = table.roll_value(loose, dice)
            decision = table.choose_after_score(loose, dice)
            print(f"{loose},{dice},{roll_ev:.1f},{decision.action}")


def run_tournament(games: int, players: int) -> None:
    table = EVTable()
    lineups = [
        [EVPolicy(table), GreedyThresholdPolicy(750)],
        [EVPolicy(table), GreedyThresholdPolicy(1000)],
        [EVPolicy(table), RandomPolicy()],
    ]

    for lineup in lineups:
        active = lineup[:players]
        if len(active) < players:
            active = [lineup[0]] + [GreedyThresholdPolicy(750 + 250 * i) for i in range(players - 1)]

        results = simulate_games(active, games)
        wins = Counter(result.winner_index for result in results)
        avg_turns = sum(result.turns for result in results) / len(results)
        names = [policy.name for policy in active]
        print(f"\n{' vs '.join(names)}")
        for index, name in enumerate(names):
            pct = wins[index] / games * 100
            print(f"  {name}: {wins[index]}/{games} wins ({pct:.1f}%)")
        print(f"  average turns: {avg_turns:.1f}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Zilch AI lab experiments.")
    parser.add_argument("--games", type=int, default=1000)
    parser.add_argument("--players", type=int, default=2)
    parser.add_argument("--turn-table", action="store_true")
    args = parser.parse_args()

    if args.turn_table:
        print_turn_table()
    else:
        run_tournament(args.games, args.players)


if __name__ == "__main__":
    main()
