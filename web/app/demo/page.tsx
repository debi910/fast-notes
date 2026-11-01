import { FeedDemoLoader } from "@/components/FeedDemoLoader";

export default function DemoPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <p className="text-sm font-semibold uppercase tracking-wider text-late">Same post, two timelines</p>
      <h1 className="mt-2 max-w-[28ch] text-3xl font-semibold sm:text-4xl">Watch a misleading post spread, and see when readers get the context.</h1>
      <p className="mt-3 max-w-[62ch] text-muted">
        Left is Community Notes today: the note waits for raters to drift by. Right is the same note with a Fast Notes room that brings in the
        missing side as soon as the note is written.
      </p>
      <div className="mt-8">
        <FeedDemoLoader pick="feed" />
      </div>
    </div>
  );
}
