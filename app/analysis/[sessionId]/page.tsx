import { notFound } from "next/navigation";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { proSwingReferences } from "@/lib/data/pro-swings";
import { getSampleSession, sampleVideos } from "@/lib/data/seed";
import type { AnalysisSession } from "@/lib/types";

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
        initialSession={session ?? createLocalSessionShell(sessionId)}
        initialVideos={sampleVideos}
        proSwings={proSwingReferences}
      />
    </div>
  );
}

function createLocalSessionShell(sessionId: string): AnalysisSession {
  return {
    id: sessionId,
    userId: "user-demo",
    title: "Imported swing",
    primaryVideoId: "",
    syncEnabled: false,
    playbackDefaults: {
      speed: 0.5,
    },
    notes: "",
    lastOpenedAt: new Date().toISOString(),
    panes: [
      {
        id: "primary",
        label: "My swing",
        overlayVisible: true,
        playbackRate: 0.5,
        currentTime: 0,
      },
      {
        id: "secondary",
        label: "Comparison",
        overlayVisible: true,
        playbackRate: 0.5,
        currentTime: 0,
      },
    ],
    annotations: {
      primary: [],
      secondary: [],
    },
    snapshotMarkers: [],
  };
}
