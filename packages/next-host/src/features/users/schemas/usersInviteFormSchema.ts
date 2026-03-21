import { z } from "zod";

export const usersInviteFormSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export type UsersInviteFormValues = z.infer<typeof usersInviteFormSchema>;
