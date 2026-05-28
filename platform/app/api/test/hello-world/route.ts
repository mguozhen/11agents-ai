import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const { initHelloWorld } = await import('@/server/test-hello-world.js')
    const result = await initHelloWorld()
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
