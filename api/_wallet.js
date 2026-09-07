import { pool } from "./_lib.js";

let ensurePromise = null;

/**
 * Source de vérité durable du profil portefeuille marchand.
 * La table est créée à la demande pour rester compatible avec les bases
 * Neon déjà existantes qui n'ont pas encore exécuté la migration.
 */
export async function ensureWalletProfileTable() {
  if (!pool) throw new Error("Base de données non configurée.");
  if (!ensurePromise) {
    ensurePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_wallet_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        moncash_name TEXT NOT NULL DEFAULT '',
        moncash_phone TEXT NOT NULL DEFAULT '',
        natcash_name TEXT NOT NULL DEFAULT '',
        natcash_phone TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `).then(async () => {
      // Backfill best-effort pour les installations historiques qui possèdent
      // déjà les colonnes users.*. Une ancienne base sans ces colonnes reste
      // parfaitement compatible avec la nouvelle table.
      try {
        await pool.query(`
          INSERT INTO merchant_wallet_profiles (user_id, moncash_name, moncash_phone, natcash_name, natcash_phone)
          SELECT id,
                 COALESCE(moncash_name, ''), COALESCE(moncash_phone, ''),
                 COALESCE(natcash_name, ''), COALESCE(natcash_phone, '')
          FROM users
          WHERE COALESCE(moncash_name, '') <> ''
             OR COALESCE(moncash_phone, '') <> ''
             OR COALESCE(natcash_name, '') <> ''
             OR COALESCE(natcash_phone, '') <> ''
          ON CONFLICT (user_id) DO NOTHING
        `);
      } catch (error) {
        console.warn("[zakapro:wallet:legacy-backfill]", error?.message || error);
      }
    }).catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

export async function getWalletProfile(userId, client = pool) {
  await ensureWalletProfileTable();
  const { rows } = await client.query(
    `SELECT moncash_name, moncash_phone, natcash_name, natcash_phone
     FROM merchant_wallet_profiles WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  return {
    moncashName: row?.moncash_name || "",
    moncashPhone: row?.moncash_phone || "",
    natcashName: row?.natcash_name || "",
    natcashPhone: row?.natcash_phone || "",
  };
}

export async function saveWalletProfile(userId, fields, client = pool) {
  await ensureWalletProfileTable();
  await client.query(
    `INSERT INTO merchant_wallet_profiles
       (user_id, moncash_name, moncash_phone, natcash_name, natcash_phone, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id) DO UPDATE SET
       moncash_name = EXCLUDED.moncash_name,
       moncash_phone = EXCLUDED.moncash_phone,
       natcash_name = EXCLUDED.natcash_name,
       natcash_phone = EXCLUDED.natcash_phone,
       updated_at = now()`,
    [userId, fields.moncashName, fields.moncashPhone, fields.natcashName, fields.natcashPhone]
  );

  // Compatibilité best-effort avec les anciennes versions qui lisaient users.*.
  try {
    await client.query(
      `UPDATE users
       SET moncash_name=$2, moncash_phone=$3, natcash_name=$4, natcash_phone=$5
       WHERE id=$1`,
      [userId, fields.moncashName, fields.moncashPhone, fields.natcashName, fields.natcashPhone]
    );
  } catch (error) {
    console.warn("[zakapro:wallet:legacy-sync]", error?.message || error);
  }

  return fields;
}
