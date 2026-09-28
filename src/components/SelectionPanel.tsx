// SelectionPanel.tsx
// Was ausgewählt ist, in der Befehlsleiste unten - wie in AoE2: rechts das
// Pergament mit Porträt, Lebensbalken und Angaben, links in der Steintafel
// die Befehle als Bildknöpfe (Ausbilden, Frucht, Abreißen). main.ts fragt die
// Welt ab und beschreibt das Ergebnis als SelectionView (reine Daten); diese
// Komponente zeichnet es. Die Knöpfe tragen data-action (train, demolish,
// crop) - ausgewertet per Delegation in main.ts.

import { render } from 'defuss';
import './SelectionPanel.css';
import './buttons.css';
import { formatDuration } from '../format';
import {
  CROP_ORDER, CROPS, player, type AnimalKind, type BuildingType, type CropType, type DepositType,
} from '../world/catalog';
import { animalIcon, buildingIcon, resourceIcon, stockIcon, villagerIcon } from './modelIcons';
import { cropIcon } from './cropIcons';

/** Werkstatt fürs Panel: wer dort arbeitet (fehlt, wenn niemand), was er tut, Fortschritt des Bogens. */
export interface WorkshopView {
  /** "Bogner", "Fischer". */
  role: string;
  worker?: string;
  doing?: string;
  /** Entlassen, geht gerade. */
  leaving?: boolean;
  percent?: number;
}

/** Stand eines zusammenhängenden Felds. */
export interface FarmView {
  phase: string;
  /** Tiles des Felds - bei mehr als einem angezeigt. */
  tiles: number;
  crops: string;
  food: number;
  rows: number;
  ploughed: number;
  sown: number;
  ripe: number;
  /** Sekunden, bis die nächste Furche reif ist - wenn etwas wächst. */
  nextRipeIn?: number;
  farmers: string[];
}

/** Ausbildung von Dorfbewohnern: Knopf und seine Kosten. */
export interface TrainView {
  label: string;
  cost: string;
  affordable: boolean;
}

export type SelectionView =
  | {
      kind: 'buildings';
      /** Art fürs Porträt - die häufigste. */
      type: BuildingType;
      title: string;
      /** "2× Haus, 1× Mühle" - bei verschiedenen Arten. */
      kinds?: string;
      hp: number;
      maxHp: number;
      training?: { queued: number; capacity: number; train: TrainView };
      farms?: { farmers: number; rows: number; plan: CropType | null };
    }
  | {
      kind: 'building';
      type: BuildingType;
      label: string;
      hp: number;
      maxHp: number;
      storedResources?: string;
      housing?: number;
      farm?: FarmView & { plan: CropType };
      workshop?: WorkshopView;
      /** Waffenkammer: so viele Waffen liegen darin, so viele passen hinein. */
      weapons?: { bows: number; capacity: number };
      /** Fischerhütte: Knopf "Reuse bauen" - Kosten und ob man sie hat. */
      trapCost?: { cost: string; affordable: boolean };
      /** Reuse: Fische darin, wie viele hineinpassen, Sekunden, bis sie voll ist (0: voll). */
      trap?: { fish: number; max: number; fullIn: number };
      trainer?: {
        queue: number;
        max: number;
        full: boolean;
        /** Fortschritt des vordersten in Prozent - nur, wenn einer in Ausbildung ist. */
        percent: number;
        rally: boolean;
        train: TrainView;
      };
    }
  | {
      kind: 'resource';
      type: DepositType;
      title: string;
      subtitle?: string;
      left: number;
      total: number;
      percent: number;
      regrow?: { empty: boolean; seconds: number };
      gatherers: number;
      max: number;
    }
  | {
      kind: 'animal';
      type: AnimalKind;
      label: string;
      /** Was es für die Natur leistet. */
      info: string;
      dead: boolean;
      /** Was es gerade tut: äst, zieht umher, flieht, erlegt. */
      doing: string;
      hp: number;
      maxHp: number;
      /** Erlegt: Nahrung am Kadaver. */
      food: number;
      maxFood: number;
    }
  | { kind: 'flower'; name: string; latin: string; info: string; wiki: string; photo: string; flower: number }
  | { kind: 'empty' }
  | {
      kind: 'villagers';
      /** Fürs Porträt: Frau oder Mann (der erste). */
      female: boolean;
      /** Genau einer: Name, Frau oder Mann, was er gerade tut. */
      single?: { name: string; role: string; doing: string; worker: boolean };
      count: number;
      label: string;
      names: string;
      hp: number;
      maxHp: number;
      /** Gleiche Tätigkeiten zusammengefasst: [Text, Anzahl]. */
      activities: [string, number][];
    }
  /** Nichts ausgewählt: die Schriftrolle ist zugerollt. */
  | { kind: 'none' };

