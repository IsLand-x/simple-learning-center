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
    // Semi ButtonGroup removes its children's horizontal padding. Preserve that library context
    // while stripping application classes, so grouped buttons are compared with grouped defaults.
    const originalGroup = original.parentElement;
    const referenceHost = originalGroup?.classList.contains('semi-button-group')
      ? document.createElement('div')
      : reference;
    if (referenceHost !== reference) {
      referenceHost.className = Array.from(originalGroup!.classList)
        .filter((name) => name.startsWith('semi-button-group'))
        .join(' ');
      referenceHost.append(reference);
    }
    document.body.append(referenceHost);
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
    referenceHost.remove();
    return result;
  });
  expect(dimensions.actual).toEqual(dimensions.expected);
}
