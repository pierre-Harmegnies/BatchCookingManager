import { MongoClient, type Db } from "mongodb";

const MONGODB_URL = process.env.MONGODB_URL ?? "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB ?? "batch_cooking";

let client: MongoClient | undefined;
let db: Db | undefined;

/**
 * Connexion à la base `batch_cooking`, sur la même instance MongoDB que
 * MaCuisine (`gestion_cuisine`) mais dans une base logique séparée — décision
 * du cadrage pour ne pas coupler les schémas des deux projets.
 */
export async function getDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(MONGODB_URL);
  await client.connect();
  db = client.db(MONGODB_DB);
  await db.collection("step_metadata").createIndex({ recipeSlug: 1 });
  return db;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = undefined;
  db = undefined;
}
