import { redirect } from "next/navigation";

interface ComparePageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function ComparePage({ params }: ComparePageProps) {
  const { sessionId } = await params;

  redirect(`/analysis/${sessionId}?compare=true`);
}
