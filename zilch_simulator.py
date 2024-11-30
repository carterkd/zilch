#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Thu Nov 28 00:26:15 2024

@author: carter
"""

import random
import sys

def get_input(prompt, input_type="choice", allowed_options=None, excluded_names=None, allow_enter=False):
    """
    A robust input function to handle strings, positive integers, specific choices, and "Enter" prompts.
    
    Args:
        prompt (str): The prompt to display to the user.
        input_type (str): The type of input expected. Options: "string", "int", "choice", or "positive_int".
        allowed_options (list): A list of allowed options for the input (for "choice" and "int").
        excluded_names (list): A list of names to exclude (only for `input_type="string"`).
        allow_enter (bool): If True, allows the user to press Enter to continue (returns None).
    
    Returns:
        str, int, or None: The validated user input.
    """
    while True:
        user_input = input(prompt).strip()
        
        # Handle "Enter" option
        if allow_enter:
            return None
        
        # Validate string input
        if input_type == "string":
            if excluded_names and user_input in excluded_names:
                print(f"Error: '{user_input}' is already taken. Please choose a different name.")
            return user_input

        # Validate specific integer choices
        elif input_type == "int":
            if user_input.isdigit():  # Check if input is a valid integer
                num = int(user_input)
                if allowed_options is None or num in allowed_options:
                    return num
                else:
                    print(f"Error: {num} is not an allowed option. Allowed options: {allowed_options}")
            else:
                print("Error: Please enter a valid integer.")

        # Validate choice input (specific strings or numbers)
        elif input_type == "choice":
            if allowed_options and user_input in map(str, allowed_options):
                return int(user_input) if user_input.isdigit() else user_input
            else:
                print(f"Error: '{user_input}' is not a valid choice. Allowed options: {allowed_options}")

        # Validate positive integers
        elif input_type == "positive_int":
            if user_input.isdigit() and int(user_input) > 0:
                return int(user_input)
            else:
                print("Error: Please enter a positive integer.")

        else:
            print("Error: Invalid input type specified. Please check the function arguments.")

def roll_dice(num_dice):
    """Roll a specified number of dice and return the result."""
    return [random.randint(1, 6) for _ in range(num_dice)]

def calculate_score_recursive(dice, descriptions=None, scoring_combinations=None, current_score=0, used_dice=()):
    """Recursively calculate all valid scoring combinations, eliminating duplicates during computation."""
    if scoring_combinations is None:
        scoring_combinations = []
    
    if descriptions is None:
        descriptions = ()
    
    counts = {i: dice.count(i) for i in range(1, 7)}
    added_combinations = set()  # Keep track of added combinations to prevent duplicates
    
    # Check for a straight (run)
    if all(counts[i] >= 1 for i in range(1, 7)):
        straight_run = tuple(range(1, 7))
        remaining_dice = dice[:]  # Copy the dice list to modify
        for num in range(1, 7):
            remaining_dice.remove(num)  # Remove one occurrence of each number in the straight
        key = (current_score + 1500, descriptions + ("1-6 (1500)",), used_dice + straight_run, tuple(remaining_dice))
        if key not in added_combinations:
            scoring_combinations.append(key)
            added_combinations.add(key)
            # Recurse with leftover dice after the straight
            calculate_score_recursive(remaining_dice, key[1], scoring_combinations, key[0], key[2])
    
    # Check for triples or more
    for num, count in counts.items():
        if count >= 3:
            if num == 1:
                # Special rule for 1's
                for n in range(3, count + 1):
                    if n == 3:
                        points = 1000
                    elif n == 4:
                        continue
                    elif n >= 5:
                        points = 1000 + (n - 4) * 1000  # Add 1000 for each additional die after 3
                    remaining_dice = dice[:]
                    for _ in range(n):
                        remaining_dice.remove(num)
                    key = (current_score + points, descriptions + (f"{n} {num}'s ({points})",), used_dice + tuple([num] * n), tuple(remaining_dice))
                    if key not in added_combinations:
                        scoring_combinations.append(key)
                        added_combinations.add(key)
                        calculate_score_recursive(remaining_dice, key[1], scoring_combinations, key[0], key[2])
            else:
                # General rule for other numbers
                if count >= 4:
                    for n in range(4, count + 1):
                        points = 1000 + (n - 4) * 1000  # Add 1000 for each additional die after 4
                        remaining_dice = dice[:]
                        for _ in range(n):
                            remaining_dice.remove(num)
                        key = (current_score + points, descriptions + (f"{n} {num}'s ({points})",), used_dice + tuple([num] * n), tuple(remaining_dice))
                        if key not in added_combinations:
                            scoring_combinations.append(key)
                            added_combinations.add(key)
                            calculate_score_recursive(remaining_dice, key[1], scoring_combinations, key[0], key[2])
                # Rule for exactly 3 of a kind
                if count >= 3:
                    points = num * 100 if num != 1 else 1000  # Score for three of a kind
                    remaining_dice = dice[:]
                    for _ in range(3):
                        remaining_dice.remove(num)
                    key = (current_score + points, descriptions + (f"3 {num}'s ({points})",), used_dice + tuple([num] * 3), tuple(remaining_dice))
                    if key not in added_combinations:
                        scoring_combinations.append(key)
                        added_combinations.add(key)
                        calculate_score_recursive(remaining_dice, key[1], scoring_combinations, key[0], key[2])
    
    # Check for single 1's and 5's
    for num in [1, 5]:
        for _ in range(counts[num]):
            points = 100 if num == 1 else 50
            remaining_dice = dice[:]
            remaining_dice.remove(num)
            key = (current_score + points, descriptions + (f"{num} ({points})",), used_dice + (num,), tuple(remaining_dice))
            if key not in added_combinations:
                scoring_combinations.append(key)
                added_combinations.add(key)
                calculate_score_recursive(remaining_dice, key[1], scoring_combinations, key[0], key[2])
    
    # Remove duplicates
    unique_combinations = []
    seen = set()
    for combo in scoring_combinations:
        # Sort descriptions and used dice to ensure uniqueness
        combo_key = (combo[0], tuple(sorted(combo[1])), tuple(sorted(combo[2])), combo[3])
        if combo_key not in seen:
            seen.add(combo_key)
            unique_combinations.append(combo)
    
    # Sort by score in descending order
    unique_combinations.sort(key=lambda x: -x[0])
    return unique_combinations

def display_scoring_options(scoring_combinations):
    """Display the scoring options to the user."""
    print("\nScoring options:")
    for i, (points, desc, used_dice, remaining_dice) in enumerate(scoring_combinations):
        print(f"{i + 1}: Score {points} pts, Scoring dice: [{', '.join(desc)}], Free dice: {len(remaining_dice)}")
        #print(f"{i + 1}: Score {points} pts, Scoring dice: {used_dice}, Free dice: {len(remaining_dice)}")

def fix_order(player_order):
    """
    Fixes any invalid order where ties don't push subsequent players' orders forward.

    Args:
        player_order (dict): Players as keys, order as values.

    Returns:
        dict: Updated player_order with ties resolved properly.
    """
    max_rank = len(player_order)  # Ensure max rank covers all players
    player_order = player_order.copy()  # Work on a copy to avoid modifying the original dictionary

    for rank in range(1, max_rank + 1):
        # Get all players with the current rank
        players_at_rank = [player for player, order in player_order.items() if order == rank]

        # If there are multiple players at the same rank, adjust subsequent ranks
        if len(players_at_rank) > 1:
            # Calculate the number of skipped ranks
            skipped_ranks = len(players_at_rank) - 1

            for player, order in player_order.items():
                if order > rank:  # Increment ranks for players ranked higher
                    player_order[player] += skipped_ranks

    return player_order

def rank_increments(rolls):
    """
    Calculate rank increments based on the rolls. Players with the same roll will have the same rank increment.

    Args:
        rolls (dict): Players as keys, dice rolls as values.

    Returns:
        dict: Players with their rank increments.
    """
    # Sort players by their rolls in descending order (higher roll goes first)
    sorted_rolls = sorted(rolls.items(), key=lambda x: x[1], reverse=True)

    # Initialize increments and track rank increments
    increments = {}
    current_increment = 0

    for i, (player, roll) in enumerate(sorted_rolls):
        # If it's the first player or not tied with the previous, increment rank
        if i > 0 and sorted_rolls[i - 1][1] != roll:
            current_increment += 1
        increments[player] = current_increment  # Assign increment to player

    return increments

def roll_for_position(player_order, choice):
    """
    Resolve ties in player_order based on the choice.
    If choice == 1: Resolve all ties in the player order.
    If choice == 2: Resolve ties only for first place.

    Args:
        player_order (dict): Players as keys, order as values (1 = first place, etc.).
        choice (str): 1 to resolve only first place ties, 2 to resolve all ties.

    Returns:
        dict: Updated player_order with ties resolved.
    """
    # Fix invalid input order first
    player_order = fix_order(player_order)

    # Group players by their order values
    order_groups = {}
    for player, order in player_order.items():
        order_groups.setdefault(order, []).append(player)

    # Process each group
    for order_value, group in sorted(order_groups.items()):
        if choice == 2 and order_value != 1:
            continue  # Skip non-first-place groups for choice == 1
        
        if order_value == 1:
            order_string = '1st'
        elif order_value == 2:
            order_string = '2nd'
        elif order_value == 3:
            order_string = '3rd'
        elif order_value >= 4:
            order_string = '4th'
        
        if len(group) > 1:  # Tie detected
            print(f"\nRolling for play position among players for {order_string} place: {', '.join(group)}")
            # Roll dice for tied players
            rolls = {player: roll_dice(1)[0] for player in group}
            for player, roll in rolls.items():
                print(f"{player} rolled: {roll}")
            
            # assign ranks based on rolls
            rank_incs = rank_increments(rolls)
            
            # increment rank
            for player, rank_inc in rank_incs.items():
                player_order[player] += rank_inc
            
            # now return
            return roll_for_position(player_order, choice)
    
    return player_order

def determine_order(players):
    """
    Determine the playing order.
    Args:
        players (list): List of player names.

    Returns:
        list: Ordered list of player names.
    """
    if len(players) >= 3:
        print("\nHow do you want to determine the playing order?")
        print("  (1) Randomize the order completely")
        print("  (2) Roll dice to determine who goes first (otherwise, order is given by player input order)")
        choice = get_input("Enter your choice (1/2): ", input_type = "choice", allowed_options = [1, 2])
    else:
        choice = 2

    # Initialize all players to first order
    player_order = {player: 1 for player in players}

    # Resolve ties and determine the order
    player_order = roll_for_position(player_order, choice)

    # If choice == 1, identify the first place player and cycle the rest
    if choice == 2:
        sorted_players = sorted(player_order.items(), key=lambda x: x[1])
        first_place_player = sorted_players[0][0]
        original_order = dict(zip(players, list(range(len(players)))))
        first_place_original_rank = original_order[first_place_player]
        after1 = [player for player in players if original_order[player] > first_place_original_rank]
        after2 = [player for player in players if original_order[player] < first_place_original_rank]
        final_order = [first_place_player] + after1 + after2
    
    # If choice == 2, return players in the order given by roll_for_position
    elif choice == 1:
        final_order = [player for player, _ in sorted(player_order.items(), key=lambda x: x[1])]

    else:
        raise ValueError("Invalid choice. Must be '1' or '2'.")

    #print("\nFinal playing order:")
    #print(" -> ".join(final_order))
    return final_order

def display_scores(scores, exclude = None):
    """Display the current game scores."""
    if exclude is None:
        print("\n=== Current Scores ===")
    else:
        print("Opponent Scores:")
    for player, score in scores.items():
        if player != exclude:
            print(f"{player}: {score}")
    print("======================")

def player_turn(player_name, scores, locked_points=0, inherited_score=0, free_dice=None):
    """Simulate a single player's turn."""
    current_score = scores[player_name]
    
    if free_dice is None:
        free_dice = 10

    turn_score = inherited_score  # Start with inherited score
    print(f"\n{player_name}'s turn! Current score: {current_score}")
    
    while True:
        print(f"\nInherited score: {inherited_score}")
        print(f"Locked points: {locked_points}")
        print(f"Current turn score (not locked): {turn_score}")
        
        dice = roll_dice(free_dice)
        print(f"\n\t\t{player_name} Rolled: {sorted(dice)}")

        scoring_combinations = calculate_score_recursive(dice)
        if not scoring_combinations:
            print("Zilch! No scoring dice. Turn ends.")
            return locked_points, True, 10  # turn_score, zilched, remaining_free_dice
        
        display_scoring_options(scoring_combinations)  # Show options before the prompt
        scoring_choice = None
        while scoring_choice is None:
            scoring_choice = get_input("\nSelect a scoring option (enter number): ", input_type = 'choice', allowed_options = list(range(1, len(scoring_combinations)+1))) - 1
            if scoring_choice >= len(scoring_combinations) or scoring_choice < 0:
                print("Invalid scoring choice")
                scoring_choice = None
        selected_points, selected_description, selected_scoring_dice, remaining_dice = scoring_combinations[scoring_choice]
        turn_score += selected_points
        free_dice = len(remaining_dice)
        
        if free_dice > 0:
            print("\n==== Turn Summary ====")
            print(f"Selected scoring option adds {selected_points} points. Remaining free dice: {free_dice}.")
            print(f"If you end your turn now, you will have {current_score + locked_points + turn_score} total points.")
            print(f"If you roll and Zilch, you will then have {current_score + locked_points} total points.")
            display_scores(scores, exclude = player_name)
        else:
            print("\n==== Turn Summary ====")
            print("Congrats, you locked!")
            print(f"You now have {current_score + locked_points + turn_score} total points.")
            display_scores(scores, exclude = player_name)
        
        if free_dice == 0:
            print("\nAll dice used! Rolling all 10 dice again.")
            free_dice = 10
            locked_points += turn_score  # Secure the score
            inherited_score = 0  # Clear inherited points
            turn_score = 0 # clear turn_score: it's only for unlocked points
        else:
            print("\nOptions:")
            print(f"  (1) Roll {free_dice} free dice (risking {turn_score} points)")
            print("  (2) End turn and bank score")
            next_choice = get_input("Choose an option (1/2): ", input_type = 'choice', allowed_options = [1, 2])
            if next_choice == 2:
                print(f"{player_name} ends their turn and banks {turn_score} points.")
                return locked_points + turn_score, False, free_dice  # turn_score, zilched, remaining_free_dice

