// Settings & models (manual §24, §43): runtime health, provider credentials, versions and provenance.
import React, { useEffect, useState } from 'react';
import type { RuntimeHealth } from '@atlas/contracts';
import { Badge, Button, Field, Input, KV, Status, Toggle } from '../ui/primitives';
import { call, type AppInfo, type Credentials, type SettingsState } from './api';
import { toast } from './toast';

const NAMES: Record<string, string> = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google Gemini' };

export function Settings() {
  const [health, setHealth] = useState<RuntimeHealth[] | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [confirmUnsafe, setConfirmUnsafe] = useState(false);
  const load = () => {
    void call('runtime.health').then(setHealth).catch(() => {});
    void call('credentials.list').then(setCreds).catch(() => {});
    void call('app.info').then(setInfo).catch(() => {});
    void call('settings.get').then(setSettings).catch(() => {});
  };
  const setUnsandboxed = async (value: boolean) => {
    try { setSettings(await call('settings.set', { key: 'execution.allowUnsandboxed', value })); setConfirmUnsafe(false); }
    catch (e) { toast({ tone: 'danger', title: 'Setting not saved', body: (e as Error).message }); }
  };
  useEffect(load, []);
  const save = async (provider: 'anthropic' | 'openai' | 'google') => {
    try { setCreds(await call('credentials.set', { provider, key: draft[provider] ?? '' })); setDraft((d) => ({ ...d, [provider]: '' })); toast({ tone: 'info', title: `${NAMES[provider]} key saved`, body: 'Encrypted with the OS credential store. It is never shown again or sent to the interface.' }); load(); }
    catch (e) { toast({ tone: 'danger', title: 'Key not saved', body: (e as Error).message }); }
  };
  const remove = async (provider: 'anthropic' | 'openai' | 'google') => {
    try { setCreds(await call('credentials.remove', { provider })); toast({ tone: 'info', title: `${NAMES[provider]} key removed` }); load(); }
    catch (e) { toast({ tone: 'danger', title: 'Key not removed', body: (e as Error).message }); }
  };
  return (
    <div className="at-screen lv-page" data-testid="settings">
      <div className="at-pagehead"><span className="heading">Settings</span></div>
      <div className="lv-scroll">
        <div className="lv-narrow">
          <section className="lv-section">
            <div className="at-label">Agent runtimes</div>
            {(health ?? []).map((h) => (
              <div key={h.runtime} className="lv-rt" data-testid={`runtime-${h.runtime}`}>
                <Status s={h.ok ? 'done' : 'warning'} label={h.runtime === 'pi' ? `Pi ${h.version}` : 'Scripted runtime'} />
                <span className="at-muted lv-small">{h.detail}</span>
              </div>
            ))}
            {!health && <div className="at-subtle lv-small">Checking…</div>}
          </section>
          <section className="lv-section" data-testid="isolation">
            <div className="at-label">Execution isolation</div>
            {settings && (
              <div className="lv-rt">
                <Status s={settings.sandbox.kind === 'none' ? 'failed' : 'done'} label={settings.sandbox.kind === 'bwrap' ? 'Sandboxed · bubblewrap' : settings.sandbox.kind === 'sandbox-exec' ? 'Sandboxed · macOS Seatbelt' : 'No OS sandbox'} />
                <span className="at-muted lv-small">
                  {settings.sandbox.kind === 'none'
                    ? settings.sandbox.detail
                    : 'Agent commands and checks run with no access to your home directory, other projects or credentials, no network unless you approve a network command, and their own process namespace.'}
                </span>
              </div>
            )}
            {settings?.sandbox.kind === 'none' && (
              <div className="lv-callout" style={{ marginTop: 0 }}>
                <div style={{ flex: 1 }}>
                  <b>Allow unsandboxed execution.</b> Repository scripts and approved commands would run as your user and could read your files and credentials. Only enable this for repositories you fully trust.
                  <div className="at-row" style={{ gap: 8, marginTop: 8 }}>
                    {settings.values['execution.allowUnsandboxed']
                      ? <><Badge tone="danger">unsandboxed execution allowed</Badge><Button size="sm" onClick={() => void setUnsandboxed(false)}>Turn off</Button></>
                      : confirmUnsafe
                        ? <><Button size="sm" variant="danger-fill" onClick={() => void setUnsandboxed(true)}>I understand, allow it</Button><Button size="sm" variant="ghost" onClick={() => setConfirmUnsafe(false)}>Cancel</Button></>
                        : <Toggle on={false} onChange={() => setConfirmUnsafe(true)} label="Allow unsandboxed execution" />}
                  </div>
                </div>
              </div>
            )}
          </section>
          <section className="lv-section">
            <div className="at-label">Model provider keys</div>
            <p className="at-muted lv-small">Keys are encrypted with the operating system credential store and passed only to the agent runtime process. They are redacted from every log, event and artifact.{creds && !creds.available ? ' No credential store is available on this system: export the variable before launching ATLAS instead.' : ''}</p>
            {creds?.providers.map((p) => (
              <Field key={p.provider} label={NAMES[p.provider]} aside={p.stored ? <Badge tone="success">saved</Badge> : p.fromEnvironment ? <Badge tone="outline">from {p.env}</Badge> : <Badge tone="outline">not set</Badge>}>
                <div className="at-row" style={{ gap: 8 }}>
                  <Input type="password" autoComplete="off" spellCheck={false} placeholder={p.stored ? '•••••••• saved' : `Paste a ${NAMES[p.provider]} API key`} value={draft[p.provider] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [p.provider]: e.target.value }))} style={{ flex: 1 }} disabled={!creds.available} />
                  <Button disabled={!creds.available || (draft[p.provider] ?? '').trim().length < 8} onClick={() => void save(p.provider as any)}>Save</Button>
                  {p.stored && <Button variant="ghost" onClick={() => void remove(p.provider as any)}>Remove</Button>}
                </div>
              </Field>
            ))}
          </section>
          <section className="lv-section">
            <div className="at-label">About</div>
            {info && <KV col={150} rows={[
              ['ATLAS', info.version], ['Electron', info.electron], ['Chromium', info.chrome], ['Daemon Node', info.node], ['Database schema', `v${info.schema}`],
              ['Pi runtime', `${info.pi.package}@${info.pi.version}`], ['Pi source', `${info.pi.repository} @ ${info.pi.gitHead.slice(0, 12)} · ${info.pi.license}`],
              ['Network', 'No telemetry. Outbound traffic only to model providers you configure.'],
            ]} />}
          </section>
        </div>
      </div>
    </div>
  );
}
