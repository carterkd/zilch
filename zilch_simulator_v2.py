#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Thu Nov 28 00:26:15 2024

@author: carter
"""

import random

def roll_dice(num_dice):
    """Roll a specified number of dice and return the result."""
    return [random.randint(1, 6) for _ in range(num_dice)]

def calculate_score_recursive(dice, scoring_combinations=None, current_score=0, used_dice=()):
    """Recursively calculate all valid scoring combinations, eliminating duplicates during computation."""
    if scoring_combinations is None:
        scoring_combinations = []

    counts = {i: dice.count(i) for i in range(1, 7)}
    added_combinations = set()  # Keep track of added combinations to prevent duplicates

    # Check for a straight (run)
    if all(counts[i] >= 1 for i in range(1, 7)):
        straight_run = tuple(range(1, 7))
        left_over = [die for die, count in counts.items() for _ in range(count - 1) if count > 1]
        key = (current_score + 1500, used_dice + straight_run, tuple(left_over))
        if key not in added_combinations:
            scoring_combinations.append(key)
            added_combinations.add(key)
        return scoring_combinations

    # Check for triples or more
    for num, count in counts.items():
        if count >= 3:
            for n in range(3, count + 1):
                points = 1000 + (n - 3) * 1000 if num == 1 else num * 100 * n
                remaining_dice = dice[:]
                for _ in range(n):
                    remaining_dice.remove(num)
                key = (current_score + points, used_dice + tuple([num] * n), tuple(remaining_dice))
                if key not in added_combinations:
                    scoring_combinations.append(key)
                    added_combinations.add(key)
                    calculate_score_recursive(remaining_dice, scoring_combinations, current_score + points, used_dice + tuple([num] * n))

    # Check for single 1's and 5's
    for num in [1, 5]:
        for _ in range(counts[num]):
            points = 100 if num == 1 else 50
            remaining_dice = dice[:]
            remaining_dice.remove(num)
            key = (current_score + points, used_dice + (num,), tuple(remaining_dice))
            if key not in added_combinations:
                scoring_combinations.append(key)
                added_combinations.add(key)
                calculate_score_recursive(remaining_dice, scoring_combinations, current_score + points, used_dice + (num,))

    # Remove duplicates
    unique_combinations = []
    seen = set()
    for combo in scoring_combinations:
        combo_key = (combo[0], tuple(sorted(combo[1])))
        if combo_key not in seen:
            seen.add(combo_key)
            unique_combinations.append(combo)
    
    # Sort by score in descending order
    unique_combinations.sort(key=lambda x: -x[0])
    return unique_combinations






def calculate_score_recursive(dice, scoring_combinations=None, current_score=0, used_dice=()):
    """Recursively calculate all valid scoring combinations."""
    if scoring_combinations is None:
        scoring_combinations = []
    
    counts = {i: dice.count(i) for i in range(1, 7)}
    new_scores = []
    
    # Check for a straight (run)
    if all(counts[i] >= 1 for i in range(1, 7)):
        straight_run = tuple(counts.keys())
        left_over = {i: counts[i]-1 for i in range(1, 7)}
        left_over = [die for die, count in left_over.items() for _ in range(count) if count > 0]
        new_scores.append((current_score + 1500, used_dice + straight_run, left_over))
    
    # Check for triples or more
    for num, count in counts.items():
        if count >= 3:
            for n in range(3, count + 1):
                points = 1000 + (n - 3) * 1000 if num == 1 else num * 100 * n
                remaining_dice = dice[:]
                for _ in range(n):
                    remaining_dice.remove(num)
                new_scores.append((current_score + points, used_dice + tuple([num] * n), remaining_dice))
    
    # Check for single 1's and 5's
    for num in [1, 5]:
        for _ in range(counts[num]):
            points = 100 if num == 1 else 50
            remaining_dice = dice[:]
            remaining_dice.remove(num)
            new_scores.append((current_score + points, used_dice + (num,), remaining_dice))
    
    # Add each new score to the combinations and recurse
    for score, used, remaining in new_scores:
        scoring_combinations.append((score, used, remaining))
        calculate_score_recursive(remaining, scoring_combinations, score, used)
    
    # Remove duplicates
    unique_combinations = []
    seen = set()
    for combo in scoring_combinations:
        combo_key = (combo[0], tuple(sorted(combo[1])))
        if combo_key not in seen:
            seen.add(combo_key)
            unique_combinations.append(combo)
    
    # Sort by score in descending order
    unique_combinations.sort(key=lambda x: -x[0])
    return unique_combinations

def display_scoring_options(scoring_combinations):
    """Display the scoring options to the user."""
    print("\nScoring options:")
    for i, (points, used_dice, remaining_dice) in enumerate(scoring_combinations):
        print(f"{i + 1}: Score {points} pts, Scoring dice: {used_dice}, Free dice: {len(remaining_dice)}")

def determine_order(players):
    """Determine the playing order."""
    if len(players) >= 3:
        print("\nHow do you want to determine the playing order?")
        print("  (1) Randomize the order")
        print("  (2) Roll dice to determine the order")
        choice = input("Enter your choice (1/2): ").strip()
    else:
        choice = "2"

    if choice == "1":
        rolls = {player: random.randint(1, 100) for player in players}
        sorted_players = sorted(rolls, key=lambda x: -rolls[x])
        print("\nRandom rolls:")
        for player, roll in rolls.items():
            print(f"{player}: {roll}")
        return sorted_players

    elif choice == "2":
        rolls = {}
        while len(rolls) < len(players):
            for player in players:
                if player not in rolls:
                    roll = random.randint(1, 6)
                    print(f"{player} rolled: {roll}")
                    if roll in rolls.values():
                        continue
                    rolls[player] = roll

        sorted_players = sorted(rolls, key=lambda x: -rolls[x])
        print("\nRolls to determine order:")
        for player, roll in rolls.items():
            print(f"{player}: {roll}")
        return sorted_players

    else:
        print("Invalid choice. Defaulting to random order.")
        return determine_order(players)

def player_turn(player_name, current_score, locked_points=0, inherited_score=0, free_dice=None):
    """Simulate a single player's turn."""
    if free_dice is None:
        free_dice = 10

    turn_score = inherited_score
    print(f"\n{player_name}'s turn! Current score: {current_score}")
    print(f"Locked points: {locked_points}")
    print(f"Inherited score: {inherited_score}")

    while True:
        dice = roll_dice(free_dice)
        print(f"Rolled: {dice}")

        scoring_combinations = calculate_score_recursive(dice)
        if not scoring_combinations:
            print("Zilch! No scoring dice. Turn ends.")
            return 0, True  # Zilch and end turn.

        display_scoring_options(scoring_combinations)

        print(f"\nCurrent turn score: {turn_score}")
        scoring_choice = int(input("Select a scoring option (enter number): ").strip()) - 1
        selected_points, selected_scoring_dice, remaining_dice = scoring_combinations[scoring_choice]
        turn_score += selected_points
        free_dice = len(remaining_dice)

        print(f"Selected scoring option adds {selected_points} points. Remaining free dice: {free_dice}")

        if free_dice == 0:
            print("All dice used! Rolling all 10 dice again.")
            free_dice = 10
            locked_points = turn_score
        else:
            print("\nOptions:")
            print("  (1) Roll free dice")
            print("  (2) End turn and bank score")
            next_choice = input("Choose an option (1/2): ").strip()
            if next_choice == "2":
                print(f"{player_name} ends their turn and banks {turn_score} points.")
                return turn_score, False

