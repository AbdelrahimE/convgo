/**
 * Simple Language Detector - Inspired by Botifiy
 * Applies dir and lang attributes only, CSS handles the fonts
 */

// Arabic detection regex (same as Botifiy)
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF]/;

/**
 * Detect if text contains Arabic characters
 */
export function isArabicText(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return ARABIC_REGEX.test(text);
}

/**
 * Apply language attributes to element based on its DIRECT text content
 * Does NOT check child elements - only direct text
 */
function applyLanguageAttributes(element: Element): void {
  // Skip if already has attributes
  if (element.hasAttribute('dir') || element.hasAttribute('lang')) {
    return;
  }

  // Get ONLY direct text content (not from children)
  const directText = getDirectTextContent(element);
  if (!directText || directText.trim().length === 0) return;

  // Apply attributes based on text language
  if (isArabicText(directText)) {
    element.setAttribute('dir', 'rtl');
    element.setAttribute('lang', 'ar');
  } else {
    element.setAttribute('dir', 'ltr');
    element.setAttribute('lang', 'en');
  }
}

/**
 * Get only direct text content of element (not from children)
 */
function getDirectTextContent(element: Element): string {
  let directText = '';
  
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      directText += node.textContent || '';
    }
  }
  
  return directText.trim();
}

/**
 * Process text elements - TARGET ONLY FINAL TEXT ELEMENTS
 */
function processTextElements(container: Element = document.body): void {
  // TARGET ONLY FINAL TEXT ELEMENTS - NO CONTAINERS
  const textElements = container.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, p, span, button, label, a, td, th, figcaption, blockquote'
    // NOTICE: NO 'div' or large containers
  );

  textElements.forEach(element => {
    applyLanguageAttributes(element);
  });
}

/**
 * Initialize the language detection system
 */
export function initLanguageDetection(): MutationObserver {
  // Process existing elements
  processTextElements();
  
  // Setup observer for new elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            processTextElements(node as Element);
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Smart fallback: Re-process after page loads
  setTimeout(() => {
    processTextElements();
  }, 1000);

  // Smart fallback: Re-process after longer delay (for lazy loaded content)
  setTimeout(() => {
    processTextElements();
  }, 3000);

  return observer;
}