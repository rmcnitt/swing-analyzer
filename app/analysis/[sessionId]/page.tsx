import { notFound } from "next/navigation";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { getSampleSession, sampleVideos } from "@/lib/data/seed";

interface AnalysisPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function AnalysisPage({ params }: AnalysisPageProps) {
  const { sessionId } = await params;
  const session = getSampleSession(sessionId);

  if (!session && !sessionId.startsWith("local-")) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-background)]">
      <AnalysisWorkspace
        sessionId={sessionId}
        seedSession={session}
        initialVideos={sampleVideos}
      />
    </div>
  );
}
