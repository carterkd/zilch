import unittest

from ai_lab.zilch_ai.rules import roll_dice, score_options


def compact(options):
    return {
        (option.points, "".join(map(str, sorted(option.used_dice))), option.free_dice)
        for option in options
    }


class RulesTest(unittest.TestCase):
    def assert_has(self, dice, points, used, free):
        self.assertIn((points, "".join(sorted(used)), free), compact(score_options(tuple(sorted(dice)))))

    def test_roll_bounds(self):
        import random

        rng = random.Random(1)
        for _ in range(100):
            roll = roll_dice(10, rng)
            self.assertEqual(len(roll), 10)
            self.assertTrue(all(1 <= die <= 6 for die in roll))

    def test_zilch(self):
        self.assertEqual(score_options((2, 3, 4, 6)), ())

    def test_scores_match_web_tests(self):
        self.assert_has([1, 2, 3, 4, 6], 100, "1", 4)
        self.assert_has([2, 3, 4, 5, 6], 50, "5", 4)
        self.assert_has([1, 2, 3, 4, 5, 6], 1500, "123456", 0)
        self.assert_has([1, 1, 1, 2, 3], 1000, "111", 2)
        self.assert_has([1, 1, 1, 1], 1100, "1111", 0)
        self.assert_has([1, 1, 1, 1, 1], 2000, "11111", 0)
        self.assert_has([2, 2, 2, 4, 6], 200, "222", 2)
        self.assert_has([2, 2, 2, 2], 1000, "2222", 0)
        self.assert_has([5, 5, 5, 5], 1000, "5555", 0)
        self.assert_has([5, 5, 5, 1], 600, "1555", 0)
        self.assert_has([1, 5, 5, 5, 6, 1, 5, 2, 1, 6], 2000, "1115555", 3)
        self.assert_has([1, 2, 3, 4, 5, 6, 1, 5], 1650, "11234565", 0)


if __name__ == "__main__":
    unittest.main()
