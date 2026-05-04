import { CollectionDetailScreen } from "../../../../src/features/collections/screens/CollectionDetailScreen";

export default async function CollectionDetailPage(args: Readonly<{ params: Promise<{ name: string }> }>) {
  const params = await args.params;
  return <CollectionDetailScreen name={params.name} />;
}
