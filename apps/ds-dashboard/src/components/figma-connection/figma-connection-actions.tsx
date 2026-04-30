import { Button } from '@/components/ui/button';

interface FigmaConnectionActionsProps {
  size: 'default' | 'sm';
  buttonLabel: string;
  uiState: {
    disabled: boolean;
    isLoading: boolean;
    isResetting: boolean;
    isWaiting: boolean;
    isLoadingContext: boolean;
    canResolve: boolean;
    isRecoveryActive: boolean;
    showDesignContextCompact: boolean;
    isConnected: boolean;
  };
  uiActions: {
    onTest: () => void;
    onInspectSelection: () => void;
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
    isLoadingContext,
    canResolve,
    isRecoveryActive,
    showDesignContextCompact,
    isConnected,
  } = uiState;

  const { onTest, onInspectSelection, onOpenResolveModal } = uiActions;

  return (
    <div className="mt-4 flex w-full flex-wrap items-start justify-start gap-2">
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={onTest}
        disabled={disabled || isLoading || isResetting}
      >
        {isLoading ? 'Testing MCP…' : buttonLabel}
      </Button>

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

      {showDesignContextCompact ? (
        <Button
          type="button"
          variant="outline"
          size={size}
          onClick={onInspectSelection}
          disabled={
            disabled ||
            isLoading ||
            isResetting ||
            isWaiting ||
            isLoadingContext ||
            !isConnected
          }
        >
          {isLoadingContext ? 'Inspecting selection…' : 'Inspect selection'}
        </Button>
      ) : null}
    </div>
  );
}
