import { useStore } from "zustand";
import { create } from "zustand";

interface S3BrowsingState {
  prefixByBucket: Record<string, string>;
  setPrefix: (bucket: string, prefix: string) => void;
}

export const useS3Browsing = create<S3BrowsingState>()((set) => ({
  prefixByBucket: {},

  setPrefix: (bucket, prefix) =>
    set((state) => ({
      prefixByBucket: { ...state.prefixByBucket, [bucket]: prefix },
    })),
}));

export function useBucketPrefix(bucket: string): string {
  return useStore(useS3Browsing, (s) => s.prefixByBucket[bucket] ?? "");
}
