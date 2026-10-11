/** Small, browser-safe type contract for the authenticated ephemeral status. */
export const DIGNITY_FETCH_PATH='/api/agent-picket/dignity/v1'
export type DignityVerdict='none'|'safe'|'review'|'targeted'
export interface DignitySummary {
  readonly schemaVersion:1
  readonly source:'dsh-host-volatile-dignity'
  readonly checked:number
  readonly safe:number
  readonly review:number
  readonly targeted:number
  readonly latest:DignityVerdict
  readonly origin:'claimed-user-source'
  readonly enforcement:false
  readonly persistence:'memory-only'
}
