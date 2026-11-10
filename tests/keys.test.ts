// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { keyIsClaimed } from '../src/lib/reader/keys'

function element(html: string): Element {
  document.body.innerHTML = html
  const target = document.body.querySelector('[data-target]')
  if (!target) throw new Error('fixture has no [data-target]')
  return target
}

describe('keyIsClaimed', () => {
  it('leaves every paging key to the book when nothing is focused', () => {
    expect(keyIsClaimed(document.body, 'ArrowRight')).toBe(false)
    expect(keyIsClaimed(null, 'ArrowRight')).toBe(false)
  })

  it('lets arrows page from a focused button, which keeps only Space', () => {
    const button = element('<button data-target>⚙</button>')
    expect(keyIsClaimed(button, 'ArrowLeft')).toBe(false)
    expect(keyIsClaimed(button, 'PageDown')).toBe(false)
    expect(keyIsClaimed(button, ' ')).toBe(true)
  })

  it('treats a checkbox like a button', () => {
    const box = element('<input type="checkbox" data-target />')
    expect(keyIsClaimed(box, 'ArrowRight')).toBe(false)
    expect(keyIsClaimed(box, ' ')).toBe(true)
  })

  it('leaves every key to controls that use arrows', () => {
    for (const html of [
      '<input data-target />',
      '<input type="range" data-target />',
      '<input type="radio" data-target />',
      '<select data-target></select>',
      '<textarea data-target></textarea>',
      '<div contenteditable="true"><span data-target>x</span></div>',
    ]) {
      expect(keyIsClaimed(element(html), 'ArrowRight')).toBe(true)
    }
  })

  it('does not count contenteditable="false" as editable', () => {
    expect(
      keyIsClaimed(element('<div contenteditable="false" data-target></div>'), 'ArrowRight'),
    ).toBe(false)
  })

  it('leaves keys inside a dialog to the dialog', () => {
    expect(keyIsClaimed(element('<dialog><p data-target>x</p></dialog>'), 'ArrowRight')).toBe(true)
  })

  it('recognises controls from another realm, as in a book section iframe', () => {
    const frame = document.createElement('iframe')
    document.body.replaceChildren(frame)
    const doc = frame.contentDocument
    if (!doc) throw new Error('no iframe document')
    doc.body.innerHTML = '<input type="range" />'
    const input = doc.querySelector('input')
    expect(input instanceof Element).toBe(false)
    expect(keyIsClaimed(input, 'ArrowRight')).toBe(true)
  })
})
