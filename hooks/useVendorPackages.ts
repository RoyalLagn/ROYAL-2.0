import { useCallback, useEffect, useRef, useState } from "react";
import { VendorPackageService, type VendorPackage } from "@/services/vendorPackages";

export function useVendorPackages(vendorId?: string | null, publicOnly = false) {
  const [packages, setPackages] = useState<VendorPackage[]>([]);
  const [loading, setLoading] = useState(Boolean(vendorId));
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const requestSequence = useRef(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async (quiet = false) => {
    const requestId = ++requestSequence.current;
    if (!vendorId) {
      setPackages([]);
      setLoading(false);
      return [];
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const rows = publicOnly
        ? await VendorPackageService.listPublic(vendorId)
        : await VendorPackageService.listVendor(vendorId);
      if (mounted.current && requestId === requestSequence.current) setPackages(rows);
      return rows;
    } catch (cause) {
      if (mounted.current && requestId === requestSequence.current) setError(cause instanceof Error ? cause.message : "Unable to load packages.");
      return null;
    } finally {
      if (mounted.current && requestId === requestSequence.current) setLoading(false);
    }
  }, [publicOnly, vendorId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!vendorId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = VendorPackageService.subscribe(vendorId, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(true), 100);
    });
    return () => { if (timer) clearTimeout(timer); unsubscribe(); };
  }, [refresh, vendorId]);

  return { packages, loading, error, refresh };
}
