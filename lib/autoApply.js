export async function sendApplication() {
  console.warn(
    "[autoApply] Skipped: automatic sending is disabled; review and submit applications manually.",
  );
  return false;
}
