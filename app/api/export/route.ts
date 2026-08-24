import { NextResponse } from 'next/server';
import { toCmykPng } from '@/lib/cmyk';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'An image file is required.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'The image file was empty.' }, { status: 400 });
    }

    const customerName = String(form.get('customerName') ?? '').trim() || 'Customer';
    const stamp = String(form.get('stamp') ?? '').trim();
    const copy = Math.max(1, Number(form.get('copy')) || 1);
    const sheetLength = Math.max(12, Number(form.get('sheetLength')) || 12);
    const print = await toCmykPng(
      buffer,
      file.name || 'artwork.png',
      customerName,
      stamp || undefined,
      copy,
      sheetLength,
    );
    return new NextResponse(new Uint8Array(print.buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${print.name}"`,
        'X-Color-Space': 'CMYK',
        'X-Background': 'transparent',
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not export a CMYK PNG.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
