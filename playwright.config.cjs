module.exports = {
  testDir: './tests',
  testMatch: '**/*.spec.cjs',
  timeout: 30000,
  expect: { timeout: 7000 },
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1365, height: 900 }
  },
  reporter: 'list'
};
