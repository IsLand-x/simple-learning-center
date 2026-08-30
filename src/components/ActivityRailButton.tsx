import type { ReactNode } from 'react';
import { Button, Tooltip } from '@douyinfe/semi-ui';

export function ActivityRailButton({
  active,
  ariaLabel,
  icon,
  label,
  tooltip,
  onClick,
}: {
  active: boolean;
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <Tooltip content={tooltip} position="left">
      <Button
        aria-label={ariaLabel}
        aria-pressed={active}
        className={`activity-button${active ? ' activity-button--active' : ''}`}
        icon={icon}
        size="small"
        theme="borderless"
        type="tertiary"
        onClick={onClick}
      >
        {label}
      </Button>
    </Tooltip>
  );
}
