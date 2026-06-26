/**
 * A lightweight client-side debounce utility to prevent rapid-click spamming.
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  delayMs: number = 500
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function (...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
    }, delayMs);
  };
}
