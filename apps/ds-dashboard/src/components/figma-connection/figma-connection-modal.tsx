import { getConnectionStatusTitle } from '@/components/ui/connection-status-dot';
import {
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@/components/ui/overlay';
import { useFigmaMcpStatus } from '@/lib/figma-mcp-status-context';
import { FigmaConnectionPanel } from './figma-connection-panel';

interface FigmaConnectionModalProps {
  open: boolean;
  onClose: () => void;
}

export function FigmaConnectionModal({ open, onClose }: FigmaConnectionModalProps) {
  const { connectionState } = useFigmaMcpStatus();

  return (
    <Modal open={open} onClose={onClose} aria-labelledby="figma-connection-modal-title">
      <ModalContent size="md">
        <ModalHeader className="items-start justify-between gap-4">
          <h2
            id="figma-connection-modal-title"
            className="text-lg font-titles font-semibold tracking-tight titles-color"
          >
            Figma connection
          </h2>
          <ModalCloseButton onClick={onClose} label="Close Figma connection modal" />
        </ModalHeader>
        <FigmaConnectionPanel connectionStatusTitle={getConnectionStatusTitle(connectionState)} />
        <ModalFooter />
      </ModalContent>
    </Modal>
  );
}
