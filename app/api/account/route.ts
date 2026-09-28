// API route for account info and usage
import { NextResponse } from 'next/server';
import { getAccount } from '@/lib/cloud';
import { getBackend } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const backend = getBackend();
    
    if (backend !== 'cloud') {
      return NextResponse.json({ account: null });
    }
    
    const account = await getAccount();
    return NextResponse.json({ account });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
