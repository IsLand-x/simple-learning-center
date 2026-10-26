import type { ZodError } from 'zod';

// Tell the model which field to repair without echoing its content into task logs.
export function describeValidationIssues(error: ZodError) {
  return error.issues
    .slice(0, 4)
    .map((issue) => {
      const path = issue.path.map(String).join('.') || 'JSON';
      const reason =
        issue.code === 'too_big'
          ? `超过上限 ${issue.maximum}`
          : issue.code === 'too_small'
            ? `少于下限 ${issue.minimum}`
            : '字段类型或取值不正确';
      return `${path}：${reason}`;
    })
    .join('；');
}
