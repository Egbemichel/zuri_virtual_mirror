# Brand fonts

Drop the licensed brand web-font files here so the UI picks them up:

```
public/fonts/
├── Rische-Bold.woff2
├── Rische-Light.woff2
└── IsidoraSans-Regular.woff2
```

These are referenced by `@font-face` in `src/style.css`. Until they are present
the UI gracefully falls back to **Plus Jakarta Sans** (loaded from Google Fonts
in `index.html`), so the app runs and looks correct without them — the brand
faces simply swap in when available (`font-display: swap`).
