// StorageBuilding.ts
// Ein Lager (abstrakt - Holzlager, Minenlager, Mühle, Waffenkammer): Dorfbewohner liefern
// hier die Rohstoffe ab, die in `definition.storedResources` stehen. Das
// Dorfzentrum nimmt zwar auch alles an, ist aber vor allem UnitProducer.

import { BuildingBase } from './BuildingBase';

export abstract class StorageBuilding extends BuildingBase {
  override isStorage(): this is StorageBuilding {
    return true;
  }
}
