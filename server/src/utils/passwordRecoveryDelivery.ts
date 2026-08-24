export function recoveryRecipientMatchesRequest(
  requestedEmail: string,
  recipientEmail: string | undefined,
) {
  if (!recipientEmail) {
    return false;
  }

  return (
    requestedEmail.trim().toLowerCase() === recipientEmail.trim().toLowerCase()
  );
}
