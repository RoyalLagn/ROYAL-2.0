import { useContext } from "react";
import { ClipsContext } from "../providers";

export function useClips() {
  const context = useContext(ClipsContext);
  if (!context) throw new Error("useClips must be used within ClipsProvider.");
  return context;
}
