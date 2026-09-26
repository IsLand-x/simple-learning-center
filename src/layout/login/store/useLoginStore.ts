import { useEffect, useState, type FormEvent } from 'react';
import { applyAppTheme, readInitialThemeMode } from '../../../util/appTheme';
import { login } from '../../../util/api/auth';

export function useLoginStore(onAuthenticated: () => void) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [themeMode, setThemeMode] = useState(readInitialThemeMode);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    applyAppTheme(themeMode);
  }, [themeMode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      onAuthenticated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    username,
    setUsername,
    password,
    setPassword,
    themeMode,
    setThemeMode,
    error,
    submitting,
    submit,
  };
}
