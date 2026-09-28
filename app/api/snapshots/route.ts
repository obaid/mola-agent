// API route for snapshots management
import { NextRequest, NextResponse } from 'next/server';
import { listSnapshots, createSnapshot, deleteSnapshot, restoreSnapshot } from '@/lib/cloud';
import { getBackend } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const backend = getBackend();
    if (backend !== 'cloud') {
      return NextResponse.json({ error: 'Snapshots only available with cloud backend' }, { status: 400 });
    }
    
    const computerId = request.nextUrl.searchParams.get('computerId');
    if (!computerId) {
      return NextResponse.json({ error: 'computerId required' }, { status: 400 });
    }
    
    const snapshots = await listSnapshots(computerId);
    return NextResponse.json({ snapshots });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const backend = getBackend();
    if (backend !== 'cloud') {
      return NextResponse.json({ error: 'Snapshots only available with cloud backend' }, { status: 400 });
    }
    
    const body = await request.json();
    const { computerId, name, action, snapshotId } = body;
    
    if (!computerId) {
      return NextResponse.json({ error: 'computerId required' }, { status: 400 });
    }
    
    if (action === 'restore') {
      if (!snapshotId) {
        return NextResponse.json({ error: 'snapshotId required for restore' }, { status: 400 });
      }
      const result = await restoreSnapshot(computerId, snapshotId);
      return NextResponse.json({ result });
    } else {
      // create
      if (!name) {
        return NextResponse.json({ error: 'name required' }, { status: 400 });
      }
      const result = await createSnapshot(computerId, name);
      return NextResponse.json({ result });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const backend = getBackend();
    if (backend !== 'cloud') {
      return NextResponse.json({ error: 'Snapshots only available with cloud backend' }, { status: 400 });
    }
    
    const computerId = request.nextUrl.searchParams.get('computerId');
    const snapshotId = request.nextUrl.searchParams.get('snapshotId');
    
    if (!computerId || !snapshotId) {
      return NextResponse.json({ error: 'computerId and snapshotId required' }, { status: 400 });
    }
    
    await deleteSnapshot(computerId, snapshotId);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
