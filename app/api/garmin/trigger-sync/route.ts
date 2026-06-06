import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function POST() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.id !== process.env.USER1_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO

  if (!token || !repo) {
    return NextResponse.json({ error: 'GitHub integration not configured' }, { status: 500 })
  }

  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/garmin-biometrics.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )

  if (!response.ok && response.status !== 204) {
    const text = await response.text()
    console.error('GitHub dispatch failed:', response.status, text)
    return NextResponse.json({ error: 'Failed to trigger sync' }, { status: 502 })
  }

  return NextResponse.json({ triggered: true })
}
