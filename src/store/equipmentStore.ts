import type { Equipment } from "../types.js";
import { getDb } from "./db.js";

interface EquipmentDoc {
  _id: string;
  name: string;
  capacity: number;
}

export async function listEquipment(): Promise<Equipment[]> {
  const db = await getDb();
  const docs = await db.collection<EquipmentDoc>("equipment").find({}).toArray();
  return docs.map((d) => ({ id: d._id, name: d.name, capacity: d.capacity }));
}

export async function upsertEquipment(equipment: Equipment): Promise<void> {
  const db = await getDb();
  await db
    .collection<EquipmentDoc>("equipment")
    .updateOne(
      { _id: equipment.id },
      { $set: { name: equipment.name, capacity: equipment.capacity } },
      { upsert: true },
    );
}
