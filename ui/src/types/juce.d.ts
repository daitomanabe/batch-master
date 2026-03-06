export {};

declare global {
  interface Window {
    __JUCE__?: {
      backend?: {
        getNativeFunction?: (name: string) => ((...args: unknown[]) => Promise<unknown>) | undefined;
        addEventListener?: (eventId: string, callback: (payload: unknown) => void) => number | string;
        removeEventListener?: (token: number | string) => void;
        [key: string]: unknown;
      };
    };
  }
}
