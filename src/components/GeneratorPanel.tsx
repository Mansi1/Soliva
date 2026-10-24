// GeneratorPanel.tsx
// Die Seite des Kartengenerators (/generator): das Canvas, oben links die
// Bilder je Sekunde und rechts das Panel
// mit Seed und einem Regler je Wert aus TERRAIN_PARAMS (generatorParams.ts).
// Einmal gerendert; jede Änderung geht mit Seed und allen Werten an
// generator.ts, das Gelände und Adresse nachzieht (VERIFIED: tools/ui/smoke.mjs
// schiebt einen Regler und findet den Wert in der Adresse).

import { createRef, render, type Ref } from 'defuss';
import type { TerrainParams } from '../noise';
import { TERRAIN_PARAMS } from '../noise';
import { SLIDERS, type ParamKey } from '../generatorParams';
import './GeneratorPanel.css';

export interface GeneratorHooks {
  change(seed: string, params: TerrainParams): void;
  /** Von oben oder schräg wie im Spiel - liefert, ob jetzt schräg. */
  tilt(): boolean;
  /** Bäume aus der Ferne als Bild (schnell) oder immer als Modell. */
  billboards(on: boolean): void;
}

/** Wert zum Anzeigen: so viele Stellen, wie der Schritt des Reglers hat. */
function shown(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(decimals);
}

export function mountGenerator(root: HTMLElement, seed: string, initial: TerrainParams, hooks: GeneratorHooks): { canvas: HTMLCanvasElement; fps: HTMLDivElement } {
  const canvas = createRef<HTMLCanvasElement>();
  const fps = createRef<HTMLDivElement>();
  const seedInput = createRef<HTMLInputElement>();
  const tiltButton = createRef<HTMLButtonElement>();
  const inputs = new Map<ParamKey, Ref<HTMLInputElement>>(SLIDERS.map((sl) => [sl.key, createRef()]));
  const values = new Map<ParamKey, Ref<HTMLSpanElement>>(SLIDERS.map((sl) => [sl.key, createRef()]));
  const params: TerrainParams = { ...initial };

  const show = (key: ParamKey) => {
    const slider = SLIDERS.find((sl) => sl.key === key)!;
    inputs.get(key)!.current.value = String(params[key]);
    values.get(key)!.current.textContent = shown(params[key], slider.step);
    values.get(key)!.current.classList.toggle('changed', params[key] !== TERRAIN_PARAMS[key]);
  };
  const changed = () => hooks.change(seedInput.current.value.trim() || seed, { ...params });
  const setSeed = (value: string) => {
    seedInput.current.value = value;
    changed();
  };
  const reset = () => {
    Object.assign(params, TERRAIN_PARAMS);
    SLIDERS.forEach((sl) => show(sl.key));
    changed();
  };

  const groups = [...new Set(SLIDERS.map((sl) => sl.group))];
  render(
    <>
      <canvas class="gen-canvas" ref={canvas} />
      {/* Bilder je Sekunde - setzt generator.ts. */}
      <div class="gen-fps" ref={fps} />
      <aside class="gen-panel">
        <div class="gen-brand"><b>Kartengenerator</b><a href={import.meta.env.BASE_URL}>zum Spiel</a></div>
        <label class="gen-seed">
          <span>Seed</span>
          <input ref={seedInput} type="text" value={seed} spellcheck={false}
            onChange={changed} />
        </label>
        <div class="gen-buttons">
          <button type="button" class="wood-btn" onClick={() => setSeed(Math.random().toString(36).slice(2, 8))}>Zufälliger Seed</button>
          <button type="button" class="wood-btn" ref={tiltButton}
            onClick={() => { tiltButton.current.textContent = hooks.tilt() ? 'Von oben' : 'Schräg'; }}>Schräg</button>
          <button type="button" class="wood-btn" onClick={reset}>Zurücksetzen</button>
        </div>
        <label class="gen-check">
          <input type="checkbox" checked onChange={(e: Event) => hooks.billboards((e.target as HTMLInputElement).checked)} />
          <span>Bäume als Bild (Billboards)</span>
        </label>
        <p class="gen-hint">Ziehen verschiebt, das Mausrad zoomt; nah heran stehen Bäume, Felsen und Beeren. Die Adresse merkt sich Seed und geänderte Werte.</p>
        {groups.map((group) => (
          <section>
            <div class="gen-group">{group}</div>
            {SLIDERS.filter((sl) => sl.group === group).map((sl) => (
              <label class="gen-slider">
                <span class="gen-label">{sl.label}</span>
                <span class="gen-value" ref={values.get(sl.key)!} />
                <input ref={inputs.get(sl.key)!} type="range" min={sl.min} max={sl.max} step={sl.step}
                  onInput={(e: Event) => {
                    params[sl.key] = (e.target as HTMLInputElement).valueAsNumber;
                    show(sl.key);
                    changed();
                  }}
                  onDblClick={() => {
                    params[sl.key] = TERRAIN_PARAMS[sl.key];
                    show(sl.key);
                    changed();
                  }} />
              </label>
            ))}
          </section>
        ))}
      </aside>
    </>,
    root,
  );
  SLIDERS.forEach((sl) => show(sl.key));
  return { canvas: canvas.current, fps: fps.current };
}
