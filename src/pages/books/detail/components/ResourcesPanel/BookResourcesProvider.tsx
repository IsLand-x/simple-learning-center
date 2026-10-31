import type { ReactNode } from 'react';
import { BookResourcesContext, useBookResources } from './useBookResources';

export function BookResourcesProvider({
  bookId,
  enabled = true,
  children,
}: {
  bookId: string;
  enabled?: boolean;
  children: ReactNode;
}) {
  const value = useBookResources(bookId, enabled);
  return <BookResourcesContext.Provider value={value}>{children}</BookResourcesContext.Provider>;
}
