import unittest

from ai_lab.zilch_ai.policies import EVPolicy, GreedyThresholdPolicy
from ai_lab.zilch_ai.sim import play_game


class SimTest(unittest.TestCase):
    def test_game_finishes(self):
        result = play_game([GreedyThresholdPolicy(750), GreedyThresholdPolicy(1000)], seed=7)
        self.assertGreaterEqual(max(result.scores), 20_000)
        self.assertGreater(result.turns, 0)

    def test_ev_policy_can_play(self):
        result = play_game([EVPolicy(), GreedyThresholdPolicy(750)], seed=9)
        self.assertGreaterEqual(max(result.scores), 20_000)


if __name__ == "__main__":
    unittest.main()
