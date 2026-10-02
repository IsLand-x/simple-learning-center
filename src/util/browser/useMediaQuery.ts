import { useEffect, useState } from 'react';

export function useMediaQuery(queryText: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(queryText).matches);

  useEffect(() => {
    const query = window.matchMedia(queryText);
    const update = () => setMatches(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [queryText]);

  return matches;
}
