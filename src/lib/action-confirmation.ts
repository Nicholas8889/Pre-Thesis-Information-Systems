export function getActionConfirmationRules(input: {
  label: string;
  forceRequiredNote?: boolean;
}) {
  return {
    requiresNote: Boolean(
      input.forceRequiredNote || /delete|remove|reject/i.test(input.label)
    )
  };
}
