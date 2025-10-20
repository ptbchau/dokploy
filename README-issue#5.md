## OCI runtime exec failed with Docker Compose volume mounts

### Why this bug happens (beginner-friendly)
- When you open a terminal for a running container, the app runs a command like `docker exec -it <container> <shell>` to start an interactive shell inside the container.
- Your Compose app uses volume mounts. Mounts can replace or hide folders in the container. If Docker tries to start the shell in a default working directory that doesn’t exist anymore (or isn’t valid due to the mount), the process cannot start.
- Because our command does not set an explicit working directory, Docker guesses one. With mounts, that guess can be wrong, leading to:
  - “OCI runtime exec failed: exec failed: unable to start container process”.
- Fix conceptually: tell Docker exactly where to start using `-w <dir>` (for example, `-w /app`), and ensure that directory exists inside the container.

### Refresher: working directory, docker exec, and volumes
- Working directory: the “current folder” where commands run by default (set by Dockerfile `WORKDIR` or Compose `working_dir`). If it doesn’t exist at runtime, starting a process there can fail.
- `docker exec`: runs a new process inside an already-running container. Use `-w <dir>` to force a safe starting folder.
- Volumes: attach storage at a specific path inside the container. After mounting, that path shows the volume’s content (which may be empty or missing expected subfolders), potentially invalidating the default working directory.

### Where the bug is in the code
There are two places that construct `docker exec` commands without `-w` (working directory):

1) Live terminal WebSocket (used by the UI “open terminal”)

```52:62:/home/cp/git/dokploy/apps/dokploy/server/wss/docker-container-terminal.ts
conn
  .once("ready", () => {
    conn.exec(
      `docker exec -it ${containerId} ${activeWay}`,
      { pty: true },
      (err, stream) => {
        if (err) throw err;
```

```106:112:/home/cp/git/dokploy/apps/dokploy/server/wss/docker-container-terminal.ts
} else {
  const shell = getShell();
  const ptyProcess = spawn(
    shell,
    ["-c", `docker exec -it ${containerId} ${activeWay}`],
    {},
  );
```

What it does (in plain English):
- Builds a command like `docker exec -it <containerId> bash` (or `sh`).
- `activeWay` is the shell choice from the UI.
- It does not set a working directory, so Docker picks a default that may be invalid when volumes are mounted.

2) Scheduled command execution (background jobs that also `exec` into containers)

```66:73:/home/cp/git/dokploy/packages/server/src/utils/schedules/utils.ts
set -e
echo "Running command: docker exec ${containerId} ${shellType} -c '${command}'" >> ${deployment.logPath};
docker exec ${containerId} ${shellType} -c '${command}' >> ${deployment.logPath} 2>> ${deployment.logPath} || { 
  echo "❌ Command failed" >> ${deployment.logPath};
  exit 1;
}
echo "✅ Command executed successfully" >> ${deployment.logPath};
```

```82:89:/home/cp/git/dokploy/packages/server/src/utils/schedules/utils.ts
writeStream.write(
  `docker exec ${containerId} ${shellType} -c ${command}\n`,
);
await spawnAsync(
  "docker",
  ["exec", containerId, shellType, "-c", command],
  (data) => {
```

What it does (in plain English):
- Runs `docker exec <containerId> <shell> -c '<command>'` to execute a command inside the container.
- Again, no `-w` flag, so there is no guaranteed working directory.
- With mounted volumes, the default working directory might be missing/invalid, causing the same OCI runtime failure.

### Summary
- Root cause: `docker exec` is called without an explicit working directory. With volume mounts, the default working directory may no longer exist or be appropriate, so the runtime cannot start the process.
- Impact: Opening terminals or running scheduled commands in containers with volume mounts can fail with “OCI runtime exec failed”.
- Directional fix: Add `-w <known-existing-path>` (e.g., `-w /app`) to all `docker exec` invocations and ensure that directory exists in the container. Ideally, make the working directory configurable and derived from the service’s `working_dir` when available.


### Fix options and trade-offs

1) Where to get the working directory for `docker exec`?

- a) Inspect the running container and use `Config.WorkingDir`
  - Pros:
    - Reflects the actual runtime state (after entrypoint/ENV are applied).
    - Works even if Compose metadata is stale or missing.
  - Cons:
    - Requires an extra Docker inspect call (adds latency and complexity).
    - If `WorkingDir` is empty, we still need fallback logic.
    - May not reflect intended directory if entrypoint dynamically changes it.

- b) Use Compose service’s `working_dir` if present; fallback to container inspect
  - Pros:
    - Honors user-declared intent from Compose (predictable, visible in config/UX).
    - Still robust when Compose lacks `working_dir` (fallback to real runtime state).
    - Good usability: aligns terminal defaults with Compose configuration.
  - Cons:
    - Requires mapping container → Compose service reliably.
    - Two sources of truth (Compose vs runtime) can diverge; must define precedence.