def main():
    print("Welcome to Zilch!")
    num_players = get_input("Enter the number of players: ", input_type = 'positive_int')
    players = []
    for i in range(num_players):
        new_player = get_input(f"Enter name for Player {i + 1}: ", input_type = 'string', excluded_names = players)
        players.append(new_player)
    players = determine_order(players)

    print("\nPlaying order:")
    print(" -> ".join(players))

    scores = {player: 0 for player in players}
    target_score = 20000
    final_round = False
    inherited_score = 0
    free_dice = 10  # Number of free dice to roll at the start of each turn
    
    # ordered dict for having played final turn
    played_final_turn = dict(zip(players, [False for x in range(len(players))]))
    
    while sum(played_final_turn.values()) < len(players):
        for player in players:
            # break if the player has already reached the end
            if played_final_turn[player] == True:
                break
            
            display_scores(scores)
            print(f"\n{player}'s turn! (Current score: {scores[player]})")
            
            # Handle inherited score and free dice logic
            if inherited_score > 0:
                print("You may choose to build on the previous player's score.")
                choice = get_input(f"Would you like to (1) roll all 10 dice or (2) build on the previous score of {inherited_score} by rolling {free_dice} free dice? ", input_type = 'choice', allowed_options = [1, 2])
                if choice == 1:
                    # Reset to rolling all 10 dice
                    inherited_score = 0
                    free_dice = 10
                elif choice == 2:
                    print(f"Building on inherited score of {inherited_score}.")
                else:
                    print("Invalid choice. Rolling all 10 dice by default.")
                    inherited_score = 0
                    free_dice = 10
            else:
                get_input("Press Enter to begin your turn...", allow_enter=True)
            
            turn_score, zilched, remaining_free_dice = player_turn(player, scores, locked_points=0, inherited_score=inherited_score, free_dice=free_dice)
            
            if zilched:
                print(f"{player} has Zilched!")
                get_input("Press Enter to end your turn...", allow_enter=True)
                inherited_score = 0
                free_dice = 10  # Reset for the next player
            else:
                print(f"{player} earned {turn_score} points this turn.")
                inherited_score = turn_score  # Keep points as inherited if the turn continues
                free_dice = remaining_free_dice  # Update free dice count for the next turn
                print(f"{player} did not roll {free_dice} free dice.")
            
            # Check if this player reaches the target score
            scores[player] += turn_score
            if scores[player] >= target_score and final_round == False:
                final_round = True
                print('\n' + 50 * '#' + '\n')
                print(f"{player} has reached {target_score} points! Final round begins.")
                print('\n' + 50 * '#' + '\n')
            
            # if final round has occured, make sure to adjust played_final_turn
            if final_round == True:
                played_final_turn[player] = True
    
    display_scores(scores)
    winner = max(scores, key=scores.get)
    print(f"\nCongratulations, {winner}! You are the winner with {scores[winner]} points!")

if __name__ == "__main__":
    main()


