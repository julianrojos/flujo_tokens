import {
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
} from '@/components/ui/overlay';
import { FigmaConnectionPanel } from './figma-connection-panel';

interface FigmaConnectionModalProps {
  open: boolean;
  onClose: () => void;
}

export function FigmaConnectionModal({ open, onClose }: FigmaConnectionModalProps) {
  return (
    <Modal open={open} onClose={onClose} aria-labelledby="figma-connection-modal-title">
      <ModalContent size="lg">
        <ModalHeader className="items-start justify-between gap-4">
          <h2
            id="figma-connection-modal-title"
            className="text-lg font-titles font-semibold tracking-tight titles-color"
          >
            Figma connection
          </h2>
          <ModalCloseButton onClick={onClose} label="Close Figma connection modal" />
        </ModalHeader>
        <FigmaConnectionPanel />
      </ModalContent>
    </Modal>
  );
}
