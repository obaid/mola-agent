// API route for cloud profiles
import { NextResponse } from 'next/server';
import { getProfiles } from '@/lib/cloud';
import { getBackend } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const backend = getBackend();
    
    if (backend !== 'cloud') {
      return NextResponse.json({ profiles: [] });
    }
    
    const profiles = await getProfiles();
    return NextResponse.json({ profiles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
