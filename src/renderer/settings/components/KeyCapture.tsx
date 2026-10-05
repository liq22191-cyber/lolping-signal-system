import { Button, Text } from '@fluentui/react-components';
import { EditRegular } from '@fluentui/react-icons';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../api';
import { evaluateKeyDown } from '../keyCaptureLogic';
import { useText } from '../text';

export interface Captured {
  mods: number;
  vk: number;
}

/**
 * Click, then press a key (or shortcut). Esc cancels. The hook helper is suspended while listening.
 * `autoListen` starts listening (and focuses the button) on mount. `onCancel` fires when listening ends without a key
 * (Esc or the button losing focus), never after a successful capture.
 * `requireModifier` makes it a shortcut capture: Ctrl, Alt or Win must be held (Shift alone is rejected).
 * `forbiddenVks` lists keys that can't be captured (a swallowed trigger key must not be one that breaks typing).
 */
export function KeyCapture(props: {
  parts: string[];
  requireModifier: boolean;
  forbiddenVks?: readonly number[];
  onCapture(c: Captured): void;
  error?: string | null;
  autoListen?: boolean;
  onCancel?(): void;
}) {
  const t = useText();
  const [listening, setListening] = useState(props.autoListen === true);
  const [hint, setHint] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Mirrors `listening` synchronously so a blur that follows a finished capture is never reported as a cancel.
  const listeningRef = useRef(props.autoListen === true);

  useEffect(() => {
    void api.setCapturing(listening);
  }, [listening]);
  useEffect(() => () => void api.setCapturing(false), []);

  useEffect(() => {
    if (!props.autoListen) return;
    // Deferred: a Fluent Dropdown that just closed may hand focus back to its combobox, and the button must win.
    const timer = setTimeout(() => buttonRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []); // autoListen only matters at mount

  const finish = (cancelled: boolean) => {
    const wasListening = listeningRef.current;
    listeningRef.current = false;
    setListening(false);
    setHint(null);
    if (cancelled && wasListening) props.onCancel?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();
    const outcome = evaluateKeyDown(e, { requireModifier: props.requireModifier, forbiddenVks: props.forbiddenVks });
    switch (outcome.kind) {
      case 'cancel':
        return finish(true);
      case 'hint':
        return setHint(t[outcome.hint]);
      case 'capture':
        finish(false);
        return props.onCapture({ mods: outcome.mods, vk: outcome.vk });
      case 'ignore':
        return;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <Button
        ref={buttonRef}
        appearance={listening ? 'outline' : 'secondary'}
        icon={<EditRegular />}
        iconPosition="after"
        onClick={() => {
          listeningRef.current = true;
          setListening(true);
        }}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (e.code === 'Space') e.preventDefault(); // don't re-trigger the button after capturing Space
        }}
      >
        {listening ? (
          <span className="desc">{hint ?? t.pressKey}</span>
        ) : (
          <span className="keys">{props.parts.map((p) => <kbd key={p}>{p}</kbd>)}</span>
        )}
      </Button>
      {props.error ? <Text size={200} style={{ color: 'var(--colorPaletteRedForeground1)' }}>{props.error}</Text> : null}
    </div>
  );
}
