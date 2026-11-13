# Crypto Futures Intelligence Scanner (analysis only)

Last updated: Nov 12, 2026. Keep this file current whenever a rule version, file, or schedule changes.

## What this project is

A free, self-built market scanner for a New York based, non-programmer trader. It reads public market data, records its own minute-by-minute history, flags candidates with the reason shown, and replays its own past signals to test whether they work. It does not trade. The goal is a tool the user owns and improves over time, trusted only after it passes pre-written tests.

## Working rules for Claude (read first)

- **Analysis only.** Never place trades, never ask for exchange API keys, passwords or withdrawal/trading permissions, never run anything that moves money.
- **Never fabricate data.** Always name the source (Bitnomial or Kraken), show LIVE or STALE, and stop showing signals when data is stale or unavailable.
- **Bybit is restricted for US users.** Do not use Bybit data and do not suggest VPNs or workarounds. The user trades on Bybit and views TradingView charts. Our prices differ slightly from Bybit (about 0.2% on Bitcoin), so levels must be checked against the user's own chart.
- **Be honest about results.** So far no signal beats costs. Do not oversell, do not call anything profitable without a passed test, and say plainly when a sample is too small.
- **Frozen rules.** `rules.js` (radar, version v1.1.1) and `futrules.js` (scoreboard, version f2) are frozen. Do not change any number without a new version label and a new test start time. Tune nothing based on results already seen.
- **Fix design flaws, not results.** A change is allowed only if it fixes a clear bug or design flaw, gets a new version label, is committed, and its commit time becomes the new test start.
- **How to work with the user.** Plain simple language, one step at a time, wait for them to finish each step, give complete code and say exactly where it goes. Free tools preferred, but the user has said they do not mind paying for the Cloudflare $5/month plan when storage requires it (tell them when). They now work mostly from a Windows laptop, and sometimes an iPhone.
- **Edit safely.** Give whole-file replacements, not one-line edits. A hand edit once deleted a setting (watchMinUsd24) and silently turned the Watch tier off for three days.
- **Context for the user:** they have day traded for years without success, tend to chase pumped coins, and use too much leverage and size. The scanner's tested value so far is the "do not chase" warning. Encourage paper trading first, small size, low or no leverage, and a trade journal. Do not give financial advice or tell them what to trade.

## Architecture (all free so far)

- **Data:** Bitnomial public API (CFTC-regulated, US-legal perpetuals) and Kraken public API (spot).
- **Recorders:** a Cloudflare Worker named `scanner-relay`, with a cron trigger every minute (`* * * * *`). It saves a snapshot of Bitnomial perpetuals (futures recorder) and Kraken USD spot pairs (radar recorder) into Cloudflare D1 databases.
- **Pages:** static HTML in this public GitHub repo, hosted with GitHub Pages at https://tanbiream.github.io/Crypto-Scanner/ . Pages read the Worker. Everything in this repo is public, so never put secrets here.
- **Worker URL:** https://scanner-relay.tanbir-eam-6ff.workers.dev (currently allows any website to read it; data is public and read-only).
- **Edit locations:** Worker code in Cloudflare (Workers & Pages, scanner-relay, Edit code). Pages in GitHub (open file, pencil icon, commit; commits can take 1 to 3 minutes to appear).

## Databases

| Database | Worker binding | Holds | Notes |
| --- | --- | --- | --- |
| scanner-db | `DB` | `snapshots` (futures, kept 60 days) and old `radar` rows (Nov 2 to about Nov 8) | About 371 MB of 500 MB on Nov 12 |
| scanner-db2 | `DB2` | `radar` rows from Nov 12 on, liquid coins only (24h volume of $40K or more) | About 19 MB per day |

Free Cloudflare limits: 500 MB per database, 10 databases and 5 GB per account, 100K rows written per day, 10 ms CPU per Worker run. Paid ($5/month) raises each database to 10 GB. `/db/size` and `health.html` show usage (yellow at 80%, red at 92%).

Data formats:
- Futures row: `[product_id, mark_price, last_price, last_price_time, volume, open_interest, funding_rate]`. Mark price, volume, open interest, funding update only at daily settlement. Last price and last-trade time are live.
- Radar row: `[pair, last, volume_today, volume_24h, 0, open]` (the fifth field is unused). Kraken daily counters reset at 00:00 UTC.

## Pages in the repo

