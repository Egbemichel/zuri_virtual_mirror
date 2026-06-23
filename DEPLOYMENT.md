# Deployment & DevSecOps — Zuri Virtual Mirror

Push to GitHub → security-gated CI → automatic deploy to **Netlify** over HTTPS
(required for the phone camera). Built on **GitHub Actions** (managed runners, no
server to maintain) with a full DevSecOps gate set.

```
 git push ──▶ GitHub Actions ─────────────────────────────┐
              ├─ Build & type-check (vite + tsc)           │
              ├─ Security gates:                            │  all must pass
              │    · npm audit (runtime SCA, blocks HIGH+)  │      ▼
              │    · gitleaks (secret scanning)             │   Netlify
              │    · Trivy (vuln + secret + misconfig)      │   ├─ PR  → deploy PREVIEW
              │    · CodeQL (SAST, separate workflow)       │   └─ main → PRODUCTION
              └─ Dependabot keeps deps & actions patched ───┘
```

| File | Purpose |
| ---- | ------- |
| `netlify.toml` | Build/publish config (used only for native Netlify builds) |
| `public/_headers` | Security headers + camera `Permissions-Policy` + WASM caching (ships inside `dist`) |
| `public/_redirects` | SPA fallback (ships inside `dist`) |
| `.github/workflows/ci.yml` | Build → security gates → Netlify deploy (preview on PR, prod on main) |
| `.github/workflows/codeql.yml` | CodeQL SAST (JS/TS), incl. weekly schedule |
| `.github/dependabot.yml` | Weekly npm + GitHub Actions dependency PRs |

---

## One-time setup (~10 minutes)

### 1. Create the Netlify site (as a deploy target, NOT git-linked)

> **Important:** do **not** connect the repo to Netlify's own Git auto-build.
> The pipeline deploys via the Netlify CLI *after* the gates pass — linking Git
> would create a second, ungated deploy on every push.

Easiest via the CLI (run once, locally):

```powershell
npm install -g netlify-cli
netlify login                 # opens the browser
netlify sites:create --name zuri-virtual-mirror
```

Note the **Site ID** it prints (also at *Site configuration → General → Site
information → Site ID* in the dashboard).

### 2. Create a Netlify access token

Netlify dashboard → **User settings → Applications → Personal access tokens →
New access token**. Copy it.

### 3. Add the two secrets to GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
| ----------- | ----- |
| `NETLIFY_AUTH_TOKEN` | the personal access token from step 2 |
| `NETLIFY_SITE_ID` | the Site ID from step 1 |

### 4. (Recommended) Branch protection

Repo → **Settings → Branches → Add rule** for `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass → select **Build & type-check**, **Security
  gates**, and **Analyze (javascript-typescript)**
- ✅ Require branches to be up to date before merging

Now nothing reaches `main` (and therefore production) without passing every gate.

---

## Go live (test on your phone)

```powershell
git add .
git commit -m "ci: add Netlify deploy + DevSecOps pipeline"
git push origin main
```

Watch **Actions** in GitHub. When the `deploy` job finishes, your site is live at
`https://<your-site>.netlify.app` — open it on your phone (Chrome/Safari), allow
the camera, and capture. HTTPS is automatic, so the camera unlocks with no extra
config.

> First load pulls the MediaPipe model; give it a moment on mobile data.

### Pull-request previews

Open a PR → the pipeline posts a **deploy preview URL** in the job summary
(Actions → the run → Summary). Each PR gets its own isolated URL to test before
merging.

---

## Where security results appear

- **Security → Code scanning** — CodeQL (SAST) and Trivy (SARIF) findings.
- **Security → Dependabot** — vulnerable/outdated dependency alerts & PRs.
- **Actions logs** — gitleaks output and the `npm audit` runtime gate (a HIGH+
  vuln in a *shipped* dependency fails the build).

> CodeQL & secret scanning are **free for public repos**. For a **private** repo,
> CodeQL needs GitHub Advanced Security — but gitleaks, Trivy, `npm audit`, and
> Dependabot all run regardless, so you keep strong coverage either way.

---

## Tuning the gates

- **Harden Trivy to block** (not just report): set `exit-code: '1'` in
  `.github/workflows/ci.yml`.
- **Stricter audits:** lower `--audit-level` to `moderate`, or drop `--omit=dev`
  to also gate build-tooling vulnerabilities.
- **CSP issues:** if the camera or face tracking fails on the live site, the
  `Content-Security-Policy` line in `netlify.toml` is the first thing to relax
  (see the inline note there) — then tighten back incrementally.
