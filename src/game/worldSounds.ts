// worldSounds.ts
// Was in der Welt passiert, als Geräusch: nur, was man sieht - leiser zum
// Bildrand hin und nach links oder rechts verteilt, je nachdem, wo es
// passiert. Weit herausgezoomt ist alles leiser, sonst klingt ein ganzes Dorf
// wie eines. Die Welt kennt keinen Ton; sie meldet Ereignisse (WorldEvent).

import type { Sound, SoundName } from '../audio';
import { worldToScreen } from '../gl/iso';
import type { DepositType } from '../world/catalog';
import type { WorldEvent } from '../world/world';
import type { Camera } from './Camera';

const GATHER_SOUND: Record<DepositType, SoundName> = {
  wood: 'chop',
  stone: 'pick',
  gold: 'pick',
  berries: 'rustle',
};

/**
 * Der Empfänger für World.onEvent.
 * @param heightAt Geländehöhe (Tiles) - damit das Ereignis dort liegt, wo man es sieht
 */
export function worldSounds(sound: Sound, camera: Camera, heightAt: (x: number, y: number) => number) {
  return (event: WorldEvent) => {
    const s = worldToScreen(camera.view(), event.x, event.y, heightAt(event.x, event.y));
    const nx = (s.x - camera.centerX) / camera.centerX;
    const ny = (s.y - camera.centerY) / camera.centerY;
    const offscreen = Math.abs(nx) > 1.15 || Math.abs(ny) > 1.15;
    const distance = Math.min(1, Math.hypot(nx, ny) / 1.4);
    const zoom = Math.min(1, camera.tileSize / 8);
    const volume = (1 - distance * 0.7) * (0.35 + 0.65 * zoom);
    const pan = nx * 0.8;

    switch (event.kind) {
      case 'strike':
        if (!offscreen) sound.play(GATHER_SOUND[event.resource], volume * 0.55, pan);
        break;
      case 'treeFall':
        if (!offscreen) sound.play('treeFall', volume, pan);
        break;
      case 'deliver':
        if (!offscreen) sound.play('deliver', volume * 0.6, pan);
        break;
      case 'collapse':
        if (!offscreen) sound.play('collapse', volume, pan);
        break;
      case 'trained':
        // Wichtige Rückmeldung - auch wenn das Dorfzentrum nicht im Bild ist.
        sound.play('trained', 0.7);
        break;
    }
  };
}
