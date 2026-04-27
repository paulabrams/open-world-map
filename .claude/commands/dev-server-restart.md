Restart the Open World dev server (`tools/dev-server.mjs`). Always kills the existing one first, even if it's healthy — used when code in `tools/dev-server.mjs` has changed and needs to take effect.

1. **Find any running dev-server.**

   ```sh
   pgrep -f "tools/dev-server.mjs" || true
   ```

2. **Kill it gracefully.** If a PID was returned:

   ```sh
   pkill -f "tools/dev-server.mjs"
   sleep 0.5
   ```

   Then re-check with `lsof -nP -iTCP:8787 -sTCP:LISTEN`. If something is still bound, escalate to `kill -9 <pid>`.

3. **Verify port 8787 is free.** If anything other than our own dev-server is on it (e.g. `python3 -m http.server`), STOP and report — don't kill non-dev-server processes without confirmation.

4. **Start fresh in the background.** Use the Bash tool with `run_in_background: true`:

   ```sh
   node tools/dev-server.mjs
   ```

5. **Health-check after a 1-second delay:**

   ```sh
   curl -s http://localhost:8787/api/health
   ```

6. **Report concisely:**
   - "Restarted." (or "Started." if nothing was running)
   - `aiEnabled` + `backend` from /api/health
   - The new background task ID
