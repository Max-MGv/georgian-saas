import { defineConfig, devices } from '@playwright/test';

/**
 * Tier 5 ("payment E2E") config — targets the real deployed staging site,
 * https://staging.vineworks.ge, instead of a local dev server. That site is a
 * genuine public Vercel deployment (the `staging` git branch) backed by the
 * **dev** Supabase database (never production — see vault/ClaudeInstructions.md
 * Rule 0), and it is the only place a real Flitt checkout can settle: Flitt's
 * callback needs a publicly reachable host, which `localhost` can never be.
 * Everything else (reporter, outputDir, trace/video, chromium project) mirrors
 * `playwright.config.ts` exactly. The one deliberate omission is the
 * `webServer` block — there is no local server to start or reuse here, tests
 * under `tests/tier5-payment-e2e/` run against the real staging deployment as
 * it already stands. See vault/Plan-PaymentE2ETesting.md for the full plan.
 */
export default defineConfig({
  // Tier 5 specs live in their own directory, separate from the localhost
  // suite in ./tests, so `npx playwright test` (no --config) never picks
  // these up by accident and vice versa.
  testDir: './tests/tier5-payment-e2e',
  outputDir: '../playwright/test-results',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { outputFolder: '../playwright/playwright-report', open: 'never' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL — the real deployed staging site, not localhost. Backed by the
       dev Supabase DB only. Never point this at a production domain. */
    baseURL: 'https://staging.vineworks.ge',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Record a video of every test, kept only for failures so passing runs
       don't pile up disk usage. Videos land in playwright/test-results/ next
       to the failed test's other artifacts — see
       playwright/HOW-TO-CHECK-A-TEST.md for how to find and watch one. */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No webServer block: this config never starts or reuses a local dev
  // server. Tests here hit the real https://staging.vineworks.ge deployment
  // directly — that is the entire point of this tier (real Flitt hosted
  // checkout, reachable callback URL).
});
