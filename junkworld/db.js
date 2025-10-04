/**
 * JunkWorld Supabase client + MMORPG persistence helpers.
 *
 * Auth model:
 * - Uses anonymous sign-in so each browser session gets a user_id (respects RLS).
 * - In Supabase Auth, enable "Allow anonymous sign-ins".
 *
 * Security:
 * - DO NOT use service_role on the client. Keep service keys server-side only in production.
 * - This file uses the anon public key from images.js.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./images.js";

// Create a supabase client with anon key
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Ensure we have an authenticated user (anonymous session)
async function ensureSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

async function getUserId() {
  const user = await ensureSession();
  return user.id;
}

/**
 * PROFILES
 */
async function ensureProfile({ username, wallet_address } = {}) {
  const user_id = await getUserId();
  const payload = { user_id };
  if (username != null) payload.username = username;
  if (wallet_address != null) payload.wallet_address = wallet_address;

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function getProfile() {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user_id)
    .single();
  // PGRST116 = result not found
  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

async function setUsername(username) {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("user_id", user_id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function setWalletAddress(wallet_address) {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("profiles")
    .update({ wallet_address })
    .eq("user_id", user_id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function updateBalances({ cash, junk }) {
  const user_id = await getUserId();
  const patch = {};
  if (typeof cash === "number") patch.cash = cash;
  if (typeof junk === "number") patch.junk = junk;
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user_id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * USER COORDINATES / STATE
 */
async function saveCoordinates({ x = 0, y = 0, z = 0, zone = null } = {}) {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("user_state")
    .upsert(
      { user_id, pos_x: x, pos_y: y, pos_z: z, zone },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function loadCoordinates() {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("user_state")
    .select("*")
    .eq("user_id", user_id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

/**
 * SKILLS
 */
async function getSkills() {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("user_skills")
    .select("skill_id, level, xp, skills:skills!inner(id, slug, name)")
    .eq("user_id", user_id);
  if (error) throw error;
  return data;
}

async function upsertSkillBySlug(slug, { level = 1, xp = 0 } = {}) {
  const user_id = await getUserId();

  const { data: skill, error: e1 } = await supabase
    .from("skills")
    .select("id")
    .eq("slug", slug)
    .single();
  if (e1) throw e1;

  const { data, error } = await supabase
    .from("user_skills")
    .upsert(
      { user_id, skill_id: skill.id, level, xp },
      { onConflict: "user_id,skill_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * INVENTORY
 */
async function getInventory() {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("user_inventory")
    .select(
      "quantity, item_id, items:items!inner(id, slug, name, rarity, stackable)"
    )
    .eq("user_id", user_id);
  if (error) throw error;
  return data;
}

async function setInventoryQuantityBySlug(slug, quantity) {
  const user_id = await getUserId();

  const { data: item, error: e1 } = await supabase
    .from("items")
    .select("id")
    .eq("slug", slug)
    .single();
  if (e1) throw e1;

  const { data, error } = await supabase
    .from("user_inventory")
    .upsert(
      { user_id, item_id: item.id, quantity },
      { onConflict: "user_id,item_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function addInventoryBySlug(slug, delta) {
  const user_id = await getUserId();

  const { data: item, error: e1 } = await supabase
    .from("items")
    .select("id")
    .eq("slug", slug)
    .single();
  if (e1) throw e1;

  const { data: current, error: e2 } = await supabase
    .from("user_inventory")
    .select("quantity")
    .eq("user_id", user_id)
    .eq("item_id", item.id)
    .single();
  // PGRST116 = not found is ok (treated as 0)
  if (e2 && e2.code !== "PGRST116") throw e2;

  const nextQty = Math.max(0, (current?.quantity || 0) + delta);

  const { data, error } = await supabase
    .from("user_inventory")
    .upsert(
      { user_id, item_id: item.id, quantity: nextQty },
      { onConflict: "user_id,item_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * SAVE SLOTS
 */
async function saveSlot(slot, dataObj) {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("user_saves")
    .upsert(
      { user_id, slot, data: dataObj },
      { onConflict: "user_id,slot" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function loadSaves() {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("user_saves")
    .select("*")
    .eq("user_id", user_id)
    .order("slot", { ascending: true });
  if (error) throw error;
  return data;
}

async function loadSave(slot) {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("user_saves")
    .select("*")
    .eq("user_id", user_id)
    .eq("slot", slot)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

// Export helpers and attach to window for non-module scripts
const DB = {
  supabase,
  ensureSession,
  getUserId,
  // profiles
  ensureProfile,
  getProfile,
  setUsername,
  setWalletAddress,
  updateBalances,
  // state
  saveCoordinates,
  loadCoordinates,
  // skills
  getSkills,
  upsertSkillBySlug,
  // inventory
  getInventory,
  setInventoryQuantityBySlug,
  addInventoryBySlug,
  // saves
  saveSlot,
  loadSaves,
  loadSave
};

if (typeof window !== "undefined") {
  window.DB = DB;
}

export {
  supabase,
  ensureSession,
  getUserId,
  ensureProfile,
  getProfile,
  setUsername,
  setWalletAddress,
  updateBalances,
  saveCoordinates,
  loadCoordinates,
  getSkills,
  upsertSkillBySlug,
  getInventory,
  setInventoryQuantityBySlug,
  addInventoryBySlug,
  saveSlot,
  loadSaves,
  loadSave
};

export default DB;
