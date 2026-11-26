# Dataset reference

`backend/data/espn_snapshot/` contains the real dataset that ships with the repository. Each table is stored as a gzipped CSV file; `manifest.json` lists row counts and SHA-256 checksums of the uncompressed CSV content. Files are written with a fixed gzip timestamp, so re-exporting unchanged data produces identical files.

Source: ESPN's public site API (`https://site.api.espn.com/apis/site/v2/sports/basketball/...`), no key required. The API is unofficial and undocumented.

| Endpoint | Used for |
|---|---|
| `{nba,mens-college-basketball}/scoreboard?dates=YYYYMMDD` | Schedule, status, live and final scores by period, DraftKings opening and current lines (college: `groups=50&limit=400` for all of Division I) |
| `.../summary?event={id}` | Team box scores, NBA player box scores, closing line (`pickcenter`) |
| `mens-college-basketball/teams?groups=50&limit=400` | The 365 Division I programs (games against non-Division I opponents are skipped) |
| `nba/injuries` | NBA injury report |
| core API `leagues/nba/events/{id}/competitions/{id}/odds/100/propBets` | DraftKings player props (points, rebounds, assists, threes, PRA), first-half totals and team totals; opening and current values |
| `nba/teams/{id}/roster` | Current NBA rosters with jersey numbers |

Coverage: NBA 2024-25, 2025-26 and 2026-27 to date (regular season, play-in and playoffs; preseason and All-Star games excluded), and Division I men's basketball 2025-26 and 2026-27 to date. Sportsbook lines are DraftKings as reported by ESPN; ESPN has none for the 2024-25 NBA season and the first weeks of 2025-26. Opening and closing lines carry no timestamp and are recorded 24 hours and 5 minutes before tip-off.

Snapshot generated: 2026-11-26T15:42:54+00:00

| File | Rows | Restored by `load-snapshot` |
|---|---|---|
| `conferences.csv.gz` | 34 | yes |
| `teams.csv.gz` | 395 | yes |
| `sportsbooks.csv.gz` | 4 | yes |
| `players.csv.gz` | 766 | yes |
| `roster_memberships.csv.gz` | 539 | yes |
| `games.csv.gz` | 10,150 | yes |
| `team_game_stats.csv.gz` | 19,494 | yes |
| `player_game_stats.csv.gz` | 62,682 | yes |
| `injuries.csv.gz` | 114 | yes |
| `odds_snapshots.csv.gz` | 86,168 | yes |
| `prop_lines.csv.gz` | 22,885 | yes |
| `demo_outcomes.csv.gz` | 0 | yes |
| `assets.csv.gz` | 1,160 | yes |
| `predictions.csv.gz` | 17,050 | export only |
| `settlements.csv.gz` | 16,987 | export only |
| `model_versions.csv.gz` | 3 | export only |

## Tables

| Table | Description |
|---|---|
| `conferences` | NBA conferences and the 32 Division I conferences with a prior strength (points per 100 possessions vs Division I average; shrunk away as games are played) |
| `teams` | NBA franchises and Division I programs: abbreviation, location, nickname, conference, colors; `provider_ids.espn` holds the ESPN team id |
| `sportsbooks` | Sportsbook keys and display names |
| `players` | NBA players seen in box scores or on current rosters; `provider_ids.espn` holds the ESPN athlete id |
| `roster_memberships` | Player to team memberships with season, jersey number, source and verification time |
| `games` | Schedule and results: start time (UTC), teams, neutral site, status, score, first-half score, pre-game context (injury impact, lineup changes for upcoming games) |
| `team_game_stats` | Team box scores: points, first-half points, FGM/FGA, 3PM/3PA, FTM/FTA, offensive and defensive rebounds, turnovers, assists, possessions (FGA - ORB + TOV + 0.44 x FTA) |
| `player_game_stats` | NBA player game logs: minutes, points, rebounds, assists, threes, attempts, steals, blocks, turnovers |
| `injuries` | NBA injury reports with status and description; `cleared_at` is set when a player leaves the report |
| `odds_snapshots` | Timestamped lines: moneyline (`h2h`), spreads and totals, opening and every observed change through the close |
| `assets` | Team logo and player headshot URLs (ESPN CDN; not bundled) |
| `prop_lines` | DraftKings player prop lines (points, rebounds, assists, threes, PRA) with over and under prices; prices are approximate because ESPN does not label the sides |
| `demo_outcomes` | Used only by the synthetic dataset |
| `predictions` | Archived model forecasts with probability, line, price, result and model version |
| `settlements` | Grading records for predictions and picks |
| `model_versions` | Model registry with training window and evaluation metrics |

Column definitions match `backend/app/models.py`. Timestamps are ISO 8601 in UTC. JSON columns (`pregame_context`, `provider_ids`, `details`, `metrics`, `params`, `payload`) are stored as JSON strings.

## Commands

```bash
cd backend
python -m app.cli espn-backfill --league NBA --seasons 3   # load seasons from ESPN into the database
python -m app.cli espn-sync                                # refresh recent days, injuries, rosters
python -m app.cli export-snapshot [--dir PATH]             # database to a snapshot directory
python -m app.cli load-snapshot --dir data/espn_snapshot   # snapshot into an empty database (checksums verified)
```

When the API starts with `DATA_SOURCE=espn` and an empty database, it loads this snapshot automatically, syncs the days since it was taken, trains the models and rebuilds the prediction archive.

## Synthetic dataset

`backend/data/demo_snapshot/` holds a synthetic dataset generated by the league simulator (`backend/app/ml/synthetic.py`); every row is flagged `is_demo = true`. It is used by the test suite and by `DATA_SOURCE=demo`. It is not real data.
