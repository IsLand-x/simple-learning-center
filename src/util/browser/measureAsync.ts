// Browser Performance entries contain stage names and durations only, never user data.
export async function measureAsync<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    // JSDOM and restricted browser runtimes may omit the User Timing API.
    if (typeof performance.measure === 'function')
      performance.measure(`learning-center:${stage}`, {
        start: started,
        end: performance.now(),
      });
  }
}
