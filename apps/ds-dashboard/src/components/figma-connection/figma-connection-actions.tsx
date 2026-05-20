import { Button } from '@/components/ui/button';

interface FigmaConnectionActionsProps {
  size: 'default' | 'sm';
  buttonLabel: string;
  uiState: {
    disabled: boolean;
    isLoading: boolean;
    isResetting: boolean;
    isWaiting: boolean;
    canResolve: boolean;
    isRecoveryActive: boolean;
    isConnected: boolean;
    hasTestedConnection: boolean;
  };
  uiActions: {
    onTest: () => void;
    onOpenResolveModal: () => void;
  };
}

export function FigmaConnectionActions({
  size,
  buttonLabel,
  uiState,
  uiActions,
}: FigmaConnectionActionsProps) {
  const {
    disabled,
    isLoading,
    isResetting,
    isWaiting,
    canResolve,
    isRecoveryActive,
    isConnected,
    hasTestedConnection,
  } = uiState;

  const { onTest, onOpenResolveModal } = uiActions;
  const testButtonLabel = (() => {
    if (isLoading) return 'Testing MCP…';
    if (isConnected) return 'Retest';
    if (hasTestedConnection) return 'Retry test';
    return buttonLabel;
  })();

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {canResolve && !isRecoveryActive ? (
        <Button
          type="button"
          variant="outline"
          size={size}
          onClick={onOpenResolveModal}
          disabled={disabled || isLoading}
        >
          Resolve connection
        </Button>
      ) : null}

      <Button
        type="button"
        variant="default"
        size={size}
        onClick={onTest}
        disabled={disabled || isLoading || isResetting || isWaiting}
      >
        {testButtonLabel}
      </Button>
    </div>
  );
}
