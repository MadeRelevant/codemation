export type GmailServiceAccountCredential = Readonly<{
  clientEmail: string;
  privateKey: string;
  projectId: string;
  delegatedUser: string;
}>;
