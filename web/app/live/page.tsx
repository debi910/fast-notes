import type { Metadata } from "next";
import { Dispatch } from "@/components/Dispatch";

export const metadata: Metadata = {
  title: "Live dispatch · Fast Notes",
  description: "Real raters, each sent to the note that is missing their side.",
};

export default function LivePage() {
  return <Dispatch />;
}
