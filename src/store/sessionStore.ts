import { ObjectId } from "mongodb";
import type { Schedule } from "../types.js";
import { getDb } from "./db.js";

interface SessionDoc {
  _id: ObjectId;
  name: string;
  createdAt: Date;
  recipeSlugs: string[];
  recipeTitles: string[];
  schedule: Schedule;
}

export interface SessionSummary {
  id: string;
  name: string;
  createdAt: string;
  recipeTitles: string[];
  makespanMinutes: number;
}

export interface SessionDetail extends SessionSummary {
  recipeSlugs: string[];
  schedule: Schedule;
}

function toSummary(doc: SessionDoc): SessionSummary {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    createdAt: doc.createdAt.toISOString(),
    recipeTitles: doc.recipeTitles,
    makespanMinutes: doc.schedule.makespanMinutes,
  };
}

function toDetail(doc: SessionDoc): SessionDetail {
  return { ...toSummary(doc), recipeSlugs: doc.recipeSlugs, schedule: doc.schedule };
}

/**
 * Sauvegarde d'une session de batch cooking : snapshot des recettes choisies
 * et du planning généré à un instant donné, pour constituer un historique et
 * éviter de tout recalculer (le planning reste stable même si les métadonnées
 * d'ordonnancement des recettes changent ensuite).
 */
export async function createSession(input: {
  name: string;
  recipeSlugs: string[];
  recipeTitles: string[];
  schedule: Schedule;
}): Promise<SessionDetail> {
  const db = await getDb();
  const doc: SessionDoc = {
    _id: new ObjectId(),
    name: input.name,
    createdAt: new Date(),
    recipeSlugs: input.recipeSlugs,
    recipeTitles: input.recipeTitles,
    schedule: input.schedule,
  };
  await db.collection<SessionDoc>("sessions").insertOne(doc);
  return toDetail(doc);
}

export async function listSessions(): Promise<SessionSummary[]> {
  const db = await getDb();
  const docs = await db.collection<SessionDoc>("sessions").find({}).sort({ createdAt: -1 }).toArray();
  return docs.map(toSummary);
}

export async function getSession(id: string): Promise<SessionDetail | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  const doc = await db.collection<SessionDoc>("sessions").findOne({ _id: new ObjectId(id) });
  return doc ? toDetail(doc) : null;
}

/**
 * Met à jour le planning d'une session déjà sauvegardée (ajout/modif/
 * suppression d'étapes) — édition purement locale à cette session : elle ne
 * touche ni les métadonnées d'ordonnancement des recettes (`step_metadata`)
 * ni MaCuisine, donc aucune influence sur les prochaines sessions générées.
 */
export async function updateSessionSchedule(id: string, schedule: Schedule): Promise<SessionDetail | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  const result = await db
    .collection<SessionDoc>("sessions")
    .findOneAndUpdate({ _id: new ObjectId(id) }, { $set: { schedule } }, { returnDocument: "after" });
  return result ? toDetail(result) : null;
}

export async function deleteSession(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const db = await getDb();
  const result = await db.collection<SessionDoc>("sessions").deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
