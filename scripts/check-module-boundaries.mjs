import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const violations = [];
const graph = new Map();
const config = ts.readConfigFile(resolve(root, 'tsconfig.app.json'), ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const normalize = (path) => relative(root, path).replaceAll('\\', '/');

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory()
          ? collect(path)
          : /\.(?:ts|tsx|mjs)$/.test(entry.name)
            ? [path]
            : [];
      }),
    )
  ).flat();
}

const files = (
  await Promise.all(['src', 'server', 'contracts'].map((name) => collect(resolve(root, name))))
).flat();
const pageDirectories = files
  .map(normalize)
  .filter(
    (path) =>
      path.startsWith('src/pages/') &&
      path.endsWith('/index.tsx') &&
      !/\/(?:components|store)\//.test(path),
  )
  .map((path) => path.slice(0, -'/index.tsx'.length))
  .sort((left, right) => right.length - left.length);

function pageScope(path) {
  return pageDirectories.find((directory) => path.startsWith(directory + '/'));
}

function validate(file, target) {
  const source = normalize(file);
  const destination = normalize(target);
  const reject = (message) => violations.push(source + ': ' + message + ' (' + destination + ')');
  if (
    source.startsWith('src/api/') &&
    !destination.startsWith('src/api/') &&
    !destination.startsWith('src/types/') &&
    !destination.startsWith('contracts/')
  )
    reject('API 服务只依赖传输层与请求/响应类型，不依赖 UI 或状态编排');
  if (
    (source.startsWith('src/types/') ||
      (source.startsWith('src/api/') && source.endsWith('/type.ts'))) &&
    !destination.startsWith('src/types/') &&
    !destination.startsWith('contracts/') &&
    !(destination.startsWith('src/api/') && destination.endsWith('/type.ts'))
  )
    reject('请求/响应类型不得反向依赖 API、状态或界面');
  if (destination === 'src/api/http/transport.ts' && !source.startsWith('src/api/'))
    reject('请求必须通过业务 API class，页面和工具不得直接调用传输层');
  if (source.startsWith('src/util/') && /^src\/(?:pages|components|layout)\//.test(destination))
    reject('跨页面工具与持久化核心不得依赖页面或界面');
  if (source.startsWith('src/store/') && /^src\/(?:pages|components|layout)\//.test(destination))
    reject('全局持久化状态不得依赖页面或界面');
  if (source.startsWith('src/util/') && destination.startsWith('src/store/'))
    reject('跨页面工具不得依赖状态编排');
  if (source.startsWith('src/components/') && /^src\/(?:pages|layout)\//.test(destination))
    reject('共享组件不得依赖页面私有实现或外壳');
  if (pageScope(source) && pageScope(destination) && pageScope(source) !== pageScope(destination))
    reject('页面之间不得直接引用私有实现，请提取共享组件或工具');
  if (source.includes('/store/model/') && /\/components\//.test(destination))
    reject('纯模型不得依赖界面');
  if (source.startsWith('contracts/') && !destination.startsWith('contracts/'))
    reject('共享契约不得依赖前后端运行时实现');
  if (source.startsWith('src/') && destination.startsWith('server/'))
    reject('浏览器不得导入服务端实现');
  if (source.startsWith('server/') && destination.startsWith('src/'))
    reject('服务端不得导入前端实现');
  if (
    destination.startsWith('server/modules/') &&
    /(?:\/routes|Routes)\.ts$/.test(destination) &&
    source !== 'server/app.ts' &&
    !source.endsWith('.test.mjs')
  )
    reject('只有 app.ts 可以挂载业务路由');
  if (
    /^server\/modules\/state\/(stateStore|serialization)\.ts$/.test(source) &&
    destination.startsWith('server/modules/') &&
    !destination.startsWith('server/modules/state/')
  )
    reject('状态读写与序列化只依赖本模块纯规则');
  if (source.startsWith('server/modules/books/') && destination.startsWith('server/modules/ai/'))
    reject('书籍存储不得反向依赖 AI 运行时');
  if (source.startsWith('server/infrastructure/') && destination.startsWith('server/modules/'))
    reject('通用基础设施不得依赖业务模块');
}

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const path = normalize(file);
  const isApiDomainFile =
    path.startsWith('src/api/') && !path.startsWith('src/api/http/') && !path.endsWith('.test.ts');
  if (isApiDomainFile) {
    if (!/^src\/api\/[^/]+\/(?:index|type)\.ts$/.test(path)) {
      violations.push(path + ': 业务 API 必须组织为 api/<域>/index.ts 与 type.ts');
    } else if (
      !ts.sys.fileExists(
        resolve(dirname(file), path.endsWith('/index.ts') ? 'type.ts' : 'index.ts'),
      )
    ) {
      violations.push(path + ': API 实现与类型文件必须成对存在');
    }
    if (
      path.endsWith('/index.ts') &&
      ast.statements.some(
        (node) => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node),
      )
    ) {
      violations.push(path + ': 请求与响应类型应放在同域 type.ts');
    }
  }
  if (
    path.startsWith('src/types/') ||
    path.startsWith('contracts/') ||
    (path.startsWith('src/api/') && path.endsWith('/type.ts'))
  ) {
    for (const node of ast.statements) {
      const typeDeclaration = ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
      const typeImport =
        ts.isImportDeclaration(node) &&
        (node.importClause?.isTypeOnly ||
          (node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings) &&
            node.importClause.namedBindings.elements.every((element) => element.isTypeOnly)));
      const typeExport =
        ts.isExportDeclaration(node) &&
        (node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.every((element) => element.isTypeOnly)));
      if (!typeDeclaration && !typeImport && !typeExport)
        violations.push(path + ': 类型文件不得包含运行时代码');
    }
  }
  const edges = new Set();
  graph.set(file, edges);
  function inspect(node) {
    if (
      ts.isCallExpression(node) &&
      normalize(file).startsWith('src/') &&
      !normalize(file).startsWith('src/api/') &&
      !/\.test\.tsx?$/.test(file)
    ) {
      const expression = node.expression;
      const directRequest =
        ts.isIdentifier(expression) && ['fetch', 'serverRequest'].includes(expression.text);
      const globalRequest =
        ts.isPropertyAccessExpression(expression) &&
        expression.name.text === 'fetch' &&
        ts.isIdentifier(expression.expression) &&
        ['window', 'globalThis'].includes(expression.expression.text);
      if (directRequest || globalRequest)
        violations.push(normalize(file) + ': HTTP 请求必须放入对应业务 API class');
    }
    let specifier;
    let typeOnly = false;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
      typeOnly = node.isTypeOnly || node.importClause?.isTypeOnly;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      specifier = node.arguments[0];
      if (specifier && !ts.isStringLiteral(specifier))
        violations.push(normalize(file) + ': 动态 import 必须使用可检查的静态路径');
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      specifier = node.argument.literal;
      typeOnly = true;
    }
    if (specifier && ts.isStringLiteral(specifier)) {
      const text = specifier.text;
      let target = ts.resolveModuleName(text, file, options, ts.sys).resolvedModule
        ?.resolvedFileName;
      if (!target && text.startsWith('.')) {
        const direct = resolve(dirname(file), text);
        if (ts.sys.fileExists(direct)) target = direct;
      }
      if (target && !target.includes('/node_modules/')) {
        target = resolve(target);
        validate(file, target);
        if (!typeOnly) edges.add(target);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
}

const visited = new Set();
const visiting = new Set();
function visit(file, chain = []) {
  if (visiting.has(file)) {
    violations.push(
      '循环依赖: ' + [...chain.slice(chain.indexOf(file)), file].map(normalize).join(' -> '),
    );
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const target of graph.get(file) ?? []) visit(target, [...chain, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of graph.keys()) visit(file);

if (violations.length) {
  console.error('模块边界检查失败（' + violations.length + ' 项）：\n' + violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('模块边界检查通过（静态/动态导入、重导出、路径解析与循环依赖）');
}
