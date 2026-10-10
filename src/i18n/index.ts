import { en } from './en.ts'
import { zhCN } from './zh-CN.ts'

export { en, zhCN }
export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const
export type SupportedLocale = typeof SUPPORTED_LOCALES[number]
export type LocalePreference = SupportedLocale | 'auto'
export type MessageKey = keyof typeof en
export type MessageArgument = string | number

type Placeholders<T extends string> = T extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest> : never
export type MessageParameters<K extends MessageKey> = Record<Placeholders<(typeof en)[K]>, MessageArgument>
type FormatArgs<K extends MessageKey> = [Placeholders<(typeof en)[K]>] extends [never]
  ? [params?: Record<string, never>] : [params: MessageParameters<K>]

const catalogs: Readonly<Record<SupportedLocale, Readonly<Record<MessageKey, string>>>> = {
  en,
  'zh-CN': zhCN,
}

/** BCP-47 compatible input; never map Traditional Chinese to Simplified Chinese. */
export function normalizeLocale(input: unknown): SupportedLocale | null {
  if (typeof input !== 'string') return null
  const tag = input.trim().replaceAll('_', '-').toLowerCase()
  if (tag === 'en' || tag.startsWith('en-')) return 'en'
  if (tag === 'zh' || tag === 'zh-cn' || tag.startsWith('zh-cn-') ||
    tag === 'zh-sg' || tag.startsWith('zh-sg-') ||
    tag === 'zh-hans' || tag.startsWith('zh-hans-')) return 'zh-CN'
  return null
}

export function resolveLocale(source: {
  readonly preference?: unknown
  readonly hostLocale?: unknown
  readonly systemLocale?: unknown
} = {}): SupportedLocale {
  for (const candidate of [source.preference, source.hostLocale, source.systemLocale]) {
    const resolved = normalizeLocale(candidate)
    if (resolved) return resolved
  }
  return 'en'
}

/** Interpolate only named placeholders. Callers must render output as TEXT, never raw HTML. */
export function formatMessage<K extends MessageKey>(
  locale: SupportedLocale, key: K, ...args: FormatArgs<K>
): string {
  const template = catalogs[locale]?.[key] ?? en[key]
  const params = (args[0] ?? {}) as Record<string, MessageArgument>
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      throw new Error(`Missing i18n argument: ${key}.${name}`)
    }
    const value = params[name]
    if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`Invalid i18n argument: ${key}.${name}`)
    }
    return String(value)
  })
}

/** Intl handles plural categories; Chinese correctly uses the 'other' form for 1. */
export function formatPlural(
  locale: SupportedLocale, count: number,
  forms: { readonly one: MessageKey; readonly other: MessageKey },
): string {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid plural count')
  const category = new Intl.PluralRules(locale).select(count)
  const key = category === 'one' ? forms.one : forms.other
  // Plural templates consistently use a single {count} named argument.
  const text = catalogs[locale]?.[key] ?? en[key]
  return text.replaceAll('{count}', new Intl.NumberFormat(locale).format(count))
}

/** Does not infer work duration; format only validated, observed milliseconds. */
export function formatElapsed(locale: SupportedLocale, elapsedMs: number | null): string {
  if (elapsedMs === null || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return formatMessage(locale, 'workday.unknown')
  }
  const seconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return formatMessage(locale, 'time.hoursMinutes', { hours, minutes })
  if (minutes > 0) return formatMessage(locale, 'time.minutes', { minutes })
  return formatMessage(locale, 'time.seconds', { seconds })
}

/** Host Adapter owns persistence; this independent module never reads files or settings. */
export interface LocalePreferenceStore {
  load(): unknown
  save(preference: LocalePreference): void
}

export interface LocaleControllerOptions {
  readonly store?: LocalePreferenceStore
  readonly hostLocale?: () => unknown
  readonly systemLocale?: () => unknown
}

export function createLocaleController(options: LocaleControllerOptions = {}) {
  const read = (): { preference: unknown; storageAvailable: boolean } => {
    if (!options.store) return { preference: 'auto', storageAvailable: false }
    try {
      return { preference: options.store.load(), storageAvailable: true }
    } catch {
      return { preference: 'auto', storageAvailable: false }
    }
  }
  const snapshot = () => {
    const { preference, storageAvailable } = read()
    let host: unknown
    let system: unknown
    try { host = options.hostLocale?.() } catch { /* fallback only */ }
    try { system = options.systemLocale?.() } catch { /* fallback only */ }
    return {
      locale: resolveLocale({ preference, hostLocale: host, systemLocale: system }),
      preference: preference === 'auto' || normalizeLocale(preference) ? preference : 'auto',
      storageAvailable,
    }
  }
  const setPreference = (preference: LocalePreference): void => {
    if (preference !== 'auto' && preference !== 'en' && preference !== 'zh-CN') {
      throw new Error('Unsupported locale preference')
    }
    if (!options.store) throw new Error('Locale preference storage is unavailable')
    options.store.save(preference)
    // Do not report success if a Host failed to persist the new setting.
    if (options.store.load() !== preference) throw new Error('Locale preference was not persisted')
  }
  return { snapshot, setPreference }
}
