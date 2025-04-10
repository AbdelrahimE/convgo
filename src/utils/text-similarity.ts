
/**
 * Simple similarity function (Jaccard similarity)
 * Calculates how similar two strings are on a scale from 0 to 1
 * 
 * @param str1 The first string to compare
 * @param str2 The second string to compare
 * @returns A number between 0 and 1, where 1 means identical
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  // For small strings, use character-based comparison
  if (str1.length < 10 || str2.length < 10) {
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }
  
  // For longer strings, use word-based comparison
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}
