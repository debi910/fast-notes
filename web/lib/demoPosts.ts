// Illustrative post text for the feed demo. Community Notes data has the note, not the post,
// so the feed shows a made-up post that matches what the note corrects. Labelled in the UI.

const BY_TOPIC: { match: RegExp; text: string }[] = [
  { match: /photo|image/i, text: "This photo was taken THIS WEEK. Look at the size of that crowd. Media won't show you this. 👀" },
  { match: /annual|monthly|figure/i, text: "Unbelievable. The city spent $48 MILLION last month on consultants. Where is the money going?!" },
  { match: /video|city|street/i, text: "Chaos downtown right now. This is what they don't want you to see. Share before it gets taken down." },
  { match: /bill|committee|passed/i, text: "BREAKING: The new law passed today. Starting Monday you'll need a permit to own a drone. RT to spread the word." },
  { match: /chart|axis/i, text: "Look at this chart. Prices have literally EXPLODED in a year. Nobody is talking about it." },
  { match: /quote|transcript|speech/i, text: "“We don't need voters, we need obedience.” — said on stage last night. Let that sink in." },
  { match: /polling|election|voting/i, text: "⚠️ Heads up: polling places in the county close at 3 PM tomorrow, not 8. Tell everyone you know." },
  { match: /study|retract/i, text: "New study proves it: the supplement cuts heart attacks by 70%. Doctors hate this." },
];

export function illustrativePost(noteSummary: string): string {
  return BY_TOPIC.find((t) => t.match.test(noteSummary))?.text ?? "You won't believe what just happened. Everyone needs to see this. 🔁";
}

export const FILLER_POSTS = [
  { name: "Maya Chen", handle: "mayabakes", text: "Third attempt at sourdough and it finally rose. Small wins 🍞", time: "2h" },
  { name: "Transit Updates", handle: "metro_updates", text: "Line 4 is running on a modified schedule this weekend due to track work.", time: "3h" },
  { name: "Sam Ortiz", handle: "samortiz", text: "Anyone else watching the match tonight? That second half was unreal.", time: "4h" },
];
