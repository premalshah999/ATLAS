import { actions } from './store';

/** In the design preview, opening a repository is illustrative only. */
export async function openRepository(): Promise<boolean> {
  actions().toast({ tone: 'info', title: 'Design preview', body: 'This screen shows sample data. Open repositories from Projects in the live app.' });
  return false;
}
