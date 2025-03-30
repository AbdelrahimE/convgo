
import { toast } from 'sonner';

// Re-export the toast function from sonner for consistent usage
export { toast };

// For backward compatibility with any components still using useToast
export const useToast = () => {
  return { 
    toast,
    // Provide an empty toasts array for compatibility
    toasts: []
  };
};
