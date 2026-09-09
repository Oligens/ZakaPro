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


export const DEFAULT_REVENUE_RULES = Object.freeze({
  standard: 30,
  intermediate: 70,
  vip: 100,
});

export async function ensureMonetizationTables(client = pool) {
  await client.query(`ALTER TABLE checkout_payment_intents ALTER COLUMN plan_id DROP NOT NULL`).catch(()=>{});
  await client.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'subscription'`).catch(()=>{});
  await client.query(`ALTER TABLE checkout_payment_intents ADD COLUMN IF NOT EXISTS monetization_type TEXT NOT NULL DEFAULT 'subscription', ADD COLUMN IF NOT EXISTS recipient_user_id TEXT, ADD COLUMN IF NOT EXISTS sender_user_id TEXT, ADD COLUMN IF NOT EXISTS token_amount NUMERIC(18,4), ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(12,6)`).catch(()=>{});
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_monetization_settings (
      app_id TEXT PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
      token_to_htg_rate NUMERIC(12,6) NOT NULL DEFAULT 1,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS revenue_share_rules (
      app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      tier_level TEXT NOT NULL,
      creator_pct NUMERIC(5,2) NOT NULL CHECK (creator_pct BETWEEN 0 AND 100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (app_id,tier_level)
    );
    CREATE TABLE IF NOT EXISTS user_wallets (
      app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      balance_real NUMERIC(18,2) NOT NULL DEFAULT 0,
      balance_tokens NUMERIC(18,4) NOT NULL DEFAULT 0,
      tier_level TEXT NOT NULL DEFAULT 'standard',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (app_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('HTG','USD','TOKEN')),
      delta NUMERIC(18,4) NOT NULL,
      reason TEXT NOT NULL,
      reference TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(app_id,reference,user_id,currency)
    );
    CREATE TABLE IF NOT EXISTS monetization_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      sender_user_id TEXT,
      recipient_user_id TEXT,
      gross_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      token_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      creator_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      creator_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      platform_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'HTG',
      reference TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'HTG',
      method TEXT NOT NULL CHECK (method IN ('moncash','natcash','bank')),
      destination TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )
  `);
}

export async function getMonetizationConfig(appId, client = pool) {
  await ensureMonetizationTables(client);
  await client.query(`INSERT INTO app_monetization_settings(app_id) VALUES($1) ON CONFLICT(app_id) DO NOTHING`, [appId]);
  for (const [tier,pct] of Object.entries(DEFAULT_REVENUE_RULES)) {
    await client.query(`INSERT INTO revenue_share_rules(app_id,tier_level,creator_pct) VALUES($1,$2,$3) ON CONFLICT(app_id,tier_level) DO NOTHING`, [appId,tier,pct]);
  }
  const [s,r] = await Promise.all([
    client.query(`SELECT token_to_htg_rate,enabled FROM app_monetization_settings WHERE app_id=$1`,[appId]),
    client.query(`SELECT tier_level,creator_pct FROM revenue_share_rules WHERE app_id=$1 ORDER BY tier_level`,[appId])
  ]);
  return {
    enabled:s.rows[0]?.enabled !== false,
    tokenToHtgRate:Number(s.rows[0]?.token_to_htg_rate || 1),
    rules:Object.fromEntries(r.rows.map(x=>[x.tier_level,Number(x.creator_pct)]))
  };
}

export async function getUserWallet(appId,userId,client=pool) {
  await ensureMonetizationTables(client);
  await client.query(`INSERT INTO user_wallets(app_id,user_id) VALUES($1,$2) ON CONFLICT(app_id,user_id) DO NOTHING`,[appId,String(userId)]);
  const {rows}=await client.query(`SELECT app_id,user_id,balance_real,balance_tokens,tier_level,updated_at FROM user_wallets WHERE app_id=$1 AND user_id=$2`,[appId,String(userId)]);
  const w=rows[0];
  return {appId:w.app_id,userId:w.user_id,balanceReal:Number(w.balance_real),balanceTokens:Number(w.balance_tokens),tierLevel:w.tier_level,updatedAt:w.updated_at};
}

export async function creditWallet(client,{appId,userId,amount,currency='HTG',reason,reference,metadata={}}) {
  const value=Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Montant de portefeuille invalide.");
  await client.query(`INSERT INTO user_wallets(app_id,user_id) VALUES($1,$2) ON CONFLICT(app_id,user_id) DO NOTHING`,[appId,String(userId)]);
  const existing=await client.query(`SELECT id FROM wallet_ledger WHERE app_id=$1 AND reference=$2 AND user_id=$3 AND currency=$4 LIMIT 1`,[appId,reference,String(userId),currency]);
  if(existing.rowCount) return {duplicate:true};
  const col=currency==='TOKEN'?'balance_tokens':'balance_real';
  await client.query(`UPDATE user_wallets SET \${col}=\${col}+$3,updated_at=now() WHERE app_id=$1 AND user_id=$2`,[appId,String(userId),value]);
  await client.query(`INSERT INTO wallet_ledger(app_id,user_id,currency,delta,reason,reference,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)`,[appId,String(userId),currency,value,reason,reference,metadata]);
  return {duplicate:false};
}

export async function debitWallet(client,{appId,userId,amount,currency='HTG',reason,reference,metadata={}}) {
  const value=Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Montant de portefeuille invalide.");
  await client.query(`INSERT INTO user_wallets(app_id,user_id) VALUES($1,$2) ON CONFLICT(app_id,user_id) DO NOTHING`,[appId,String(userId)]);
  const col=currency==='TOKEN'?'balance_tokens':'balance_real';
  const result=await client.query(`UPDATE user_wallets SET \${col}=\${col}-$3,updated_at=now() WHERE app_id=$1 AND user_id=$2 AND \${col}>=$3 RETURNING \${col}`,[appId,String(userId),value]);
  if(!result.rowCount) throw new Error("Solde insuffisant.");
  await client.query(`INSERT INTO wallet_ledger(app_id,user_id,currency,delta,reason,reference,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)`,[appId,String(userId),currency,-value,reason,reference,metadata]);
  return {balance:Number(result.rows[0][col])};
}
