
export function getGaugeColor(percentageUsed: number): string {
  if (percentageUsed < 25) return 'text-green-500';  // Low usage
  if (percentageUsed < 50) return 'text-yellow-500'; // Medium usage
  if (percentageUsed < 75) return 'text-orange-500'; // High usage
  return 'text-red-500';  // Critical usage
}
