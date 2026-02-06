# Super Morio

Super Morio is a tiny, browser-based **jump & run** inspired by the NES-era feel — but re-themed as a
**snowy cross-country skiing** run.

- Jump obstacles (trees, rocks)
- Collect flags for score
- Speed ramps up over time
- Works on desktop + mobile (tap to jump)
- On mistakes: solve a quick math problem to continue

## Controls

- Jump: `Space` / `↑` (or tap)
- Speed: `←` / `→`

## Run locally

This is a static site. Any local server works, for example:

```bash
python3 -m http.server
```

Then open `http://localhost:8000`.

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow that deploys the static site to GitHub Pages.

1. Push to GitHub (default branch `main`)
2. In GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**

## Notes

This project intentionally uses no dependencies and no build step.