| File | Purpose |
| --- | --- |
| `index.html` | Futures scanner: last-trade price, trend, RSI, trades per hour, daily open interest |
| `scores.html` | LONG/SHORT scoreboard (rules f2), market-wide banner, reference levels |
| `radar.html` | Pump Radar: Flagged, Watch, Pullback guide, All coins (rules v1.1.1) |
| `review.html` | Replays radar flags, Watch entries and pullback setups, with written pass/fail bars |
| `scorereview.html` | Replays LONG/SHORT leans, with written pass/fail bar |
| `health.html` | Recorder lights, storage meters, links |
| `journal.html` | Trade journal (saved in the browser only; export backups) |
| `gaps.html` | Lists missing recorder minutes |
| `rules.js`, `futrules.js` | Frozen rulebooks shared by the pages |
| `diag.html`, `diag2.html`, `charts.html` | Old test pages, ignore |

## Worker routes (all read-only)

`/recorder/status`, `/recorder/history`, `/recorder/range` (futures); `/radar/status`, `/radar/history`, `/radar/range` (radar, reads both databases and merges); `/db/size`; `/recorder/run`, `/radar/run` (manual test recordings); `/kraken/...` (pass-through to Kraken public API); everything else passes through to Bitnomial (`/product/data/`, `/product/specs/`, `/web/...`).

## Frozen rules (summary)

**Radar rules v1.1.1 (test start Nov 2, 2026, 1:21 PM ET):** liquidity floors $50K / $250K Watch / $500K pullback; main flags need 3x normal volume and $10K in the last 5 minutes; breakout or breakdown needs 0.5% beyond the 1-hour high or low; extended is over 12% in 15 minutes; do-not-chase warning at 12% in 1 hour or 30% today; Watch is 1.5x to 3x volume with quiet price (under 2% in 15 minutes, under 4% in 1 hour, 1-hour range 6% or less) pressing the high or low; Watch success is a 5% move in the watched direction within 3 hours versus random coins; pullback zone is the 38.2% to 61.8% retracement, invalid beyond 78.6%.

**Scoreboard rules f2 (test start about Nov 2, 2026, 1:40 PM ET):** score points for trend size (30), timeframe agreement (25), momentum (25), structure (20), minus chase penalties (10 for 1 hour, 10 for 3 hours, 5 for loaded history); lean needs a score of 60 and a 25-point lead; coins with under 10 trades seen in 1 hour or no trade in 5 minutes are not scored; reference levels only when the first target is at least 2x an assumed 0.5% cost.

## Testing plan and pass/fail bars (written in advance)

- Checkpoint Mon Nov 16 (quick look only), **first real read Mon Nov 23**, second read about Dec 7. Moved from Nov 16 / Nov 30 after the Nov 8 to 12 recorder outage (database full, about 3.5 days of data lost).
- Do not re-run reviews and read results between scheduled reads.
- **Watch** (each direction): 50 or more completed entries over 20 or more distinct hours; hit rate at least 1.5x random coins; average move in the direction after 1.0% cost above zero and above the random-coin average; above zero in both halves.
- **Pullback:** 50 or more completed setups over 7 or more days; waiting beats chasing and is above zero per setup after cost; above zero in both halves.
- **Score leans:** 1-hour hold, 0.5% cost, 50 or more events over 20 or more hours, above zero after cost, beats baseline, above zero in both halves. Market-wide leans are shown separately from the rest.
- Meeting a bar is still not proof. The earliest point to consider tiny real-size trading is mid December, and only if tests pass.

## Results so far (Nov 5, three days after freeze, not final)

Watch finds volatile coins, not direction. Chasing pumped coins lost about 7.9% after cost on average (44 setups), waiting for the pullback zone lost about 3.1% per setup, no main flag was positive after a 1.0% cost.

## Known pitfalls

- File names are lowercase and exact. A capital letter or a missing file gives a 404.
- Browsers cache pages. Add `?v=2` to the address or press Ctrl+Shift+R.
- "Rules is not defined" means `rules.js` is missing or has a syntax error.
- Both recorders going red together means a shared cause (schedule, Cloudflare, or the database size limit). Check the Worker's Observability logs.
- Storage plan: radar writes go to `DB2`, so `DB` now holds futures plus the old radar archive. `DB` fills around Dec 5 and `DB2` around Dec 8 at current rates. Free space (for example delete the old radar archive after the second test read), rotate to a new database, or upgrade before either reaches about 450 MB.

## Not built yet (wait for test results)

One-coin "Scan" screen, observed hit-rate display, phone alerts (ntfy or Telegram sent from the Worker), paper-trade tracker with fees and slippage, market-context filter, tightening the Worker's allowed origins, live trade-by-trade data. A hypotheses list was offered and the user declined it.
