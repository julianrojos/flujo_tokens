import { cn } from '@/lib/utils';

const RECOVERY_STEPS = [
  'Refresh DS Graph status',
  'Wait for reconnection',
  'Reopen DS Graph plugin in Figma',
] as const;

interface FigmaConnectionRecoveryStepperProps {
  showRecoveryStepper: boolean;
  activeRecoveryStep: number;
  isResetting: boolean;
  isWaiting: boolean;
  resetSecondsLeft: number;
  waitSecondsLeft: number;
}

export function FigmaConnectionRecoveryStepper({
  showRecoveryStepper,
  activeRecoveryStep,
  isResetting,
  isWaiting,
  resetSecondsLeft,
  waitSecondsLeft,
}: FigmaConnectionRecoveryStepperProps) {
  if (!showRecoveryStepper) return null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {RECOVERY_STEPS.map((label, index) => {
          const isDone = activeRecoveryStep > index;
          const isActive = activeRecoveryStep === index;
          return (
            <div
              key={label}
              className={cn(
                'flex items-center gap-2 text-sm',
                isDone
                  ? 'text-status-success'
                  : isActive
                    ? 'text-status-warning'
                    : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold',
                  isDone
                    ? 'border-status-success/60 bg-status-success/20 text-status-success'
                    : isActive
                      ? 'border-status-warning/60 bg-status-warning/20 text-status-warning'
                      : 'border-muted-foreground/50',
                )}
              >
                {index + 1}
              </span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      {isResetting ? (
        <p className="break-words text-sm text-status-warning">
          ↺ Refreshing DS Graph status… retrying in {resetSecondsLeft}s.
        </p>
      ) : isWaiting ? (
        <p className="break-words text-sm text-status-warning">
          ⏳ Retrying connection… {waitSecondsLeft}s left. Open the DS Graph plugin now.
        </p>
      ) : (
        <p className="break-words text-sm text-status-warning">
          ⚠ No reconnection detected. Open the DS Graph plugin and click
          &nbsp;&ldquo;Resolve connection&rdquo; again.
        </p>
      )}
    </div>
  );
}
