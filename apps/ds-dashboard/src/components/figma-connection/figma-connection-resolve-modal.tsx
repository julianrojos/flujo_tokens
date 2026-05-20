import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@/components/ui/overlay';

interface FigmaConnectionResolveModalProps {
  dialogState: {
    open: boolean;
    disabled: boolean;
    resolveConfirmed: boolean;
  };
  dialogActions: {
    onClose: () => void;
    onResolve: () => void;
    onResolveConfirmedChange: (value: boolean) => void;
  };
}

export function FigmaConnectionResolveModal({
  dialogState,
  dialogActions,
}: FigmaConnectionResolveModalProps) {
  const titleId = 'figma-connection-resolve-title';
  const { open, disabled, resolveConfirmed } = dialogState;
  const { onClose, onResolve, onResolveConfirmedChange } = dialogActions;

  return (
    <Modal open={open} onClose={onClose} aria-labelledby={titleId}>
      <ModalContent size="sm">
        <ModalHeader className="items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-lg font-titles font-semibold tracking-tight titles-color"
            >
              Resolve connection
            </h2>
          </div>
          <ModalCloseButton onClick={onClose} label="Close resolve connection dialog" />
        </ModalHeader>

        <div className="space-y-4 p-5 pt-4">
          <p className="text-sm text-muted-foreground">
            Refresh the plugin session state to force a clean reconnect.
          </p>
          <Checkbox
            id="figma-mcp-resolve-confirm"
            checked={resolveConfirmed}
            onChange={(e) => onResolveConfirmedChange(e.target.checked)}
            label="I understand the impact and want to continue"
          />
        </div>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={onResolve}
            disabled={!resolveConfirmed || disabled}
          >
            Resolve connection
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