- c) Always default to `/app`
  - Pros:
    - Very simple; no extra lookups or Docker API calls.
    - Easy to reason about and document.
  - Cons:
    - Often wrong for non-`/app` images (databases, Nginx, etc.).
    - Still needs fallback if `/app` does not exist.
    - Can surprise users; not aligned with Compose config.

2) If the chosen working directory doesn’t exist at runtime

- a) Fallback to `/` (root)
  - Pros:
    - Always exists; minimizes hard failures and unblocks the terminal.
    - Least surprising across all images.
  - Cons:
    - Not necessarily where app files live; user lands in a generic place.
    - Should show a friendly notice (e.g., “Dir missing, fell back to `/`”).

- b) Fallback to `/app`
  - Pros:
    - Common, sensible default for many application images.
  - Cons:
    - Not universal; may still be missing or irrelevant for infra images.
    - Adds bias toward webapp-style containers.

- c) Fail with a clear error message
  - Pros:
    - Makes misconfiguration obvious; encourages fixing Compose or image config.
    - Avoids silent surprises about the actual working directory used.
  - Cons:
    - Worse UX for quick access; blocks terminal entirely.
    - Higher support burden if users don’t know which directory to choose.

Recommendation:
- Use (1b) (prefer Compose `working_dir`, else container `Config.WorkingDir`) for correctness + UX.
- Combine with (2a) if neither exists, fallback to `/` to avoid blocking users, and show a brief notice (e.g., “Working directory ‘/foo’ not found; fell back to ‘/’.”).


### Plan to fix the bug

Goal:
- Ensure all `docker exec` invocations run with a valid working directory to avoid OCI runtime errors when volume mounts are present.

Approach (recommended):
- Prefer the Compose service `working_dir` when available.
- Else, read the container’s `Config.WorkingDir` via `docker inspect` (remote or local as applicable).
- If neither yields a usable value, fallback to `/` and surface a short notice.

Files to update:
- `apps/dokploy/server/wss/docker-container-terminal.ts`
- `packages/server/src/utils/schedules/utils.ts`
- (New) `packages/server/src/utils/docker/exec.ts` (helper to resolve working directory)

Changes:
1) Add helper: resolve working directory
   - Create `packages/server/src/utils/docker/exec.ts` with:
     - `resolveWorkingDirectory({ containerId, serverId, composeWorkingDir }): Promise<string>`
       - If `composeWorkingDir` truthy → return it
       - Else run `docker inspect --format '{{.Config.WorkingDir}}' <containerId>`
         - Remote: wrap with existing `execAsyncRemote(serverId, ...)`
         - Local: use existing spawn/exec helpers
       - If result empty → return `/`

2) Use -w in terminal websocket (local and SSH)
   - In `docker-container-terminal.ts`:
     - Before building `docker exec`, call `resolveWorkingDirectory(...)`.
     - Build command: `docker exec -it -w "${workdir}" ${containerId} ${activeWay}`.
     - Optional soft fallback: if exec immediate error occurs, re-exec once with `-w /` and send a short note to client.

   Example (concise):
   - From: `docker exec -it ${containerId} ${activeWay}`
   - To: `docker exec -it -w "${workdir}" ${containerId} ${activeWay}`

3) Use -w in schedule execution (remote and local)
   - In `packages/server/src/utils/schedules/utils.ts`:
     - Resolve `workdir` (schedules may not have Compose metadata; use inspect).
     - Remote branch:
       - From: `docker exec ${containerId} ${shellType} -c '${command}'`
       - To: `docker exec -w "${workdir}" ${containerId} ${shellType} -c '${command}'`
     - Local branch:
       - From: `["exec", containerId, shellType, "-c", command]`
       - To: `["exec", "-w", workdir, containerId, shellType, "-c", command]`

4) Optional: accept `workdir` from UI
   - Extend terminal WebSocket query with optional `workdir`.
   - If provided, prefer it (still fallback to `/` if empty/missing).

Testing:
- Compose app with named + bind mounts; test with and without `working_dir`.
- Verify:
  - Terminal opens without OCI error; `pwd` matches expected dir or `/` when missing.
  - Schedules run with `-w`; commands using relative paths succeed.
- Regression: terminal for containers without mounts still works.

Rollout:
- Low risk; changes isolated to `docker exec` call sites.
- Log a one-line notice on fallback to `/` for observability.

Follow-ups (optional):
- Surface the resolved working directory in the UI when opening the terminal.
- Add an e2e test asserting terminal opens with mounts present.


