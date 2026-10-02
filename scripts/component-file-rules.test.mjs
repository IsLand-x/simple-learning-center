import assert from 'node:assert/strict';
import test from 'node:test';
import { componentNames } from './component-file-rules.mjs';

test('统计本文件实现，不把导入、组件别名或 render 回调算成新组件', () => {
  assert.deepEqual(
    componentNames(
      "import { Button } from 'ui'; const Icon = icons[kind]; export function Panel() { return <Widget render={()=><Button/>}/>; }",
    ),
    ['Panel'],
  );
  assert.deepEqual(
    componentNames(
      'const Panel = memo(forwardRef(function Panel(props, ref) { return <div ref={ref}/>; }));',
    ),
    ['Panel'],
  );
});

test('默认匿名组件与括号包装不能掩盖第二个组件', () => {
  assert.equal(
    componentNames(
      'const Child = (() => <span/>) satisfies Component; export default () => <Child/>;',
    ).length,
    2,
  );
  assert.equal(
    componentNames('export default function () {return <div/>;} function Child() {return null;}')
      .length,
    2,
  );
  assert.equal(
    componentNames(
      'const Child = (() => null) as Component; const Parent = React.memo(()=><Child/>);',
    ).length,
    2,
  );
});

test('嵌套组件仍属于本文件，需拆成独立实现', () => {
  assert.deepEqual(
    componentNames('export function Parent() {function Child(){return <div/>;} return <Child/>;}'),
    ['Parent', 'Child'],
  );
});
