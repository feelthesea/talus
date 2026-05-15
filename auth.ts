import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    // Email + password
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email as string
        const password = credentials.password as string

        const { data: user } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('email', email)
          .single()

        if (!user || !user.password_hash) return null

        const valid = await bcrypt.compare(password, user.password_hash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name, locale: user.locale }
      },
    }),

    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // For Google OAuth: upsert user in our DB
      if (account?.provider === 'google' && user.email) {
        const { data: existing } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', user.email)
          .single()

        if (!existing) {
          await supabaseAdmin.from('users').insert({
            id: user.id || undefined,
            email: user.email,
            name: user.name || null,
            provider: 'google',
            provider_id: account.providerAccountId,
            locale: 'en',
          })
        }
      }
      return true
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.locale = (user as { locale?: string }).locale || 'en'
      }
      // Allow locale updates via update() call
      if (trigger === 'update' && session?.locale) {
        token.locale = session.locale
      }
      return token
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        ;(session as { locale?: string }).locale = token.locale as string
      }
      return session
    },
  },
})

// Extend next-auth types
declare module 'next-auth' {
  interface User {
    locale?: string
  }
  interface Session {
    user: { id: string; email: string; name?: string | null }
    locale?: string
  }
}
