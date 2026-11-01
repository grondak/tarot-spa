# Observation Window prototype (Release 0 self-test)

Throwaway. See [docs/observation-window-epic.md](../../docs/observation-window-epic.md).

**Question:** after a few weeks of my own feeds, does scrubbing them show me something I'd act on?

**Pass (decided 2026-10-31):** by Nov 21, I can name at least one moment where the window showed me a co-occurrence that changed what I'd do.

## Collector

- `npm install` once, then `npm run collect` to fetch every feed in `feeds.json`.
- Feed order is the ranking until stakes exist (F5). Edit `feeds.json` to add, remove, or reorder.
- Stores to `data/` (git-ignored): `items.json` (30 days of items), `counts.json` (daily count per source, kept after items expire), `runs.jsonl` (one line per run, so a collector outage is not mistaken for a quiet day).

## Scrubber

`npm run view`, then open http://127.0.0.1:5199. Drag the slider, click a dot to jump to it, "Go live" snaps back to now, "Play" runs the timeline forward. Hatched stretches are times the collector did not run. Hollow dots have an estimated date (the feed gave none). Stop the server with Ctrl+C.

## Run hourly on this Mac

```sh
cp com.oodadss.observation-collector.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.oodadss.observation-collector.plist
```

Check it: `launchctl list | grep observation-collector` (the middle column is the last exit code; 0 is good), and `tail data/collector.log`.

Stop it (pause, keeps the file so you can load it again):

```sh
launchctl unload ~/Library/LaunchAgents/com.oodadss.observation-collector.plist
```

Uninstall it (stop, then remove the installed copy; the project folder and your collected data stay):

```sh
launchctl unload ~/Library/LaunchAgents/com.oodadss.observation-collector.plist
rm ~/Library/LaunchAgents/com.oodadss.observation-collector.plist
```

To delete the data too, remove `data/` in this folder. The Mac sleeping leaves gaps, which `runs.jsonl` records.

## Not in the prototype

Sign-in, Amplify, injection, cases, stakes, cost caps, entities, map, and the tarot handoff.
