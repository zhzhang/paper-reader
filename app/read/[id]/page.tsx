import { Reader } from "@/components/reader/Reader";

export const instant = false;

export default async function ReadPage({
  params,
}: PageProps<"/read/[id]">) {
  const { id } = await params;
  return <Reader paperId={id} />;
}
