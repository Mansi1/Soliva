// mouseLock.ts
// Im Vollbild sperrt das Spiel die Maus ein (Pointer Lock). Sonst holt macOS
// die Menüleiste herunter, sobald der Zeiger oben anstößt - eine Webseite kann
// das nicht abschalten. Gesperrt meldet der Browser nur noch Bewegungen; der
// Zeiger hier ist ein eigenes Bild, das am Bildrand stehen bleibt. Klicks, Rad
// und Bewegungen schickt dieses Modul als nachgebaute Ereignisse an das
// Element unter dem Zeiger - die übrigen Teile merken davon nichts.
//
// Esc gibt die Maus frei (Safari beendet damit auch das Vollbild). Chrome
// reicht Esc per Keyboard Lock ans Spiel weiter; dort beendet langes Drücken
// das Vollbild. Ein Klick im Vollbild sperrt die Maus wieder ein.

/** Bild und Klickpunkt eines CSS-Zeigers aus `url(...) x y`, sonst null. */
export function cursorImage(css: string): { url: string; x: number; y: number } | null {
  const m = /^url\("?(.*?)"?\)\s*(-?[\d.]+)?\s*(-?[\d.]+)?/.exec(css);
  return m ? { url: m[1], x: Number(m[2] ?? 0), y: Number(m[3] ?? 0) } : null;
}

const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`)}`;

/**
 * Nachgezeichnete Systemzeiger. ponytail: nur Pfeil, Fadenkreuz und Hand;
 * weitere (grabbing, copy, ns-resize ...) zeichnen, wenn sie im Vollbild fehlen.
 */
const SYSTEM_CURSORS: Record<string, { url: string; x: number; y: number }> = {
  default: {
    url: svg('<path d="M2 2 L2 22 L7.5 17 L11 25 L14.5 23.5 L11 15.5 L18 15.5 Z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>'),
    x: 2, y: 2,
  },
  crosshair: {
    url: svg('<path d="M16 3 V29 M3 16 H29" stroke="#fff" stroke-width="4"/><path d="M16 3 V29 M3 16 H29" stroke="#000" stroke-width="1.5"/>'),
    x: 16, y: 16,
  },
  pointer: {
    url: svg('<path d="M10 3 Q12 1 14 3 L14 12 L23 13.5 Q26 14 25.5 17 L24 25 Q23 29 19 29 L13 29 Q10 29 8 26 L3.5 19 Q2.5 16.5 5 16 Q6.5 15.8 8 17.5 L10 20 Z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>'),
    x: 12, y: 2,
  },
};

type KeyboardLock = { lock(keys?: string[]): Promise<void>; unlock(): void };
const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

/** Ereignisse, die gesperrt beim gesperrten Element landen und umgeleitet werden. */
const FORWARDED = ['mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel'] as const;
/** Zu diesen Maus-Ereignissen gibt es ein Pointer-Ereignis, das der Browser vorher schickt. */
const POINTER_TWIN: Record<string, string> = { mousedown: 'pointerdown', mouseup: 'pointerup', mousemove: 'pointermove' };

/**
 * Ein nachgebautes Rad-Ereignis scrollt nicht von selbst: das nächste
 * scrollbare Element über dem Ziel scrollen, wie es der Browser täte.
 * ponytail: ohne Weiterreichen an äußere Elemente am Ende des Inhalts; nachrüsten, wenn verschachtelte Listen das brauchen.
 */
function scrollWheel(target: Element, e: WheelEvent) {
  for (let el: Element | null = target; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      // Zeilen bzw. Seiten (Firefox mit Mausrad) in Pixel umrechnen, wie MouseInput.wheel.
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollBy(e.deltaX * unit, e.deltaY * unit);
      return;
    }
  }
}

