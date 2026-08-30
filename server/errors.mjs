export function statusError(status, message, { expose = false } = {}) {
  const error = new Error(message);
  error.status = status;
  error.expose = expose;
  return error;
}