const rgb = () => player.color.toRGB();

// --- Pergament --------------------------------------------------------------

function Bar({ percent }: { percent: number }) {
  return <div class="bar"><i style={`width:${Math.max(0, Math.min(100, percent))}%`} /></div>;
}

/** Porträt links auf dem Pergament, darunter Lebensbalken und Zahl. */
function Portrait({ src, hp, maxHp, photo }: { src: string; hp?: number; maxHp?: number; photo?: boolean }) {
  return (
    <div class="sel-portrait">
      <div class="sel-frame" title="Hinspringen"><img class={photo ? 'photo' : undefined} src={src} alt="" draggable={false} /></div>
      {hp !== undefined && maxHp ? (
        <>
          <div class="hp"><i style={`width:${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%`} /></div>
          <div class="hp-text">{Math.ceil(hp)}/{maxHp}</div>
        </>
      ) : null}
    </div>
  );
}

/** Stand eines Felds: Phase, Furchen je Arbeitsschritt, Ernte, Bauern. */
function FarmDetails({ farm }: { farm: FarmView }) {
  return (
    <>
      <div>
        <b>{farm.phase}</b>
        {farm.tiles > 1 ? <span class="muted"> ({farm.tiles} Tiles)</span> : null}
      </div>
      <div>{farm.crops} · <b>{Math.ceil(farm.food)}</b> Nahrung auf dem Feld</div>
      <div class="muted">
        Furchen: {farm.ploughed}/{farm.rows} gepflügt · {farm.sown}/{farm.rows} gesät · {farm.ripe}/{farm.rows} reif
      </div>
      {farm.nextRipeIn !== undefined
        ? <div class="muted">Nächste Furche reif in {formatDuration(farm.nextRipeIn)}</div>
        : null}
      <div>
        Bauern <b>{farm.farmers.length}/{farm.rows}</b>
        {farm.farmers.length > 0 ? <span class="muted"> {farm.farmers.join(', ')}</span> : null}
      </div>
      {farm.farmers.length === 0
        ? <div class="muted">Wähle Dorfbewohner und klicke mit rechts auf das Feld - je Furche arbeitet einer.</div>
        : null}
    </>
  );
}

function Buildings({ v }: { v: Extract<SelectionView, { kind: 'buildings' }> }) {
  return (
    <>
      <div class="sel-title">{v.title}</div>
      <div class="sel-body">
        <Portrait src={buildingIcon(v.type, rgb())} hp={v.hp} maxHp={v.maxHp} />
        <div class="sel-info">
          {v.kinds ? <div class="muted">{v.kinds}</div> : null}
          {v.training ? (
            <>
              <div>In Ausbildung <b>{v.training.queued}/{v.training.capacity}</b></div>
              <div class="muted">
                Neue Dorfbewohner kommen in die kürzeste Warteschlange; Rechtsklick setzt den Sammelpunkt für alle.
              </div>
            </>
          ) : null}
          {v.farms ? <div>Bauern <b>{v.farms.farmers}/{v.farms.rows}</b></div> : null}
        </div>
      </div>
    </>
  );
}

/** Werkstatt: der Arbeiter und sein Bogen - oder wie man einen hinschickt. */
function WorkshopDetails({ workshop, label }: { workshop: WorkshopView; label: string }) {
  if (!workshop.worker) {
    return <div class="muted">Niemand arbeitet hier - Rechtsklick mit einem Dorfbewohner auf die {label}.</div>;
  }
  return (
    <>
      <div>{workshop.role}: <b>{workshop.worker}</b> - {workshop.doing}</div>
      {workshop.percent !== undefined ? <Bar percent={workshop.percent} /> : null}
    </>
  );
}

