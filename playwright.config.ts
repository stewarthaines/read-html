import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Baselines are generated inside the CI-matching Linux environment via
  // `npm run test:e2e:update` (see docs/BOOTSTRAP.md §0), so one platform
  // suffix set is committed.
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}-{projectName}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // WebKit is first-class: the audience reads in Safari-family engines.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Firefox is best-effort: runs locally; CI runs it as a non-blocking job.
    // The prefs let media playback start in containers without an audio sink.
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.autoplay.default': 0,
            'media.autoplay.blocking_policy': 0,
          },
        },
      },
    },
  ],
})
