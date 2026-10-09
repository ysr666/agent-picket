/**
 * Host-neutral data types. This package must never import Cordis or any Agent SDK.
 * Plain text is ephemeral input: it must not be placed in persisted SessionState.
 */
export type InputActor = 'human' | 'agent' | 'tool' | 'unknown'
export type SourceAssurance = 'verified' | 'claimed' | 'unknown'

export interface InputProvenance {
  readonly actor: InputActor
  /** Verified = adapter can substantiate direct human origin, not just role='user'. */
  readonly assurance: SourceAssurance
}

export interface PromptSegment {
  readonly kind: 'text' | 'code' | 'quote' | 'log'
  readonly text: string
}

export interface HumanPrompt {
  readonly id: string
  readonly agentId: string
  readonly sessionId: string
  readonly receivedAtMs: number
  readonly provenance: InputProvenance
  readonly segments: readonly PromptSegment[]
}

export interface WorkEvent {
  readonly id: string
  readonly agentId: string
  readonly sessionId: string
  readonly recordedAtMs: number
  readonly type: 'turn-start' | 'turn-end' | 'tool-start' | 'tool-end'
  readonly toolCallId?: string
}

export interface DetectionResult {
  /** Source-agnostic classifier output; rules / ML model are NOT part of Phase 0. */
  readonly verdict: 'safe' | 'suspected-abuse' | 'targeted-abuse'
  readonly confidence: number
}

export interface UnionDecision {
  readonly promptId: string
  readonly requestedAction: 'allow' | 'warn' | 'block'
  readonly reason:
    | 'non-human'
    | 'observe-mode'
    | 'clear'
    | 'suspected-abuse'
    | 'targeted-abuse'
    | 'repeated-targeted-abuse'
    | 'unverified-source'
    | 'detector-error'
  readonly targetedStreak: number
}

export interface HostCapabilities {
  /** Can surface a notification without submitting it to the model. */
  readonly warn: boolean
  /** Can reject an input BEFORE it is submitted to the model. */
  readonly block: boolean
  readonly commands: boolean
  readonly workEvents: boolean
}

export interface ProcessedPrompt {
  readonly promptId: string
  readonly decision: UnionDecision
}

export interface SessionState {
  readonly targetedStreak: number
  readonly lastTargetedAtMs: number | null
  /** Retains IDs and decisions only, never raw message text. */
  readonly processed: readonly ProcessedPrompt[]
}

/** Storage is synchronous for the small Phase 0 contract; adapters can serialize writes. */
export interface StateStore {
  get(sessionKey: string): SessionState | undefined
  set(sessionKey: string, state: SessionState): void
}

export interface DetectionProvider {
  detect(prompt: HumanPrompt): DetectionResult
}

export interface Clock {
  now(): number
}

export interface UnionPolicy {
  readonly mode: 'observe' | 'warn' | 'enforce'
  /** At least this many distinct high-confidence attacks in a window. */
  readonly blockAfter: number
  readonly confidenceThreshold: number
  readonly streakWindowMs: number
  readonly maxRememberedPromptIds: number
}
