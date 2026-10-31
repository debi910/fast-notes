"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import type { Side } from "./types";

// Live rooms: presence (who is here) + broadcast (room events). No database tables.
// With the Supabase env vars set, rooms sync across devices. Without them, tabs in the
// same browser still sync through BroadcastChannel, so the multiplayer flow can be tried offline.
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
  joinedAt: number;
}

/** "live": synced across devices. "local": synced across tabs of this browser only. */
export type LinkStatus = "connecting" | "live" | "local";

const NAMES = ["Otter", "Heron", "Lynx", "Finch", "Marten", "Ibex", "Puffin", "Gecko", "Wren", "Bison", "Koala", "Tern"];
const ADJ = ["Calm", "Quick", "Bright", "Keen", "Steady", "Sunny", "Bold", "Gentle"];

export function makePeer(v: { side: Side; factor: number; intercept: number }): Peer {
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: `${ADJ[r(ADJ.length)]} ${NAMES[r(NAMES.length)]}`,
    joinedAt: Date.now(),
    ...v,
  };
}

interface Transport {
  send(payload: unknown): void;
  close(): void;
}

function supabaseTransport(
  sb: SupabaseClient,
  name: string,
  me: Peer,
  onPeers: (p: Peer[]) => void,
  onMsg: (m: unknown) => void,
  onStatus: (s: LinkStatus) => void,
  onFail: () => void,
): Transport {
  const ch: RealtimeChannel = sb.channel(name, { config: { presence: { key: me.id }, broadcast: { self: false } } });
  ch.on("presence", { event: "sync" }, () => {
    const state = ch.presenceState<Peer>();
    onPeers(Object.values(state).map((metas) => metas[0]).filter(Boolean));
  });
  ch.on("broadcast", { event: "room" }, ({ payload }) => onMsg(payload));
  ch.subscribe(async (s) => {
    if (s === "SUBSCRIBED") {
      onStatus("live");
      await ch.track(me);
    } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
      onFail();
    }
  });
  return {
    send: (payload) => void ch.send({ type: "broadcast", event: "room", payload }),
    close: () => void sb.removeChannel(ch),
  };
}

function localTransport(name: string, me: Peer, onPeers: (p: Peer[]) => void, onMsg: (m: unknown) => void): Transport {
  if (typeof BroadcastChannel === "undefined") {
    onPeers([me]);
    return { send: () => {}, close: () => {} };
  }
  const bc = new BroadcastChannel(`fastnotes:${name}`);
  const seen = new Map<string, { peer: Peer; at: number }>();
  const publish = () => onPeers([me, ...[...seen.values()].map((x) => x.peer)]);
  const hello = () => bc.postMessage({ k: "hello", peer: me });
  bc.onmessage = (e: MessageEvent) => {
    const d = e.data as { k: string; peer?: Peer; payload?: unknown };
    if (d.k === "hello" && d.peer && d.peer.id !== me.id) {
      const isNew = !seen.has(d.peer.id);
      seen.set(d.peer.id, { peer: d.peer, at: Date.now() });
      if (isNew) {
        hello();
        publish();
      }
    } else if (d.k === "bye" && d.peer) {
      seen.delete(d.peer.id);
      publish();
    } else if (d.k === "msg") {
      onMsg(d.payload);
    }
  };
  const beat = setInterval(() => {
    hello();
    const now = Date.now();
    let changed = false;
    for (const [id, x] of seen) {
      if (now - x.at > 6000) {
        seen.delete(id);
        changed = true;
      }
    }
    if (changed) publish();
  }, 2000);
  const bye = () => bc.postMessage({ k: "bye", peer: me });
  window.addEventListener("pagehide", bye);
  hello();
  publish();
  return {
    send: (payload) => bc.postMessage({ k: "msg", payload }),
    close: () => {
      bye();
      clearInterval(beat);
      window.removeEventListener("pagehide", bye);
      bc.close();
    },
  };
}

export function useRoomChannel<M>(
  channelName: string,
  me: Peer,
  onMessage: (msg: M) => void,
): { peers: Peer[]; send: (msg: M) => void; status: LinkStatus } {
  const [peers, setPeers] = useState<Peer[]>([me]);
  const [status, setStatus] = useState<LinkStatus>(realtimeAvailable() ? "connecting" : "local");
  const tRef = useRef<Transport | null>(null);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });

  useEffect(() => {
    const onMsg = (m: unknown) => handler.current(m as M);
    const sb = getClient();
    let t: Transport;
    const fallBack = () => {
      t?.close();
      // Stop the client retrying a socket the network refuses.
      void sb?.realtime.disconnect();
      setStatus("local");
      t = localTransport(channelName, me, setPeers, onMsg);
      tRef.current = t;
    };
    if (sb) {
      t = supabaseTransport(sb, channelName, me, setPeers, onMsg, setStatus, fallBack);
      // Network blocked or project paused: don't leave the room hanging.
      const timer = setTimeout(() => {
        setStatus((s) => {
          if (s === "connecting") queueMicrotask(fallBack);
          return s;
        });
      }, 6000);
      tRef.current = t;
      return () => {
        clearTimeout(timer);
        tRef.current?.close();
        tRef.current = null;
      };
    }
    t = localTransport(channelName, me, setPeers, onMsg);
    tRef.current = t;
    return () => {
      tRef.current?.close();
      tRef.current = null;
    };
  }, [channelName, me]);

  return {
    peers,
    status,
    send: (msg: M) => tRef.current?.send(msg),
  };
}
