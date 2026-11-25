import crypto from 'node:crypto';

export class InviteRepository {
  constructor(db) { this.db = db; }
  /** Create invite; returns { id, token } — token shown ONCE, only hash stored. */
  create({ orgId, yachtId = null, contact = null, ttlHours = 72 }) {
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();
    const exp = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
    this.db.execute(
      `INSERT INTO crew_invites (id, org_id, yacht_id, contact, token_hash, expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, orgId, yachtId, contact, hash, exp, now]
    );
    return { id, token, expiresAt: exp };
  }
  findByToken(token) {
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const r = this.db.queryOne('SELECT * FROM crew_invites WHERE token_hash=?', [hash]);
    return r ? this.map(r) : null;
  }
  findById(id) {
    const r = this.db.queryOne('SELECT * FROM crew_invites WHERE id=?', [id]);
    return r ? this.map(r) : null;
  }
  listPending(orgId) {
    return this.db.query(`SELECT * FROM crew_invites WHERE org_id=? AND status='PENDING' ORDER BY created_at DESC`, [orgId]).map(r => this.map(r));
  }
  accept(id) {
    const now = new Date().toISOString();
    this.db.execute(`UPDATE crew_invites SET status='ACCEPTED', accepted_at=? WHERE id=?`, [now, id]);
    return this.findById(id);
  }
  map(r) {
    return { id: r.id, orgId: r.org_id, yachtId: r.yacht_id, contact: r.contact,
      expiresAt: r.expires_at, acceptedAt: r.accepted_at, status: r.status, createdAt: r.created_at };
  }
}
