import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser-safe client (anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-only admin client (service role — never expose to browser)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          password_hash: string | null
          provider: 'email' | 'google' | 'strava'
          provider_id: string | null
          strava_access_token: string | null
          strava_athlete_id: number | null
          utmb_index: string | null
          itra_index: string | null
          lthr: number | null
          maxhr: number | null
          rhr: number | null
          weight: number | null
          vam: number | null
          decouple_onset: number | null
          locale: 'en' | 'zh'
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      blueprints: {
        Row: {
          id: string
          user_id: string
          race_id: string
          target_minutes: number
          params: Record<string, unknown>
          segments: Record<string, unknown>[]
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['blueprints']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['blueprints']['Insert']>
      }
    }
  }
}
