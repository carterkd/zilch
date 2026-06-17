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

The shared-device mode works as a static site. Cross-device room-code play uses Firebase Realtime Database.
Room setup is designed around devices: each phone, tablet, or computer can bring one or more players into the room.
That keeps the normal pass-and-play table intact while allowing mixed setups, such as two players sharing one phone and another joining from a laptop.

Fill in `firebase-config.js` with the public Firebase web app values from your Firebase project.
The room UI can render backend state with `window.ZILCH_RENDER_ROOM_SNAPSHOT(snapshot)`, including read-only waiting views for players on other devices.

### Firebase Setup

Use the no-cost Firebase Spark plan.

1. Create a Firebase project in the Firebase console.
2. Add a web app to the project.
3. Create a Realtime Database for the project.
4. Copy the web app config into `firebase-config.js`.
5. Deploy the database rules:

```bash
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only database
```

The current `database.rules.json` is for a friendly beta: anyone can read/write room data if they can reach the database. Room codes are for convenience, not privacy.
