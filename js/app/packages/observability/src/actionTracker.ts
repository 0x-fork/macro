import { getImpl, isInitialized } from './shared';

export function startAction(name: string, context?: object) {
  const impl = getImpl();
  if (!isInitialized() || !impl) return;

  impl.addAction(name, context);
}
