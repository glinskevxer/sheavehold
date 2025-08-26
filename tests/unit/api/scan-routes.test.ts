import { describe, expect, it } from 'vitest';
import { apiHarness } from '../../support/api.js';
import { uploadFile } from '../../support/uploads.js';

const get = (path: string) => apiHarness().router.handle({ method: 'GET', path });

describe('reading scans', () => {
  it('gives a day of scans', () => {
    const response = get('/scans/day/2025-01-13');
    expect(response.status).toBe(200);
    expect((response.body as { scans: unknown[] }).scans).toHaveLength(3);
  });

  it('gives an empty day rather than a not found', () => {
    const response = get('/scans/day/2025-01-20');
    expect(response.status).toBe(200);
    expect((response.body as { scans: unknown[] }).scans).toEqual([]);
  });

  it('refuses a date that is not a date', () => {
    const response = get('/scans/day/yesterday');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'bad_date' });
  });

  it('follows one card', () => {
    const response = get('/scans/media/E2004A1B00000123');
    expect((response.body as { scans: unknown[] }).scans).toHaveLength(2);
  });

  it('refuses a card that is not a serial', () => {
    expect(get('/scans/media/nope').status).toBe(400);
  });

  it('follows one gate', () => {
    const response = get('/scans/terminal/SUNB.01');
    expect((response.body as { scans: unknown[] }).scans).toHaveLength(2);
  });

  it('refuses a gate id that is not one', () => {
    expect(get('/scans/terminal/SUNB').status).toBe(400);
  });

  it('gives the wire shape rather than the internal one', () => {
    const response = get('/scans/day/2025-01-13');
    const [first] = (response.body as { scans: Record<string, unknown>[] }).scans;
    expect(Object.keys(first ?? {})).toEqual([
      'terminal',
      'lift',
      'media',
      'at',
      'reportedAt',
      'correctionMs',
      'date',
      'sequence',
      'outcome',
      'weakRead',
    ]);
    expect(typeof first?.at).toBe('string');
  });
});

describe('reading batches', () => {
  it('lists every upload', () => {
    const response = get('/batches');
    expect((response.body as { batches: unknown[] }).batches).toHaveLength(2);
  });

  it('gives one upload', () => {
    const response = get('/batches/up-441');
    expect(response.body).toMatchObject({ batch: 'up-441', accepted: true, rows: 2 });
  });

  it('says so when the upload is not on file', () => {
    const response = get('/batches/up-999');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'no_batch' });
  });
});

describe('posting an upload', () => {
  const post = (body: unknown, scopes: string[] = ['ingest']) =>
    apiHarness().router.handle({ method: 'POST', path: '/batches', body, scopes });

  it('takes a good upload and says what it did', () => {
    const response = post(uploadFile([{ at: '2025-01-14T17:00:00Z', seq: 9 }], { batch: 'up-9' }));
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ batch: 'up-9', accepted: true, rowsStored: 1 });
  });

  it('takes a bad envelope in but does not accept it', () => {
    const response = post(
      uploadFile([{ at: '2025-01-14T17:00:00Z', seq: 9 }], { batch: 'up-9', checksum: '00000000' }),
    );
    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ accepted: false, rowsStored: 0 });
  });

  it('refuses an empty body', () => {
    expect(post('').status).toBe(400);
    expect(post(undefined).status).toBe(400);
  });

  it('refuses a body it cannot read as an upload', () => {
    const response = post('not an upload at all');
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'unreadable_upload' });
  });

  it('needs the ingest scope', () => {
    expect(post(uploadFile([{ at: '2025-01-14T17:00:00Z', seq: 9 }]), []).status).toBe(403);
  });
});
