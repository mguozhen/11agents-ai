# launchd — autonomous swarm runs

`com.hunter.gtm-swarm.daily.plist` fires `scripts/run-all.sh` every day at 09:00 local time. Each built project's active agents produces one draft per run (topic chosen randomly from agent.yaml.topics).

## Install (one-time)

```bash
cp .github/launchd/com.hunter.gtm-swarm.daily.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.hunter.gtm-swarm.daily.plist
launchctl list | grep gtm-swarm
```

## Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.hunter.gtm-swarm.daily.plist
rm ~/Library/LaunchAgents/com.hunter.gtm-swarm.daily.plist
```

## Force-run for testing

```bash
launchctl kickstart -k gui/$(id -u)/com.hunter.gtm-swarm.daily
tail -f logs/launchd.out.log
```

## Schedule change

Edit `StartCalendarInterval` in the plist. Multiple times = `<key>StartCalendarInterval</key><array><dict>…</dict><dict>…</dict></array>`. Re-load after edit.

## What it does

Per run:
1. Walks `projects/*/` (skips `_*`)
2. Checks `.contentos-state.json` — only proceeds on `step 4: done`
3. For each `agents/<id>/agent.yaml`:
   - Skips if `activate: false`
   - Reads `topics:` array, picks one at random
   - Invokes `./scripts/run-agent.py <id> --project <slug> --topic "..."`
4. Logs to `logs/run-all-<ts>.log`

Drafts land in `agents/<id>/content-bank/draft/` and are symlinked into `reviews/<reviewer>/` per the agent's reviewer field.

The Iron Triangle still applies: nothing is published — Reviewer must approve via dashboard 审核 tab or `scripts/review-queue.sh approve`.
