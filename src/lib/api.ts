import { useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { gatewayCall } from "./gateway.functions";
import { emitFlow } from "./flow";
import type { GatewayResponse } from "./domain";

export function useGateway() {
  const fn = useServerFn(gatewayCall);
  return useCallback(
    async <T = unknown>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<GatewayResponse<T>> => {
      if (method === "POST") emitFlow("request");
      const r = (await fn({ data: { method, path, body } })) as GatewayResponse<T>;
      if (method === "POST") emitFlow(r.status === 403 ? "deny" : "request", r.service);
      return r;
    },
    [fn],
  );
}

export function useGw<T>(path: string, body?: Record<string, unknown>, enabled = true) {
  const call = useGateway();
  return useQuery({
    queryKey: ["gw", path, body ?? {}],
    queryFn: async () => {
      const r = await call<T>("GET", path, body);
      if (!r.ok) throw new Error(`${r.status} · ${r.error}`);
      return r.data as T;
    },
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled,
    retry: false,
  });
}