def display_scores(scores):
    """Display the current game scores."""
    print("\n=== Current Scores ===")
    for player, score in scores.items():
        print(f"{player}: {score}")
    print("======================")

def main():
    print("Welcome to Zilch!")
    num_players = int(input("Enter the number of players: "))
    players = [input(f"Enter name for Player {i + 1}: ").strip() for i in range(num_players)]
    players = determine_order(players)

    print("\nPlaying order:")
    print(" -> ".join(players))

    scores = {player: 0 for player in players}
    target_score = 20000
    final_round = False
    inherited_score = 0
    locked_points = 0
    free_dice = 10

    while not final_round:
        for player in players:
            display_scores(scores)
            print(f"\n{player}'s turn! (Current score: {scores[player]})")
            if inherited_score > 0:
                print("You may choose to build on the previous player's score.")
                choice = input("Would you like to (1) roll all 10 dice or (2) build on the previous score? ").strip()
                if choice == "1":
                    inherited_score = 0
                    free_dice = 10
                elif choice == "2":
                    print(f"Building on inherited score of {inherited_score}.")
                else:
                    print("Invalid choice. Rolling all 10 dice by default.")
                    inherited_score = 0
                    free_dice = 10

            turn_score, zilched = player_turn(player, scores[player], locked_points, inherited_score, free_dice)
            if zilched:
                inherited_score = 0
                free_dice = 10
            else:
                inherited_score = turn_score
                free_dice = 10

            scores[player] += turn_score
            if scores[player] >= target_score:
                final_round = True
                print(f"\n{player} has reached {target_score} points! Final round begins.")
                break

    print("\nFinal round!")
    for player in players:
        display_scores(scores)
        if scores[player] < target_score:
            print(f"\n{player}'s final turn! (Current score: {scores[player]})")
            turn_score, _ = player_turn(player, scores[player], locked_points)
            scores[player] += turn_score

    display_scores(scores)
    winner = max(scores, key=scores.get)
    print(f"\nCongratulations, {winner}! You are the winner with {scores[winner]} points!")

if __name__ == "__main__":
    main()


