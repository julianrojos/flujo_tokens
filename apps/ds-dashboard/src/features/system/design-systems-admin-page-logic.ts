export interface BuildUpdateActionsPropsArgs {
  systemId: string;
  figmaFileId?: string;
  disabled: boolean;
}

export type DesignSystemUpdateActionsViewProps = BuildUpdateActionsPropsArgs;

/**
 * Keep update actions stateless regarding admin drafts:
 * no auto-reload callback should be wired from the admin page.
 */
export function buildUpdateActionsProps(
  args: BuildUpdateActionsPropsArgs,
): DesignSystemUpdateActionsViewProps {
  return { ...args };
}
