# gradtrack

Track graduation requirements and ePortfolio progress from configurable sources
into a single-pane status site. Point gradtrack at your program's requirements
(in a config file) and, optionally, at where your evidence lives - a notes
vault, a GitHub account, a blog, a Canvas snapshot - and it builds a local
status page showing what's done, what's blocking, and which artifacts cover
which program competency.

Local-only and single-user: nothing is published unless you serve the built
site yourself.

## How it works

1. You describe your program in `gradtrack.config.json`: the requirements
   checklist, the program competencies, the graduation term, and which optional
   sources to read.
2. `gradtrack sync` reads every enabled source, computes a snapshot, and writes
   JSON the site renders.
3. `gradtrack build` produces a static site; `gradtrack serve` runs a dev server
   for live editing.
4. `gradtrack check <id> --status done` toggles requirement status, persisted to
   `~/.gradtrack/state.json`.

## Quick start

```bash
pnpm install
pnpm --filter ./site install

cp gradtrack.config.example.json gradtrack.config.json
# edit gradtrack.config.json for your program

pnpm dev doctor      # validate config + enabled sources
pnpm dev sync        # read sources, emit site data
pnpm dev build       # build the static site into site/dist/
pnpm dev serve       # OR run the dev server at http://localhost:4321
```

(`pnpm dev <cmd>` runs the CLI from source via tsx. After `pnpm build`, the
compiled binary is available as `gradtrack <cmd>`.)

Serve the built site with any static file server pointed at `site/dist/`, or use
`gradtrack serve` during editing.

## Configuration

gradtrack reads its config from the first of:

1. the `--config <path>` flag, or the `GRADTRACK_CONFIG` environment variable
2. `./gradtrack.config.json` in the current directory
3. `~/.config/gradtrack/config.json`

`gradtrack.config.example.json` documents every field. Copy it to
`gradtrack.config.json` and edit. Your real config is gitignored.

### Requirements (the core)

`requirements` is the checklist that drives the site and `gradtrack check`. Each
item:

```json
{
  "id": "apply-for-graduation",
  "label": "Apply for graduation",
  "description": "Submit the graduation application before the term deadline.",
  "status": "todo",
  "category": "admin",
  "blocking": true
}
```

- `id` - stable slug used by `gradtrack check <id>`.
- `status` - `todo` | `in-progress` | `done` (the config value is the seed; your
  toggles live in `~/.gradtrack/state.json` and survive config edits).
- `category` - `admin` | `artifact` | `review` | `submission` (groups the site).
- `blocking` - surfaced above the fold on the home page.

### Program competencies

`program.competencies` are the objectives your portfolio is evaluated against.
gradtrack maps artifacts to them: coursework via an explicit course-to-competency
map, blog posts and repos heuristically (by matching competency id/label tokens).
`program.comp_exam_rules` documents how the program rates the portfolio.

### Graduation term

`graduation.target_term` (e.g. `"Fall 2026"`), `graduation.term_ends` (month-day
per term), and `graduation.deadline_offset_days` drive the countdown. The
surfaced deadline is term end minus the offset. Override the term per-run with
`gradtrack sync --target "Spring 2027"`.

### Optional sources

Every source is off by default and no-ops gracefully when not configured. Enable
the ones you use under `sources`:

- **programInfo** - enrich `total_credits` and exam notes from a markdown
  program-info file. `{ "enabled": true, "path": "/path/to/Program Info.md" }`
- **obsidian** - walk a coursework folder laid out as
  `<schoolDir>/Classes/<term>/<course>/...` for final papers/projects, tagging
  each by `courseToCompetency`. `{ "enabled": true, "schoolDir": "...",
  "courseToCompetency": { "ABC 1234": "competency-1" } }`
- **github** - list a user's repos via the `gh` CLI as portfolio artifacts.
  `{ "enabled": true, "username": "you", "securityThemed": false }`. Set
  `securityThemed: true` to tag/filter security/intelligence repos by keyword.
- **blog** - read one or more Astro-style markdown content collections and tier
  posts (gold/silver/bronze) by length. `{ "enabled": true, "dirs": [{ "path":
  "...", "collection": "blog" }] }`
- **canvas** - read daily Canvas snapshots written by an external tool and
  surface graduation-related course announcements. `{ "enabled": true,
  "snapshotDir": "...", "courseId": "000000", "lookbackDays": 60 }`. The snapshot
  files are markdown with a fenced JSON tail (the same framing gradtrack uses for
  its own snapshots), so a companion tool such as `canvas-digest` can feed this
  source directly.

### Snapshot mirror (optional)

`snapshot.enabled` + `snapshot.outDir` writes a dated markdown snapshot
(`<date>.md`) into a directory of your choice - handy for mirroring status into a
notes vault. Off by default; the site is always written regardless.

### Theme

`theme` sets the site's accent colors. A neutral default ships; override
`accent` / `accentSoft` and the alternate `accentAlt` / `accentAltSoft` (toggled
in the site footer, persisted to localStorage). `site.port` sets the dev-server
port.

## CLI

```
gradtrack doctor                       validate config + enabled sources
gradtrack sync [--target <term>]       refresh sources, emit site data
gradtrack check <id> --status <s>      toggle a requirement status
gradtrack build                        build the static site
gradtrack serve                        Astro dev server (http://localhost:<port>)
gradtrack --config <path> <cmd>        use a specific config file
```

## Layout

```
src/             TypeScript CLI (config, sources, compose, snapshot, commands)
site/            Astro app, reads the JSON gradtrack sync writes
systemd/         optional user units for a scheduled weekly refresh
tests/           vitest
```

## Scheduled refresh (optional)

`systemd/install.sh` installs a user timer that runs `gradtrack sync` +
`gradtrack build` weekly. Edit `WorkingDirectory` in `systemd/gradtrack.service`
to match your clone first.

## License

MIT - see [LICENSE](LICENSE).
