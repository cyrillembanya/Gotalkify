import ClassRoom from "@/components/video/ClassRoom";

export const metadata = {
  title: "Classroom",
  // Class links must never end up in a search index or a referrer header.
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ClassPage({ params }) {
  return <ClassRoom roomId={params.roomId} />;
}
