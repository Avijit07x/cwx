import { Field as BaseField } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cx } from './cx';
import styles from './Field.module.css';

interface FieldControlProps {
  readonly id: string;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-invalid': boolean | undefined;
}

interface FieldProps {
  readonly label: ReactNode;
  readonly error?: ReactNode;
  readonly className?: string;
  readonly children: (control: FieldControlProps) => ReactNode;
}

export function Field({ label, error, className, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hasError = Boolean(error);
  return (
    <BaseField.Root invalid={hasError} className={cx(styles.field, className)}>
      <BaseField.Label htmlFor={id} className={styles.label}>
        {label}
      </BaseField.Label>
      {children({
        id,
        'aria-describedby': hasError ? errorId : undefined,
        'aria-invalid': hasError ? true : undefined,
      })}
      {hasError && (
        <BaseField.Error id={errorId} match className={styles.error}>
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly ref?: Ref<HTMLInputElement>;
}

export function TextInput({ className, ...rest }: TextInputProps) {
  return <Input className={cx(styles.input, className)} {...rest} />;
}
