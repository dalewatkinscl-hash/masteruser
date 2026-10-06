import { useEffect } from 'react';

const SITE_NAME = 'Country Lion Employee Portal';

/**
 * Sets document.title for the current view. Pass null/empty to restore the site default.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    const next = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
    document.title = next;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export { SITE_NAME };
