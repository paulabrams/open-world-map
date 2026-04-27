Start the Open World dev server (`tools/dev-server.mjs`) on port 8787 if it isn't already running.

1. **Check what's on port 8787.**

   ```sh
   lsof -nP -iTCP:8787 -sTCP:LISTEN
   ```

2. **Decide based on the result:**
   - If a `node` process running `tools/dev-server.mjs` is already listening, report `already running, PID=<pid>` and stop. Don't restart.
   - If a different process holds the port (e.g. `python3 -m http.server`), report which process is there with its PID and ASK the user whether to kill it. Do not kill without confirmation.
   - If the port is free, proceed.

3. **Start the dev server in the background.** Use the Bash tool with `run_in_background: true`:

   ```sh
   node tools/dev-server.mjs
   ```

   Note the background task ID so the user can `Read` the log file later if they want to inspect output.

4. **Wait briefly for it to bind, then health-check.** Sleep 1 second, then:

   ```sh
   curl -s http://localhost:8787/api/health
   ```

5. **Report status concisely:**
   - Port + URL (`http://localhost:8787/`)
   - `aiEnabled` from /api/health (true/false)
   - `backend` (claude-code / api / none)
   - The background task ID so the user can read its log via `cat /private/tmp/claude-501/<...>/<task-id>.output`

Keep the report short — one block, no narration.
