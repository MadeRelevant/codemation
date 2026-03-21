import { InviteAcceptScreen } from "../../../src/features/invite/screens/InviteAcceptScreen";

export default async function InviteTokenPage(args: Readonly<{ params: Promise<{ token: string }> }>) {
  const params = await args.params;
  return (
    <div className="min-h-0 flex-1 bg-background">
      <InviteAcceptScreen inviteToken={params.token} />
    </div>
  );
}
