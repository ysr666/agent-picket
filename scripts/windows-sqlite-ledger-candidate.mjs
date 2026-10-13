/*
 * EXPERIMENT ONLY: a dependency-free SQLite transaction proof, NOT a shipped
 * DurableStats or an NTFS DACL / anti-rollback implementation.
 *
 * A completed-turn amount is accepted exactly once per keyed fingerprint.
 * Do not pass raw event ids, prompts or attachments to this database.
 */
import {DatabaseSync} from 'node:sqlite'
import {join} from 'node:path'

const FP=/^[a-f0-9]{64}$/
const DAY=/^\d{4}-\d{2}-\d{2}$/
export class SqliteWorkCandidate {
  #db
  constructor(privateDirectory) {
    this.#db=new DatabaseSync(join(privateDirectory,'work-candidate.sqlite'),{
      timeout:5000,
    })
    try {
      this.#db.exec('PRAGMA trusted_schema=OFF')
      const mode=this.#db.prepare('PRAGMA journal_mode=WAL').get()
      if(mode?.journal_mode?.toLowerCase()!=='wal')throw Error('SQLite WAL unavailable')
      this.#db.exec('PRAGMA synchronous=FULL')
      if(this.#db.prepare('PRAGMA synchronous').get()?.synchronous!==2)
        throw Error('SQLite FULL sync unavailable')
      this.#db.exec('PRAGMA foreign_keys=ON')
      this.#db.exec(`CREATE TABLE IF NOT EXISTS work_events(
        fp TEXT PRIMARY KEY NOT NULL CHECK(length(fp)=64),
        day TEXT NOT NULL,
        ms INTEGER NOT NULL CHECK(ms>=0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS daily_work(
        day TEXT PRIMARY KEY NOT NULL,
        completed_ms INTEGER NOT NULL CHECK(completed_ms>=0)
      ) STRICT;`)
      const check=this.#db.prepare('PRAGMA quick_check').get()
      if(check?.quick_check!=='ok')throw Error('SQLite database integrity check failed')
    } catch(err){this.#db.close();throw err}
  }
  commitCompleted(fp,day,ms){
    if(typeof fp!=='string'||!FP.test(fp)||
      typeof day!=='string'||!DAY.test(day)||
      !Number.isSafeInteger(ms)||ms<0||ms>86_400_000)
      throw Error('Invalid completed-turn evidence')
    if(new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)
      throw Error('Invalid UTC day')
    const db=this.#db
    db.exec('BEGIN IMMEDIATE')
    try {
      const inserted=db.prepare('INSERT OR IGNORE INTO work_events(fp,day,ms) VALUES(?,?,?)')
        .run(fp,day,ms)
      if(inserted.changes===1){
        db.prepare(`INSERT INTO daily_work(day,completed_ms) VALUES(?,?)
          ON CONFLICT(day) DO UPDATE SET completed_ms=completed_ms+excluded.completed_ms`)
          .run(day,ms)
      }
      db.exec('COMMIT')
      return inserted.changes===1
    }catch(err){if(db.isTransaction)db.exec('ROLLBACK');throw err}
  }
  count(day){
    if(!DAY.test(day))throw Error('Invalid day')
    return Number(this.#db.prepare('SELECT completed_ms FROM daily_work WHERE day=?').get(day)?.completed_ms??0)
  }
  integrity(){return this.#db.prepare('PRAGMA integrity_check').get()?.integrity_check==='ok'}
  // Test fault injection: create an open transaction and leave it uncommitted
  // across a forced process termination. This intentionally bypasses the
  // production-facing API and MUST NOT be shipped.
  beginUncommittedForTest(fp,day,ms){
    this.#db.exec('BEGIN IMMEDIATE')
    this.#db.prepare('INSERT INTO work_events(fp,day,ms) VALUES(?,?,?)').run(fp,day,ms)
    this.#db.prepare(`INSERT INTO daily_work(day,completed_ms) VALUES(?,?)
      ON CONFLICT(day) DO UPDATE SET completed_ms=completed_ms+excluded.completed_ms`).run(day,ms)
  }
  close(){this.#db.close()}
}
