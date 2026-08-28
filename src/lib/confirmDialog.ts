import { Modal } from '@douyinfe/semi-ui';

type ConfirmDialogProps = Parameters<typeof Modal.confirm>[0];

export function confirmDialog(props: ConfirmDialogProps) {
  return Modal.confirm({
    ...props,
    cancelButtonProps: {
      ...props.cancelButtonProps,
      autoFocus: false,
    },
    okButtonProps: {
      ...props.okButtonProps,
      autoFocus: true,
      'aria-keyshortcuts': 'Enter',
    },
  });
}
