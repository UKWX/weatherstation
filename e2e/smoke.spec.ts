import { expect, test } from '@playwright/test'

test('Overview route loads', async ({ page }) => {
  await page.goto('/weatherstation/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
})

test('Theme preference persists after reload', async ({ page }) => {
  await page.goto('/weatherstation/')
  const toggle = page.getByRole('button', { name: /Theme:/i })
  await expect(toggle).toBeVisible()

  const before = await toggle.textContent()
  await toggle.click()
  const after = await toggle.textContent()
  expect(after).not.toBe(before)

  await page.reload()
  await expect(page.getByRole('button', { name: new RegExp(after ?? '', 'i') })).toBeVisible()
})
