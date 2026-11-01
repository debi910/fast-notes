"use client";

import { FeedDemo } from "@/components/FeedDemo";
import { loadShowcase, pickDemoNote, pickFeedNote, useData } from "@/lib/data";

export function FeedDemoLoader({ noteId, pick }: { noteId?: string; pick?: "feed" }) {
  const { data, error } = useData(loadShowcase);
  if (error) return <p className="text-sm text-late">{error}</p>;
  if (!data) return <div className="card h-[420px] animate-pulse bg-surface-2/60" />;
  const note = (noteId && data.notes.find((n) => n.id === noteId)) || (pick === "feed" ? pickFeedNote(data.notes) : pickDemoNote(data.notes));
  return <FeedDemo key={note.id} note={note} />;
}
