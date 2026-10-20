import crypto from 'node:crypto';

export class YachtRepository {
  constructor(db) { this.db = db; }
  create(d) {
    const id = d.id || crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.execute(
      `INSERT INTO yachts (id, org_id, name, flag, home_port, owner_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, d.orgId, d.name, d.flag || null, d.homePort || null, d.ownerCode, now, now]
    );
    return this.findById(id);
  }
  findById(id) {
    const r = this.db.queryOne('SELECT * FROM yachts WHERE id = ?', [id]);
    return r ? this.map(r) : null;
  }
  findByOrg(orgId) {
    return this.db.query('SELECT * FROM yachts WHERE org_id = ? ORDER BY name ASC', [orgId]).map(r => this.map(r));
  }
  map(r) {
    return { id: r.id, orgId: r.org_id, name: r.name, flag: r.flag, homePort: r.home_port,
      ownerCode: r.owner_code, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) };
  }
}

export class CrewRepository {
  constructor(db) { this.db = db; }
  create(d) {
    const id = d.id || crypto.randomUUID();
    if (!d.fullName || !d.rank || !d.homeCurrency || !d.bankCountry || !d.ibanOrAccount) {
      throw new Error('Crew requires fullName, rank, homeCurrency, bankCountry, ibanOrAccount.');
    }
    if (!/^[A-Z]{3}$/.test(String(d.homeCurrency))) throw new Error('homeCurrency must be ISO-4217 (e.g. PHP).');
    const now = new Date().toISOString();
    this.db.execute(
      `INSERT INTO crew (id, org_id, yacht_id, full_name, rank, nationality, home_currency,
        bank_country, iban_or_account, day_rate_minor, day_rate_currency, phone,
        whatsapp_verified, wise_recipient_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, d.orgId, d.yachtId || null, d.fullName, d.rank, d.nationality || null,
       d.homeCurrency, d.bankCountry, d.ibanOrAccount, Number(d.dayRateMinor),
       d.dayRateCurrency || 'EUR', d.phone || null, d.whatsappVerified ? 1 : 0,
       d.wiseRecipientId || null, now, now]
    );
    return this.findById(id);
  }
  findById(id) {
    const r = this.db.queryOne('SELECT * FROM crew WHERE id = ?', [id]);
    return r ? this.map(r) : null;
  }
  findByOrg(orgId) {
    return this.db.query('SELECT * FROM crew WHERE org_id = ? ORDER BY full_name ASC', [orgId]).map(r => this.map(r));
  }
  findByYacht(yachtId) {
    return this.db.query('SELECT * FROM crew WHERE yacht_id = ? ORDER BY full_name ASC', [yachtId]).map(r => this.map(r));
  }
  setWiseRecipient(id, recipientId) {
    this.db.execute('UPDATE crew SET wise_recipient_id = ?, updated_at = ? WHERE id = ?',
      [recipientId, new Date().toISOString(), id]);
    return this.findById(id);
  }
  map(r) {
    return { id: r.id, orgId: r.org_id, yachtId: r.yacht_id, fullName: r.full_name,
      rank: r.rank, nationality: r.nationality, homeCurrency: r.home_currency,
      bankCountry: r.bank_country, ibanOrAccount: r.iban_or_account,
      dayRateMinor: Number(r.day_rate_minor), dayRateCurrency: r.day_rate_currency,
      phone: r.phone, whatsappVerified: Boolean(r.whatsapp_verified),
      wiseRecipientId: r.wise_recipient_id,
      createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) };
  }
}
