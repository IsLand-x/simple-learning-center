import assert from 'node:assert/strict';
import test from 'node:test';
import { regressionPlan } from './regression-plan.mjs';

const change = (path, status = 'M') => ({ path, status });
test('术语小改只选术语与移动交互回归，混合公共变动必须全量', () => {
  const term = change('src/pages/books/detail/components/ReaderSurface/foliate/termAnnotations.ts');
  assert.deepEqual(regressionPlan([term]).specs, [
    'tests/e2e/mobile-reader-overlays.spec.ts',
    'tests/e2e/reader-glossary.spec.ts',
  ]);
  const glossaryPanel = change(
    'src/pages/books/detail/components/GlossaryPanel/useGlossaryExplanation.ts',
  );
  assert.deepEqual(regressionPlan([glossaryPanel]).specs, [
    'tests/e2e/mobile-reader-overlays.spec.ts',
    'tests/e2e/reader-glossary.spec.ts',
  ]);
  assert.equal(regressionPlan([term, change('src/store/useLearningStore.ts')]).mode, 'full');
});
test('阅读器运行时、共享模块、持久化、依赖和未知变动全量兜底', () => {
  for (const path of [
    'src/pages/books/detail/components/ReaderSurface/foliate/readerAdapter.ts',
    'src/layout/AppRoutes.tsx',
    'src/styles/index.css',
    'server/modules/state/state.ts',
    'contracts/books.ts',
    'package-lock.json',
    'unexpected.file',
  ]) {
    assert.equal(regressionPlan([change(path)]).mode, 'full', path);
  }
});
test('文档免运行时回归，删除和手动强制不允许缩减', () => {
  assert.equal(regressionPlan([change('README.md')]).mode, 'none');
  assert.equal(regressionPlan([change('src/pages/books/list/index.tsx', 'D')]).mode, 'full');
  assert.equal(regressionPlan([], true).mode, 'full');
});
test('页面变动包含功能、视觉与路由；直接改测试不会遗漏', () => {
  const plan = regressionPlan([
    change('src/pages/books/list/index.tsx'),
    change('tests/e2e/book-sharing.spec.ts'),
  ]);
  assert.equal(plan.mode, 'related');
  assert.ok(plan.specs.includes('tests/e2e/book-list-order.spec.ts'));
  assert.ok(plan.specs.includes('tests/e2e/visual-regression.spec.ts'));
  assert.ok(plan.specs.includes('tests/e2e/app-shell.spec.ts'));
  assert.ok(plan.specs.includes('tests/e2e/book-sharing.spec.ts'));
});

test('阅读侧栏变动包含术语、高亮和评论排序回归', () => {
  const plan = regressionPlan([
    change('src/pages/books/detail/components/ReaderPanel/ReaderRightPanel.tsx'),
    change('src/pages/books/detail/components/annotationSorting.ts'),
  ]);
  assert.equal(plan.mode, 'related');
  assert.ok(plan.specs.includes('tests/e2e/reader-annotation-sorting.spec.ts'));
  assert.ok(plan.specs.includes('tests/e2e/reader-glossary.spec.ts'));
  assert.ok(plan.specs.includes('tests/e2e/visual-regression.spec.ts'));
});
