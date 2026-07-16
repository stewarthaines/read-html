// Consent state machine (§3.4). The recorded consent lives on the book's
// metadata record; `undefined` means the reader has never answered.
export type ScriptingDecision = 'run' | 'strip' | 'ask'

export function decideScripting(
  isScripted: boolean,
  consent: boolean | undefined,
): ScriptingDecision {
  if (!isScripted) return 'strip'
  if (consent === true) return 'run'
  if (consent === false) return 'strip'
  return 'ask'
}
