export function getActionConfirmationRules(input: {
  label: string;
  forceRequiredNote?: boolean;
}) {
  return {
    requiresNote: Boolean(input.forceRequiredNote || /delete|remove/i.test(input.label))
  };
}
