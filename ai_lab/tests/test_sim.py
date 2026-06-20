import unittest

from ai_lab.zilch_ai.policies import EVPolicy, GreedyThresholdPolicy, TurnView
from ai_lab.zilch_ai.sim import play_game


class SimTest(unittest.TestCase):
    def test_game_finishes(self):
        result = play_game([GreedyThresholdPolicy(750), GreedyThresholdPolicy(1000)], seed=7)
        self.assertGreaterEqual(max(result.scores), 20_000)
        self.assertGreater(result.turns, 0)

    def test_ev_policy_can_play(self):
        result = play_game([EVPolicy(), GreedyThresholdPolicy(750)], seed=9)
        self.assertGreaterEqual(max(result.scores), 20_000)

    def test_ev_policy_requires_closing_buffer_before_first_to_target_banks(self):
        policy = EVPolicy()
        weak_lead = TurnView(
            player_index=0,
            scores=(19_000, 18_500),
            inherited_score=0,
            inherited_free_dice=10,
            locked_points=0,
            loose_score=1_200,
            free_dice=8,
        )
        strong_lead = TurnView(
            player_index=0,
            scores=(19_000, 15_600),
            inherited_score=0,
            inherited_free_dice=10,
            locked_points=0,
            loose_score=1_200,
            free_dice=8,
        )

        self.assertFalse(policy.should_bank(weak_lead))
        self.assertTrue(policy.should_bank(strong_lead))

    def test_ev_policy_banks_when_final_round_passes_leader(self):
        policy = EVPolicy()
        view = TurnView(
            player_index=0,
            scores=(18_000, 21_000),
            inherited_score=0,
            inherited_free_dice=10,
            locked_points=0,
            loose_score=3_100,
            free_dice=8,
            final_round=True,
        )

        self.assertTrue(policy.should_bank(view))


if __name__ == "__main__":
    unittest.main()
