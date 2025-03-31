
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Check if the application is running in development mode
 * @returns boolean indicating if in development mode
 */
export const isDevelopment = (): boolean => {
  return import.meta.env.DEV === true;
};

/**
 * Check if the application is running in production mode
 * @returns boolean indicating if in production mode
 */
export const isProduction = (): boolean => {
  return import.meta.env.PROD === true;
};

/**
 * Check if logging is enabled based on environment variable
 * @returns boolean indicating if logging is enabled
 */
export const isLoggingEnabled = (): boolean => {
  return import.meta.env.VITE_ENABLE_LOGS === 'true';
};
