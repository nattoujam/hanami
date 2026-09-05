const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github']] : [['list']],
  snapshotPathTemplate: '{testDir}/__snapshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: { pathTemplate: '{testDir}/__screenshots__/{arg}{ext}' },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
      },
    },
  ],
});
