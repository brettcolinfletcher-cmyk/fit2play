import Link from "next/link";
import SectionComment from "./SectionComment";

type Props = {
  athleteId: string;
  sectionComment: string | null;
};

export default function DynamometrySection({ athleteId, sectionComment }: Props) {
  return (
    <section id="dynamometry" className="scroll-mt-28 mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
        Dynamometry
      </h2>
      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
        <p className="text-sm text-slate-500">
          No dynamometry data uploaded yet.{" "}
          <Link
            href="/dashboard/upload"
            className="text-lime-400/90 hover:text-lime-300 hover:underline"
          >
            Upload data →
          </Link>
        </p>
      </div>
      <SectionComment
        athleteId={athleteId}
        section="dynamometry"
        initialComment={sectionComment}
      />
    </section>
  );
}
