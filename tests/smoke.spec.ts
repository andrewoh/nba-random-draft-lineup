import { expect, test } from '@playwright/test';

const slotOrder = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

test('completes one full seeded draft round', async ({ page }) => {
  await page.goto('/');

  await page.fill('#groupCode', 'PLAYWRIGHT');
  await page.fill('#seed', 'playwright-seed');
  await page.getByTestId('start-game-button').click();

  await expect(page).toHaveURL(/\/draft/);

  for (let i = 0; i < slotOrder.length; i += 1) {
    await expect(page.getByTestId('draw-progress')).toContainText(`Draw ${i + 1}/5`);
    await expect(page.getByTestId('player-option-0')).toBeVisible();

    await page.getByTestId('player-option-0').click();
    await page.getByTestId(`slot-${slotOrder[i]}`).click();
    await page.getByTestId('confirm-assignment').click();
    await page.getByTestId('confirm-submit').click();
  }

  await expect(page).toHaveURL(/\/results\/[A-Z0-9]+/);
  await expect(page.getByTestId('team-score')).toBeVisible();
  await expect(page.getByText('Seed:')).toBeVisible();
});
