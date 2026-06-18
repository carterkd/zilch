# Zilch AI Lab

This folder is a sandbox for building strong Zilch players without touching the website code.

The first serious bot here is `EVPolicy`: it enumerates possible dice rolls by count-vector, then uses cached expected-value search for the turn-level question:

- Which scoring option should I take?
- Should I roll the free dice again or bank?
- Should I build on the previous player's score or start fresh?

It uses the same scoring rules as the web game.

## Run

From the repo root:

```bash
python3 -m unittest discover ai_lab/tests
python3 -m ai_lab.experiments --games 2000 --players 2
python3 -m ai_lab.experiments --turn-table
```

The experiment runner uses a deterministic seed by default so results are repeatable while we iterate.

## Current Strategy Path

1. `EVPolicy` is the right first strong baseline. Zilch has a compact dice state space, so expected value beats guessing and is easier to trust than RL at the start.
2. Next, tune game-aware behavior around the 20,000 target, final-round pressure, and opponent scores.
3. After that, add self-play search/RL if it beats the EV baseline in large tournaments.

## Design Notes

- No third-party Python packages are required yet.
- The lab is intentionally separate from `zilch_simulator.py`, which is older interactive code.
- The simulator models the web game's current behavior: locking all dice forces another roll with locked points safe.
