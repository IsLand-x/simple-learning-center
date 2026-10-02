import type { ReactNode } from 'react';
import { BookResourcesContext, useBookResources } from './useBookResources';

export function BookResourcesProvider({
  bookId,
  children,
}: {
  bookId: string;
  children: ReactNode;
}) {
  const value = useBookResources(bookId);
  return <BookResourcesContext.Provider value={value}>{children}</BookResourcesContext.Provider>;
}
