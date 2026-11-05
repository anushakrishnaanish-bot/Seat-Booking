# Project notes

- `index.html` provides semantic page structure and accessible seat/checkout controls; `styles.css` handles responsive layout, seat states, and light/dark themes.
- `event.json` holds event and seat data; `js/app.js` handles loading, rendering, keyboard interaction, and checkout.
- `js/seats.js` keeps seat selection, validation, and pricing logic pure; `tests/seats.test.js` tests it with Node's built-in test runner and `node:assert`.
- To run the application:
  1. Install Node.js if it is not already installed, then open PowerShell or a terminal.
  2. Change directory to the project folder containing `index.html` and `serve.mjs`.
  3. Start the dependency-free server with `node serve.mjs`.
  4. Wait for the message `Seat booking app available at http://127.0.0.1:5173/`.
  5. Open `http://127.0.0.1:5173/` in a browser; keep the terminal open while using the app.
  6. Stop the server with Ctrl+C in that terminal when finished.
- If port 5173 is occupied, start the server on another port: PowerShell: `$env:PORT=5174; node serve.mjs`; Command Prompt: `set PORT=5174 && node serve.mjs`. Open the URL printed by the server.
- Do not open `index.html` directly as `file://`; browsers block its JavaScript modules and `event.json` fetch for local-file origins.
- To run the business-logic tests, open a second terminal in the project folder and run `node --test tests/seats.test.js`.
- Keyboard checks: arrow navigation, row/column boundaries, one roving tab stop, Tab leaving the map, seat selection focus, and dialog Escape/focus behavior were exercised in-browser.
- Screen-reader checks: accessible names, live regions, validation alerts, and dialog labels were reviewed in the browser accessibility tree; no manual screen-reader session was run.
- Axe/Lighthouse: automated axe or Lighthouse audits were not run.
- With more time, I would run manual checks with NVDA and VoiceOver and automated axe/Lighthouse audits, then address any findings.