/** Einmal beim Start: sperrt die Maus, solange die Seite im Vollbild ist. */
export function initMouseLock() {
  if (!('requestPointerLock' in document.body)) return;
  let x = innerWidth / 2;
  let y = innerHeight / 2;
  /** Element unter dem Zeiger, solange gesperrt. */
  let hover: Element | null = null;
  /** Wo die Taste gedrückt wurde - ein Klick zählt nur auf demselben Element. */
  let downTarget: Element | null = null;
  /** Regler, der gerade gezogen wird - ein nachgebautes Ereignis bewegt ihn nicht. */
  let slider: HTMLInputElement | null = null;
  let frame = 0;

  const img = document.createElement('img');
  img.alt = '';
  img.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:32px;pointer-events:none;z-index:2147483647';
  img.hidden = true;
  document.body.append(img);

  const locked = () => document.pointerLockElement === document.body;
  const lock = () => {
    document.body.requestPointerLock();
    keyboard()?.lock(['Escape']).catch(() => {});
  };

  const init = (type: string, e: MouseEvent): MouseEventInit => ({
    bubbles: !type.endsWith('enter') && !type.endsWith('leave'),
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: e.button,
    buttons: e.buttons,
    detail: e.detail,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    relatedTarget: null,
  });
  /** Schickt das nachgebaute Ereignis; false, wenn ein Empfänger preventDefault aufrief. */
  const fire = (target: EventTarget, type: string, e: MouseEvent): boolean => {
    const twin = POINTER_TWIN[type];
    if (twin) target.dispatchEvent(new PointerEvent(twin, { ...init(twin, e), pointerType: 'mouse', isPrimary: true }));
    if (e instanceof WheelEvent) {
      return target.dispatchEvent(new WheelEvent(type, { ...init(type, e), deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode }));
    } else {
      return target.dispatchEvent(new MouseEvent(type, init(type, e)));
    }
  };

  /** mouseleave/-enter wie der Browser: an jedem Vorfahren, den der Zeiger verlässt bzw. betritt. */
  const moveHover = (next: Element | null, e: MouseEvent) => {
    if (next === hover) return;
    const left: Element[] = [];
    for (let el = hover; el && !el.contains(next); el = el.parentElement) left.push(el);
    const entered: Element[] = [];
    for (let el = next; el && !el.contains(hover); el = el.parentElement) entered.unshift(el);
    if (hover) fire(hover, 'mouseout', e);
    for (const el of left) { fire(el, 'pointerleave', e); fire(el, 'mouseleave', e); }
    if (next) fire(next, 'mouseover', e);
    for (const el of entered) { fire(el, 'pointerenter', e); fire(el, 'mouseenter', e); }
    hover = next;
  };

  const dragSlider = () => {
    if (!slider) return;
    const r = slider.getBoundingClientRect();
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    // Der Browser rundet beim Setzen auf `step`.
    slider.value = String(min + (max - min) * Math.min(1, Math.max(0, (x - r.left) / r.width)));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /** Zeigerbild nach dem CSS-`cursor` des Elements darunter - je Bild, weil das Spiel ihn auch ohne Bewegung wechselt. */
  const drawCursor = () => {
    frame = requestAnimationFrame(drawCursor);
    const css = hover ? getComputedStyle(hover).cursor : 'default';
    const c = cursorImage(css) ?? SYSTEM_CURSORS[css] ?? SYSTEM_CURSORS.default;
    if (img.src !== c.url) img.src = c.url;
    img.style.transform = `translate(${x - c.x}px, ${y - c.y}px)`;
  };

  window.addEventListener('mousemove', (e) => {
    if (!e.isTrusted) return;
    if (!locked()) {
      x = e.clientX;
      y = e.clientY;
      return;
    }
    e.stopImmediatePropagation();
    x = Math.min(innerWidth - 1, Math.max(0, x + e.movementX));
    y = Math.min(innerHeight - 1, Math.max(0, y + e.movementY));
    moveHover(document.elementFromPoint(x, y), e);
    if (hover) fire(hover, 'mousemove', e);
    dragSlider();
  }, true);

  for (const type of FORWARDED) {
    window.addEventListener(type, (e) => {
      if (!locked()) return;
      // Nur echte Ereignisse umleiten, nicht die eigenen nachgebauten.
      if (!e.isTrusted) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const target = hover ?? document.body;
      if (type === 'mousedown') {
        downTarget = target;
        if (e.button === 0 && target instanceof HTMLInputElement && target.type === 'range') slider = target;
        dragSlider();
      }
      if ((type === 'click' || type === 'dblclick' || type === 'auxclick') && target !== downTarget) return;
      if (type === 'mouseup' && slider) {
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        slider = null;
      }
      if (fire(target, type, e) && e instanceof WheelEvent) scrollWheel(target, e);
    }, { capture: true, passive: false });
  }

  // Im Vollbild ohne Sperre (nach Esc): der nächste Klick sperrt wieder.
  window.addEventListener('mousedown', () => {
    if (document.fullscreenElement && !locked()) lock();
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) lock();
    else {
      document.exitPointerLock();
      keyboard()?.unlock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    img.hidden = !locked();
    cancelAnimationFrame(frame);
    if (locked()) {
      hover = document.elementFromPoint(x, y);
      drawCursor();
    } else {
      // Die echte Maus taucht dort auf, wo sie gesperrt wurde - der Spielzeiger ist weg.
      slider = null;
      hover = null;
    }
  });
  document.addEventListener('pointerlockerror', () => console.warn('Pointer lock was refused'));
}
