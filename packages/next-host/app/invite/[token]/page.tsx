import { InviteAcceptScreen } from "../../../src/features/invite/InviteAcceptScreen";

export default async function InviteTokenPage(args: Readonly<{ params: Promise<{ token: string }> }>) {
  const params = await args.params;
  return (
    <div className="invite-accept-layout">
      <InviteAcceptScreen inviteToken={params.token} />
    </div>
  );
}
