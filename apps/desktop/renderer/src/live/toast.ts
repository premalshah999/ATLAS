// Reuses the design-system toast stack (owned by the prototype store) for live notifications.
import { actions } from '../lib/store';
import type { Toast } from '../lib/store';

export function toast(t: Omit<Toast, 'id' | 'action'>) { actions().toast(t); }
