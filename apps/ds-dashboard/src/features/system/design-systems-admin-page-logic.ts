export interface BuildUpdateActionsPropsArgs {
  systemId: string;
  figmaFileId?: string;
  disabled: boolean;
}

export interface DesignSystemUpdateActionsViewProps {
  systemId: string;
  figmaFileId?: string;
  disabled: boolean;
}

/**
 * Keep update actions stateless regarding admin drafts:
 * no auto-reload callback should be wired from the admin page.
 */
export function buildUpdateActionsProps(
  args: BuildUpdateActionsPropsArgs,
): DesignSystemUpdateActionsViewProps {
  return {
    systemId: args.systemId,
    figmaFileId: args.figmaFileId,
    disabled: args.disabled,
  };
}

