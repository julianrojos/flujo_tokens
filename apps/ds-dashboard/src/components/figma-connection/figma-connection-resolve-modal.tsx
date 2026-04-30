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
  const { open, disabled, resolveConfirmed } = dialogState;
  const { onClose, onResolve, onResolveConfirmedChange } = dialogActions;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent size="md">
        <ModalHeader>
          <div className="flex items-start justify-between gap-4">
            <h2
              id="figma-mcp-reset-confirm-title"
              className="text-lg font-titles font-semibold tracking-tight titles-color"
            >
              Resolve connection
            </h2>
            <ModalCloseButton onClick={onClose} label="Close Figma connection modal" />
          </div>
        </ModalHeader>

        <div className="px-5 pb-2">
          <p className="mb-4 text-sm text-muted-foreground">
            This will refresh the plugin session state managed by this dashboard to force a clean
            reconnect.
          </p>
          <Checkbox
            id="figma-mcp-resolve-confirm"
            checked={resolveConfirmed}
            onChange={(e) => onResolveConfirmedChange(e.target.checked)}
            label="I understand the impact and want to continue"
            className="mb-5"
          />
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onResolve} disabled={!resolveConfirmed || disabled}>
            Resolve connection
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
