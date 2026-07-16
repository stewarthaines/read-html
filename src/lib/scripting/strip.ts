// Default scripting posture (§3.4): book scripts are stripped from markup
// resources before foliate creates their blob: URLs. The consent flow (M5)
// will bypass this per book; until then stripping is unconditional.
// SVG is included beyond §3.4's letter: it goes through the same loader path
// and can carry script elements and event-handler attributes.
export const STRIPPABLE_TYPES = ['application/xhtml+xml', 'text/html', 'image/svg+xml']

export function stripScripts(markup: string, mediaType: string): string {
  const doc = new DOMParser().parseFromString(markup, mediaType as DOMParserSupportedType)
  for (const script of Array.from(doc.querySelectorAll('script'))) script.remove()
  for (const element of Array.from(doc.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith('on')) {
        element.removeAttributeNode(attribute)
      }
    }
  }
  // foliate serializes section documents with XMLSerializer for all markup
  // types (epub.js loadReplaced); matching it keeps round-trips consistent.
  return new XMLSerializer().serializeToString(doc)
}
