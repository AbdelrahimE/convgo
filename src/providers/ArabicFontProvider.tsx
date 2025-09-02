import React, { useEffect } from 'react';

interface ArabicFontProviderProps {
  children: React.ReactNode;
}

/**
 * Provider that ensures Arabic font is applied globally
 * and adds MutationObserver to detect and style Arabic text dynamically
 */
export const ArabicFontProvider: React.FC<ArabicFontProviderProps> = ({ children }) => {
  useEffect(() => {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    
    // Function to check and apply Arabic styling
    const applyArabicStyling = (element: Element) => {
      if (element.nodeType === Node.TEXT_NODE) {
        const text = element.textContent || '';
        if (arabicRegex.test(text) && element.parentElement) {
          const parent = element.parentElement;
          // Only add font-arabic class if not already present
          if (!parent.classList.contains('font-arabic')) {
            parent.classList.add('font-arabic');
            
            // Apply RTL direction ONLY for input fields
            const isInputField = parent.tagName === 'INPUT' || 
                                parent.tagName === 'TEXTAREA' || 
                                parent.hasAttribute('contenteditable') ||
                                parent.closest('input, textarea, [contenteditable]');
            
            if (isInputField) {
              // Apply RTL for input fields only - using CSS classes
              parent.classList.add('text-right', 'dir-rtl');
            }
            // For all other elements (regular text), only apply the font, keep LTR
          }
        }
      } else if (element.nodeType === Node.ELEMENT_NODE) {
        // Check all child nodes
        element.childNodes.forEach(child => {
          applyArabicStyling(child as Element);
        });
      }
    };
    
    // Initial application
    applyArabicStyling(document.body);
    
    // Create MutationObserver to watch for DOM changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
              applyArabicStyling(node as Element);
            }
          });
        } else if (mutation.type === 'characterData') {
          const target = mutation.target;
          if (target.parentElement) {
            applyArabicStyling(target.parentElement);
          }
        }
      });
    });
    
    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });
    
    // Cleanup
    return () => {
      observer.disconnect();
    };
  }, []);
  
  return <>{children}</>;
};