function Building({ v }: { v: Extract<SelectionView, { kind: 'building' }> }) {
  const t = v.trainer;
  return (
    <>
      <div class="sel-title">{v.label}</div>
      <div class="sel-body">
        <Portrait src={buildingIcon(v.type, rgb())} hp={v.hp} maxHp={v.maxHp} />
        <div class="sel-info">
          {v.storedResources ? <div class="muted">Lager für {v.storedResources}</div> : null}
          {v.housing ? <div class="muted">+{v.housing} Bevölkerung</div> : null}
          {v.farm ? <FarmDetails farm={v.farm} /> : null}
          {v.workshop ? <WorkshopDetails workshop={v.workshop} label={v.label} /> : null}
          {v.trap ? (
            <>
              <div>Fische: <b>{v.trap.fish}/{v.trap.max}</b></div>
              <div class="muted">{v.trap.fullIn > 0 ? `Voll in ${formatDuration(v.trap.fullIn)}` : 'Voll - wartet auf den Fischer'}</div>
            </>
          ) : null}
          {v.weapons ? (
            <div class="sel-stock">
              <span class="sel-stock-icon"><img src={stockIcon('bows')} alt="" width="34" height="34" draggable={false} /></span>
              Bögen: <b>{v.weapons.bows} / {v.weapons.capacity}</b>
              {v.weapons.bows >= v.weapons.capacity
                ? <> - <span class="muted">voll</span></>
                : <span class="muted"> - noch {v.weapons.capacity - v.weapons.bows} frei</span>}
            </div>
          ) : null}
          {t && t.queue > 0 ? (
            <>
              <div>
                In Ausbildung <b>{t.queue}/{t.max}</b>
                {t.full ? <> - <span class="muted">Bevölkerung voll, baue ein Haus</span></> : null}
              </div>
              <Bar percent={t.percent} />
            </>
          ) : null}
          {t ? (
            <div class="muted">
              {t.rally
                ? 'Sammelpunkt gesetzt - Rechtsklick versetzt ihn, auf das Gebäude hebt ihn auf.'
                : 'Rechtsklick auf die Karte setzt einen Sammelpunkt für neue Dorfbewohner.'}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Resource({ v }: { v: Extract<SelectionView, { kind: 'resource' }> }) {
  return (
    <>
      <div class="sel-title">
        {v.title}
        {v.subtitle ? <span class="muted"> {v.subtitle}</span> : null}
      </div>
      <div class="sel-body">
        <Portrait src={resourceIcon(v.type)} />
        <div class="sel-info">
          <div>Übrig <b>{v.left}/{v.total}</b></div>
          <Bar percent={v.percent} />
          {/* Beerensträucher wachsen nach - wie lange noch, bis er wieder voll ist. */}
          {v.regrow ? (
            <div class="muted">
              {v.regrow.empty ? 'Leer gepflückt - wächst nach' : 'Wächst nach'} · voll in {formatDuration(v.regrow.seconds)}
            </div>
          ) : null}
          <div>
            Sammler <b>{v.gatherers}/{v.max}</b>
            {v.gatherers >= v.max ? <span class="muted"> - voll besetzt</span> : null}
          </div>
          {v.gatherers === 0 && v.left > 0
            ? <div class="muted">Wähle Dorfbewohner und klicke mit rechts darauf, um es zu sammeln.</div>
            : null}
        </div>
      </div>
    </>
  );
}

/** Ein Stück Fleisch: Keule mit Knochen - vor der Nahrung eines Tiers. */
function MeatIcon() {
  return (
    <svg viewBox="0 0 44 44" width="34" height="34" aria-hidden="true">
      <path d="M27 17 L36 8" stroke="#efe6d2" stroke-width="4.5" stroke-linecap="round" />
      <circle cx="35" cy="6.5" r="3.2" fill="#f6efdf" stroke="#1a0f07" stroke-width="1.2" />
      <circle cx="38.5" cy="10" r="3.2" fill="#f6efdf" stroke="#1a0f07" stroke-width="1.2" />
      <path d="M28 16 C34 22 30 36 18 38 C8 40 3 32 7 24 C11 15 22 10 28 16 Z" fill="#b8432e" stroke="#1a0f07" stroke-width="1.6" />
      <path d="M11 26 C13 20 19 16 24 17" stroke="#e8a58e" stroke-width="2.4" fill="none" stroke-linecap="round" />
      <path d="M26 20 C28 26 25 32 18 34" stroke="#7a2416" stroke-width="1.6" fill="none" stroke-linecap="round" />
    </svg>
  );
}

function Animal({ v }: { v: Extract<SelectionView, { kind: 'animal' }> }) {
  return (
    <>
      <div class="sel-title">{v.label} <span class="muted">{v.doing}</span></div>
      <div class="sel-body">
        <Portrait src={animalIcon(v.type, v.dead)} hp={v.hp} maxHp={v.maxHp} />
        <div class="sel-info">
          <div class="sel-stock">
            <span class="sel-stock-icon"><MeatIcon /></span>
            {/* Erlegt: der Balken neben dem Fleisch unter der Zahl - eine eigene Zeile passte nicht mehr aufs Pergament. */}
            <div class="sel-grow">
              Nahrung <b>{Math.ceil(v.food)}/{v.maxFood}</b>
              {v.dead ? <Bar percent={(v.food / v.maxFood) * 100} /> : null}
            </div>
          </div>
          <div>{v.info}</div>
          <div class="muted">
            Wähle Dorfbewohner und klicke mit rechts darauf, um es {v.dead ? 'zu zerlegen' : 'zu jagen'}.
          </div>
        </div>
      </div>
    </>
  );
}

function Flower({ v }: { v: Extract<SelectionView, { kind: 'flower' }> }) {
  return (
    <>
      <div class="sel-title">{v.name} <span class="muted">{v.latin}</span></div>
      <div class="sel-body">
        <Portrait src={v.photo} photo />
        <div class="sel-info">
          <div>{v.info}</div>
          <div><a href={v.wiki} target="_blank" rel="noopener">Mehr auf Wikipedia</a></div>
          <div class="muted">Wildblume - schön anzusehen, sammeln kann man sie nicht.</div>
        </div>
      </div>
    </>
  );
}

function Villagers({ v }: { v: Extract<SelectionView, { kind: 'villagers' }> }) {
  return (
    <>
      {v.single
        ? <div class="sel-title">{v.single.name} <span class="muted">{v.single.role}</span></div>
        : <div class="sel-title">{v.count} {v.label}</div>}
      <div class="sel-body">
        <Portrait src={villagerIcon(v.female, rgb())} hp={v.hp} maxHp={v.maxHp} />
        <div class="sel-info">
          {v.single ? null : <div class="muted">{v.names}</div>}
          {v.single
            ? <div>{v.single.doing}</div>
            : <>{v.activities.map(([text, n]) => <div>{n}× {text}</div>)}</>}
          {v.single?.worker ? <div class="muted">Nimmt keine Befehle an, solange zugeteilt - in der Werkstatt entlassen.</div> : <div class="muted">
            Rechtsklick auf Holz, Stein, Gold oder Beeren: sammeln · auf ein Tier: jagen · auf ein Feld: bestellen ·
            auf ein Lager: abliefern · auf die Bognerei: Bögen machen · auf die Fischerhütte: fischen · sonst: hingehen
          </div>}
        </div>
      </div>
    </>
  );
}

export function SelectionPanel({ view }: { view: SelectionView }) {
  switch (view.kind) {
    case 'buildings': return <Buildings v={view} />;
    case 'building': return <Building v={view} />;
    case 'resource': return <Resource v={view} />;
    case 'animal': return <Animal v={view} />;
    case 'flower': return <Flower v={view} />;
    case 'empty':
      return <><div class="sel-title">Leer</div><div class="muted">Hier ist nichts mehr zu holen.</div></>;
    case 'villagers': return <Villagers v={view} />;
    case 'none': return <></>;
  }
}

// --- Befehle in der Steintafel ---------------------------------------------

/** Ein Befehlsknopf: Bild, Taste, Tooltip und was er in main.ts auslöst. */
interface Command {
  action: 'train' | 'crop' | 'demolish' | 'trap' | 'dismiss';
  title: string;
  /** Bild-URL - oder das Abriss-Symbol. */
  icon: string | 'demolish';
  key?: string;
  crop?: CropType;
  disabled?: boolean;
  pressed?: boolean;
}

function trainCommand(train: TrainView): Command {
  return {
    action: 'train', title: `${train.label} ausbilden (V) - ${train.cost}\nMit Umschalt: 5 auf einmal`,
    icon: villagerIcon(false, rgb()), key: 'V', disabled: !train.affordable,
  };
}

function cropCommands(current: CropType | null): Command[] {
  return CROP_ORDER.map((c) => ({
    action: 'crop', crop: c, pressed: c === current, icon: cropIcon(c),
    title: `${CROPS[c].label} säen - ${CROPS[c].food} Nahrung, reif in ${formatDuration(CROPS[c].growTime)}`,
  }));
}

/** Die Befehle zur Auswahl - leer, wenn die Steintafel das Baumenü zeigt. */
export function commandsFor(view: SelectionView): Command[] {
  const demolish = (all: boolean): Command => ({
    action: 'demolish', icon: 'demolish', key: 'Entf',
    title: `${all ? 'Alle abreißen' : 'Abreißen'} (Entf) - 50 % der Kosten zurück`,
  });
  switch (view.kind) {
    case 'building':
      return [
        ...(view.farm ? cropCommands(view.farm.plan) : []),
        ...(view.trainer ? [trainCommand(view.trainer.train)] : []),
        ...(view.trapCost ? [{
          action: 'trap', icon: buildingIcon('fish_trap', rgb()), disabled: !view.trapCost.affordable,
          title: `Reuse bauen - ${view.trapCost.cost}\nIns Wasser nahe der Hütte; der Fischer leert sie mit dem Boot`,
        } satisfies Command] : []),
        ...(view.workshop?.worker && !view.workshop.leaving ? [{
          action: 'dismiss', icon: villagerIcon(false, rgb()),
          title: `${view.workshop.worker} entlassen\nGeht noch einmal hinein und wartet dann vor der Tür`,
        } satisfies Command] : []),
        demolish(false),
      ];
    case 'buildings':
      return [
        ...(view.training ? [trainCommand(view.training.train)] : []),
        ...(view.farms ? cropCommands(view.farms.plan) : []),
        demolish(true),
      ];
    default:
      return [];
  }
}

/** Abriss: Haus mit rotem Kreuz. */
function DemolishIcon() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <path d="M8 22 L22 10 L36 22 V36 H8 Z" fill="#c9a36a" stroke="#1a0f07" stroke-width="2" stroke-linejoin="round" />
      <path d="M18 36 V27 H26 V36" fill="#5a3a1c" stroke="#1a0f07" stroke-width="2" />
      <path d="M10 10 L34 34 M34 10 L10 34" stroke="#d8322a" stroke-width="5" stroke-linecap="round" />
    </svg>
  );
}

function CommandButton({ c }: { c: Command }) {
  return (
    <button type="button" class="cmd-btn" data-action={c.action} data-crop={c.crop} title={c.title}
      disabled={c.disabled} aria-pressed={c.pressed === undefined ? undefined : String(c.pressed)}>
      {c.icon === 'demolish' ? <DemolishIcon /> : <img src={c.icon} alt="" draggable={false} />}
      {c.key ? <span class="cmd-key">{c.key}</span> : null}
    </button>
  );
}

/** Zeigt das Pergament etwas? Sonst bleibt die Schriftrolle zugerollt. */
export function hasDetails(view: SelectionView): boolean {
  return view.kind !== 'none';
}

/** Was zuletzt in der Steintafel stand - neu gezeichnet wird nur bei einer Änderung. */
let lastCommands = '';

/**
 * Zeichnet die Auswahl: Angaben aufs Pergament (`details`), Befehle in die
 * Steintafel (`commands`). Gibt zurück, ob es Befehle gibt - sonst zeigt die
 * Steintafel das Baumenü.
 */
export function renderSelection(details: HTMLElement, commands: HTMLElement, view: SelectionView): boolean {
  render(<SelectionPanel view={view} />, details);
  const list = commandsFor(view);
  const key = JSON.stringify(list.map((c) => [c.action, c.crop, c.disabled, c.pressed, c.icon.length]));
  // Neu aufbauen statt abgleichen: sonst blieben disabled und aria-pressed an
  // Knöpfen hängen, die an dieser Stelle vorher etwas anderes waren.
  if (key !== lastCommands) {
    lastCommands = key;
    commands.replaceChildren();
    render(<>{list.map((c) => <CommandButton c={c} />)}</>, commands);
  }
  return list.length > 0;
}
