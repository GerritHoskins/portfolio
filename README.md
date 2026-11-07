# pixeltronic.dev portfolio

A static portfolio with an optional, separately hosted AI page guide. The site can be read and its contact links used without the guide service.

## Source and generated files

Edit `portfolio-template.html` for the home page, `styles.css` for shared styles, and `access.html` / `privacy.html` for the supporting pages. `avatar-poster.jpg` and `og-image.png` are required build inputs.

`npm run build:portfolio` validates the inputs before writing `index.html` and the release directory, `dist/`. The root `index.html` and files in `dist/` are tracked generated outputs: rebuild them after source changes and include the resulting changes with the source commit. Do not edit the generated copies independently.

The build uses Node's standard library. `cv-content.css` and `avatar-test.html` are legacy resources, not release inputs. The latter loads the live guide and is not an automated test.

## Local checks

Use Node.js 22 or newer and npm. Install the locked development tools:

```sh
npm ci
npx playwright install chromium firefox webkit
```

On a fresh Linux runner, Playwright may also need its operating-system dependencies; use `npx playwright install --with-deps chromium firefox webkit` there.

```sh
npm run build:portfolio
npm run check
```

The check suite combines dependency-free Node checks with Playwright browser regressions in Chromium, Firefox, and WebKit. Build first: the checks deliberately do not rebuild for you. Unit checks reject stale generated files, and browser checks serve the existing `dist/`. The parts can also be run separately:

```sh
npm run check:unit
npm run check:browser
```

Browser regressions use local pages and intercept external requests. They must not submit real access requests, start paid guide sessions, or depend on live fonts, analytics, or provider availability. Keep assertions on user-visible behavior: focus visibility, menu dismissal, form validation and failure recovery, readable theme colors, and narrow-screen overflow. Build checks cover missing or invalid inputs and generated-output consistency.

CI installs the locked tools and browser engines, builds, runs `npm run check`, then runs `git diff --exit-code -- index.html dist` so an omitted generated update fails the job.

Windows WebKit omits links from native Tab traversal, including on an isolated HTML page. Its four keyboard-link cases are explicitly skipped on Windows and required on Linux CI; Chromium and Firefox still run them. On macOS the tests use WebKit's Option+Tab link-navigation shortcut. A local engine launch failure is an environment failure, not a passing test; the complete three-engine CI run remains required.

## Preview

After building, serve only the release directory on loopback:

```sh
npm run preview
```

Open `http://127.0.0.1:4173/`. A normal browser preview downloads the live guide JavaScript, Google Fonts, and Cloudflare Analytics. Use the offline browser tests for a preview that blocks those requests. Do not use the access form with real contact details during verification.

The guide is loaded from `https://avatar.pixeltronic.dev/widget/avatar.js`; its backend and provider integrations live outside this repository. The static page hides its guide controls until the custom element is available. The access form sends JSON to the separately hosted `/api/access-request` endpoint only after submission. If JavaScript is unavailable, the form remains disabled and offers an email fallback.

## Release acceptance

Before publishing a new build:

1. Run the full checks and inspect the diff for source/generated parity. Review only the intended files; local tool state and design reference images are not release assets.
2. Inspect desktop and narrow mobile layouts in light and dark themes, with keyboard navigation and reduced motion. Check the home, access, and privacy pages.
3. Deliberately verify the real fonts and guide's initial dialog separately from the offline tests. Opening a dialog is not proof that video, audio, permissions, or provider requests work.
4. For changes affecting the guide, verify its open panel and recovery states on the intended physical devices and browsers. A mocked widget, a mobile viewport, or an emulated browser engine does not establish physical-device behavior. Starting a real session requires an authorized pass key and permission for provider usage.
5. Confirm the publishing target and custom-domain configuration before deployment. `dist/` is the release artifact; a local hosting binding or `CNAME` alone does not prove where production currently points. Publishing and deployment are separate, explicit actions.

Keep any unperformed acceptance checks visible in the change description. Never report a live service, real device, or production deployment as verified from offline tests alone. `overflow-x: clip` also requires a supported browser; Safari versions before 16 need separate consideration.

The privacy page documents both initial external downloads and optional session requests. Backend retention and provider behavior must be checked against the owning service when changed; a frontend build cannot verify them.
