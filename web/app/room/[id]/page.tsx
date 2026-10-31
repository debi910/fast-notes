import { Suspense } from "react";
import { Room } from "@/components/Room";

export default function RoomPage({ params }: PageProps<"/room/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-stone-500">Opening room…</p>}>
      {params.then(({ id }) => (
        <Room roomId={id} />
      ))}
    </Suspense>
  );
}
