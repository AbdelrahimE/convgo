
import * as React from "react";

/**
 * Custom hook to merge multiple React refs into a single ref function
 * @param refs Array of React refs to merge
 * @returns A function that assigns the value to all provided refs
 */
export function useMergeRefs<T = any>(
  refs: Array<React.MutableRefObject<T> | React.LegacyRef<T> | null | undefined>
): React.RefCallback<T> {
  return React.useCallback((value: T) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref != null) {
        (ref as React.MutableRefObject<T>).current = value;
      }
    });
  }, [refs]);
}
