"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import type { Side } from "./types";

// Supabase Realtime: presence (who is in the room) + broadcast (room events). No tables.
// Without the env vars the app runs in solo mode.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
export function realtimeAvailable(): boolean {
  return Boolean(URL && KEY);
}
function getClient(): SupabaseClient | null {
  if (!URL || !KEY) return null;
  client ??= createClient(URL, KEY, { realtime: { params: { eventsPerSecond: 20 } } });
  return client;
}

export interface Peer {
  id: string;
  name: string;
  side: Side;
  factor: number;
  intercept: number;
}

export function useRoomChannel<M>(
  channelName: string | null,
  me: Peer,
  onMessage: (msg: M) => void,
): { peers: Peer[]; send: (msg: M) => void; status: "solo" | "connecting" | "live" } {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<"solo" | "connecting" | "live">(channelName ? "connecting" : "solo");
  const chRef = useRef<RealtimeChannel | null>(null);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });

  useEffect(() => {
    const sb = getClient();
    if (!channelName || !sb) return;
    const ch = sb.channel(channelName, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    chRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<Peer>();
      setPeers(Object.values(state).map((metas) => metas[0]).filter(Boolean));
    });
    ch.on("broadcast", { event: "room" }, ({ payload }) => handler.current(payload as M));
    ch.subscribe(async (s) => {
      if (s === "SUBSCRIBED") {
        setStatus("live");
        await ch.track(me);
      }
    });
    return () => {
      chRef.current = null;
      void sb.removeChannel(ch);
    };
  }, [channelName, me]);

  return {
    peers,
    status: channelName && realtimeAvailable() ? status : "solo",
    send: (msg: M) => {
      void chRef.current?.send({ type: "broadcast", event: "room", payload: msg });
    },
  };
}
