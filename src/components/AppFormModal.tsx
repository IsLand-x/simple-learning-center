import type { ComponentProps } from 'react';
import { Modal } from '@douyinfe/semi-ui';

type AppFormModalProps = Omit<ComponentProps<typeof Modal>, 'className' | 'footer'> & {
  className?: string;
};

export function AppFormModal({ className, ...props }: AppFormModalProps) {
  return (
    <Modal
      {...props}
      className={className ? `app-form-modal ${className}` : 'app-form-modal'}
      footer={null}
    />
  );
}
