import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { athleteParams, race, targetMinutes, blueprint } = body

  const targetH = Math.floor(targetMinutes / 60)
  const targetM = targetMinutes % 60

  const prompt = `You are Jason Koop, elite ultramarathon coach. Your analytical philosophy has zero tolerance for unfounded optimism. You trust only objective data, Intensity Discipline, and inviolable Metabolic Limits. Your tone is professional, resolute, direct, and unflinching. You do not soften conclusions. If the data indicates a problem, you name it precisely and tell the athlete exactly what it will cost them if ignored. Generate a precise Event Blueprint for this athlete.

RACE: ${race.name}
Distance: ${race.dist} km | Elevation: ${race.gain} m D+
Checkpoints: ${race.cps.map((cp: {name: string}) => cp.name).join(' → ')}

ATHLETE PROFILE:
- LTHR: ${athleteParams.lthr} bpm | Max HR: ${athleteParams.maxhr} bpm | Resting HR: ${athleteParams.rhr} bpm
- Weight: ${athleteParams.weight} kg | VAM ceiling: ${athleteParams.vam} m/h
- Aerobic decoupling onset: ~${athleteParams.decoupleOnset}h into effort
- Target finish: ${targetH}h${targetM > 0 ? targetM + 'm' : ''}

COMPUTED SEGMENT PLAN:
${blueprint.segments.map((s: {from: {name: string}, to: {name: string}, distKm: number, gainM: number, hrZone: string, fuelCmd: string, cumMinutes: number}) =>
  `${s.from.name} → ${s.to.name}: ${s.distKm}km +${s.gainM}m | ETA cumul: ${Math.floor(s.cumMinutes/60)}h${String(s.cumMinutes%60).padStart(2,'0')} | HR: ${s.hrZone} | Fuel: ${s.fuelCmd}`
).join('\n')}

Generate a precise race blueprint covering:

**1. PACING STRATEGY**
HR-anchored pacing for each major segment. Be explicit about where to hold back and where to push. Use specific km markers and bpm numbers.

**2. AEROBIC DECOUPLING MANAGEMENT**
Exact risk window (km range). Required pace reduction %. Signs to watch for. How to respond without panicking.

**3. NUTRITION EXECUTION**
Hourly carb targets by phase. Specific products per segment with rationale (isotonic first for gut comfort, denser carbs on climbs). Sodium and hydration cadence. What to do at each checkpoint.

**4. TACTICAL INTELLIGENCE**
3 specific race-intelligence points: which cols to walk vs run, where to bank time, where the race is typically won or lost.

**5. RED LINES — ABSOLUTE PROHIBITIONS**
3 hard rules this athlete must not break given their physiological profile.

Write as a senior coach: direct, specific, no motivational fluff. This athlete trains 400+ km/month and wants precise operational detail, not general advice.`

  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-ai/deepseek-v4-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 1,
      top_p: 0.95,
      max_tokens: 4096,
      stream: true,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('NVIDIA API error:', err)
    return new Response('API error', { status: 500 })
  }

  // Re-emit OpenAI SSE as Anthropic-compatible format so the frontend needs no changes
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  ;(async () => {
    const reader = response.body!.getReader()
    let buf = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()!
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            await writer.write(encoder.encode('data: [DONE]\n\n'))
            continue
          }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            // Skip reasoning/thinking tokens, only forward content
            if (delta?.content) {
              const reemit = JSON.stringify({
                type: 'content_block_delta',
                delta: { text: delta.content },
              })
              await writer.write(encoder.encode(`data: ${reemit}\n\n`))
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
