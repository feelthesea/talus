import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { email, password, name, locale } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Check existing
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const password_hash = await bcrypt.hash(password, 12)

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .insert({
      email,
      name: name || null,
      password_hash,
      provider: 'email',
      locale: locale || 'en',
    })
    .select('id, email, name')
    .single()

  if (error || !user) {
    console.error(error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, user: { id: user.id, email: user.email } })
}
