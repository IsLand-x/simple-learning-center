import { expect, type Locator } from '@playwright/test';

// Compare against the installed Semi theme, rather than project CSS overrides.
export async function expectSemiButtonSize(button: Locator) {
  const dimensions = await button.evaluate((element) => {
    const original = element as HTMLElement;
    const reference = document.createElement('button');
    reference.className = Array.from(original.classList)
      .filter((name) => name.startsWith('semi-button'))
      .join(' ');
    reference.textContent = original.textContent;
    document.body.append(reference);
    const expected = getComputedStyle(reference);
    const actual = getComputedStyle(original);
    const properties = [
      'height',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'fontSize',
      'lineHeight',
    ] as const;
    const result = {
      expected: Object.fromEntries(properties.map((property) => [property, expected[property]])),
      actual: Object.fromEntries(properties.map((property) => [property, actual[property]])),
    };
    reference.remove();
    return result;
  });
  expect(dimensions.actual).toEqual(dimensions.expected);
}
