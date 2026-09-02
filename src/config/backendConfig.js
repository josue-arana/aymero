// Aymero CRM backend configuration
//
// Phase 1.9 backend preparation:
// This layer is intentionally disabled for now so the free 1–5 contractor beta
// continues to run from local React state and mock data. When ready to connect
// Supabase Free Tier, set USE_SUPABASE to true and provide these Vite env vars:
// - VITE_SUPABASE_URL
// - VITE_SUPABASE_ANON_KEY
//
// Temporary beta exception:
// - USE_SUPABASE_SETTINGS can be enabled independently to test Company Settings
//   against Supabase while every other entity remains in local mode.
// - USE_SUPABASE_CLIENTS can be enabled independently to test Clients
//   against Supabase while every other entity remains in local mode.
// - USE_SUPABASE_LEADS can be enabled independently to test Leads
//   against Supabase while every other entity remains in local mode.
// - USE_SUPABASE_PROJECTS can be enabled independently to test Projects / Jobs
//   against Supabase while every other entity remains in local mode.
// - USE_SUPABASE_ESTIMATES can be enabled independently to test Estimates
//   against Supabase while every other entity remains in local mode.
// - USE_SUPABASE_CONTRACTS can be enabled independently to test Contracts
//   against Supabase while every other entity remains in local mode.
// - USE_SUPABASE_INVOICES can be enabled independently to test Invoices
//   against Supabase while every other entity remains in local mode.
// - USE_SUPABASE_PAYMENTS can be enabled independently to test Payments
//   against Supabase while every other entity remains in local mode.
// - USE_SUPABASE_EVENTS can be enabled independently to test Project Schedule
//   / Events against Supabase while every other entity remains in local mode.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ''
const ENABLE_DEVELOPER_ROUTES_FLAG = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEVELOPER_ROUTES === 'true'
const ENABLE_AI_SCOPE_ASSISTANT_FLAG = import.meta.env.VITE_AI_SCOPE_ASSISTANT_ENABLED === 'true'

export const USE_SUPABASE = false
export const USE_SUPABASE_SETTINGS = true
export const USE_SUPABASE_CLIENTS = true
export const USE_SUPABASE_LEADS = true
export const USE_SUPABASE_PROJECTS = true
export const USE_SUPABASE_ESTIMATES = true
export const USE_SUPABASE_CONTRACTS = true
export const USE_SUPABASE_INVOICES = true
export const USE_SUPABASE_PAYMENTS = true
export const USE_SUPABASE_EVENTS = true
export const USE_AUTH = true
export const USE_STORAGE = false
export const USE_REAL_EMAIL = false
export const USE_REAL_SMS = false
export const USE_PDF_EXPORT = false
export const BETA_CONTRACTOR_ID = '00000000-0000-0000-0000-000000000001'
export const ENABLE_DEVELOPER_ROUTES = ENABLE_DEVELOPER_ROUTES_FLAG
export const ENABLE_AI_SCOPE_ASSISTANT = ENABLE_AI_SCOPE_ASSISTANT_FLAG

export const backendConfig = {
  useSupabase: USE_SUPABASE,
  useSupabaseSettings: USE_SUPABASE_SETTINGS,
  useSupabaseClients: USE_SUPABASE_CLIENTS,
  useSupabaseLeads: USE_SUPABASE_LEADS,
  useSupabaseProjects: USE_SUPABASE_PROJECTS,
  useSupabaseEstimates: USE_SUPABASE_ESTIMATES,
  useSupabaseContracts: USE_SUPABASE_CONTRACTS,
  useSupabaseInvoices: USE_SUPABASE_INVOICES,
  useSupabasePayments: USE_SUPABASE_PAYMENTS,
  useSupabaseEvents: USE_SUPABASE_EVENTS,
  useAuth: USE_AUTH,
  useStorage: USE_STORAGE,
  useRealEmail: USE_REAL_EMAIL,
  useRealSms: USE_REAL_SMS,
  usePdfExport: USE_PDF_EXPORT,
  enableDeveloperRoutes: ENABLE_DEVELOPER_ROUTES,
  enableAiScopeAssistant: ENABLE_AI_SCOPE_ASSISTANT,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  betaContractorId: BETA_CONTRACTOR_ID,
  betaPlan: {
    name: 'Free 1–5 contractor beta',
    maxContractors: 5,
    provider: 'Supabase Free Tier',
  },
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export function isSupabaseAuthConfigured() {
  return Boolean(USE_AUTH && SUPABASE_URL && SUPABASE_ANON_KEY)
}

export function isSupabaseDataEnabled() {
  return USE_SUPABASE === true
    || USE_SUPABASE_SETTINGS === true
    || USE_SUPABASE_CLIENTS === true
    || USE_SUPABASE_LEADS === true
    || USE_SUPABASE_PROJECTS === true
    || USE_SUPABASE_ESTIMATES === true
    || USE_SUPABASE_CONTRACTS === true
    || USE_SUPABASE_INVOICES === true
    || USE_SUPABASE_PAYMENTS === true
    || USE_SUPABASE_EVENTS === true
}

export function isSupabaseAuthEnabled() {
  return USE_AUTH === true
}

export function isBackendEnabled() {
  return USE_SUPABASE === true
}

export function getDataModeLabel() {
  if (USE_SUPABASE) return 'Supabase'
  if (
    [USE_SUPABASE_SETTINGS, USE_SUPABASE_CLIENTS, USE_SUPABASE_LEADS, USE_SUPABASE_PROJECTS, USE_SUPABASE_ESTIMATES, USE_SUPABASE_CONTRACTS, USE_SUPABASE_INVOICES, USE_SUPABASE_PAYMENTS, USE_SUPABASE_EVENTS].filter(Boolean).length > 1
  ) return 'Selected Entities via Supabase'
  if (USE_SUPABASE_SETTINGS) return 'Settings via Supabase'
  if (USE_SUPABASE_CLIENTS) return 'Clients via Supabase'
  if (USE_SUPABASE_LEADS) return 'Leads via Supabase'
  if (USE_SUPABASE_PROJECTS) return 'Projects via Supabase'
  if (USE_SUPABASE_ESTIMATES) return 'Estimates via Supabase'
  if (USE_SUPABASE_CONTRACTS) return 'Contracts via Supabase'
  if (USE_SUPABASE_INVOICES) return 'Invoices via Supabase'
  if (USE_SUPABASE_PAYMENTS) return 'Payments via Supabase'
  if (USE_SUPABASE_EVENTS) return 'Events via Supabase'
  return 'Local Mock Data'
}

export function getSettingsDataModeLabel() {
  if (USE_SUPABASE_SETTINGS) return 'Supabase'
  return USE_SUPABASE ? 'Supabase' : 'Local Mock Data'
}

export default backendConfig
