// ArcheryRange.ts
// Schießplatz (B24): bis zu ARCHERY.trainees Dorfbewohner üben hier zugleich
// mit dem Bogen - Rechtsklick mit Dorfbewohnern auf den Platz. Jeder holt sich
// einen Bogen aus der Waffenkammer und behält ihn; mit der Übung steigt seine
// Fähigkeit "Bogen". Was sie Schritt für Schritt tun: world/archery.ts.
//
// Anders als die Werkstätten ist er keine Arbeitsstelle (isWorkshop): wer hier
// übt, nimmt jeden neuen Befehl an. Der Platz ist offen - man geht darüber
// wie über ein Feld (VillagerWork.blockedAt), sonst kämen die Schützen nicht an
// ihre Plätze zwischen Schießlinie und Scheiben.

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { BuildingBase } from './BuildingBase';
import { defineBuilding } from './definition';

export class ArcheryRange extends BuildingBase {
  static readonly definition = defineBuilding({
    type: 'archery_range',
    label: 'Schießplatz',
    // Die Ziffern sind vergeben - B wie Bogen.
    key: 'b',
    color: Color.rgb(176, 150, 92),
    model: SHAPE.archeryRange,
    // Sechs Bahnen nebeneinander: 13 m breit, drei Tiles Grund.
    size: 2.6,
    footprint: 3,
    // Strohscheiben, Zaun und Bank - nur Holz, etwas mehr als eine Werkstatt.
    cost: { wood: 100 },
    hp: 600,
  });

  override passable(): boolean {
    return true;
  }
}
