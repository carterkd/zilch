# Zilch

A browser version of Zilch using the rules from the Python simulator in this repo.

## Run Locally

Open `index.html` directly in a browser, or run:

```bash
./run_zilch_chrome.sh
```

The script starts a local static server and opens the game in Chrome.

## GitHub Pages

This is a static site. It can be hosted from the repository root with GitHub Pages.

## Online Rooms

The shared-device mode works as a static site. Cross-device room-code play needs a realtime backend.
Room setup is designed around devices: each phone, tablet, or computer can bring one or more players into the room.
That keeps the normal pass-and-play table intact while allowing mixed setups, such as two players sharing one phone and another joining from a laptop.

The current branch is prepared for Firebase Realtime Database config via `firebase-config.js`.
Copy `firebase-config.example.js` to `firebase-config.js` and fill in the Firebase web app values when ready.
