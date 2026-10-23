function normalizeText(source: string) {
  return (
    source
      .replace(
        /^ {0,3}\$\$([^\n]+?)\$\$[ \t]*$/gm,
        (_match, formula: string) => `\n$$\n${formula.trim()}\n$$\n`,
      )
      .replace(
        /(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]|(?<!\\)\\\(([^\n]*?)(?<!\\)\\\)/g,
        (_match, display: string | undefined, inline: string | undefined) =>
          display !== undefined ? `\n$$\n${display.trim()}\n$$\n` : `$${inline}$`,
      )
      // Some older replies have lost the escaping around a standalone display.
      // Require both an isolated bracketed line and an actual TeX command.
      .replace(
        /^ {0,3}\[\s+([^\n]*\\[A-Za-z]+[^\n]*?)\s+\][ \t]*$/gm,
        (_match, formula: string) => `\n$$\n${formula.trim()}\n$$\n`,
      )
  );
}

/** Normalize common model delimiters before Markdown consumes their escapes. */
export function normalizeMathMarkdown(source: string) {
  if (!/\\[[(]|^ {0,3}(?:\[\s+[^\n]*\\[A-Za-z]+|\$\$[^\n]+?\$\$)/m.test(source)) return source;
  // Protect fenced, indented and inline code, including unfinished streamed fences.
  const code = /^ {0,3}(?:> ?)*(`{3,}|~{3,})[^\n]*(?:\n|$)|`+|^(?: {4}|\t)[^\n]*(?:\n|$)/gm;
  let cursor = 0;
  let result = '';
  for (let match = code.exec(source); match; match = code.exec(source)) {
    let end = code.lastIndex;
    const fence = match[1];
    if (fence) {
      const closing = new RegExp(
        `^ {0,3}(?:> ?)*${fence[0]}{${fence.length},}[ \\t]*(?:\\n|$)`,
        'gm',
      );
      closing.lastIndex = end;
      const close = closing.exec(source);
      end = close ? closing.lastIndex : source.length;
    } else if (match[0].startsWith('`')) {
      const closing = new RegExp(`(?<!\x60)\x60{${match[0].length}}(?!\x60)`, 'g');
      closing.lastIndex = end;
      const close = closing.exec(source);
      end = close ? closing.lastIndex : source.length;
    }
    result += normalizeText(source.slice(cursor, match.index)) + source.slice(match.index, end);
    cursor = end;
    code.lastIndex = end;
  }
  return result + normalizeText(source.slice(cursor));
}
