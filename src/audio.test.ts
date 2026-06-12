import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { click, pop, chime, boing, swoosh } from './audio'

describe('audio', () => {
  it('click returns command with PlayClick name', () => {
    const cmd = click('msg')
    expect(cmd.name).toBe('PlayClick')
  })

  it('pop returns command with PlayPop name', () => {
    const cmd = pop('msg')
    expect(cmd.name).toBe('PlayPop')
  })

  it('chime returns command with PlayChime name', () => {
    const cmd = chime('msg')
    expect(cmd.name).toBe('PlayChime')
  })

  it('boing returns command with PlayBoing name', () => {
    const cmd = boing('msg')
    expect(cmd.name).toBe('PlayBoing')
  })

  it('swoosh returns command with PlaySwoosh name', () => {
    const cmd = swoosh('msg')
    expect(cmd.name).toBe('PlaySwoosh')
  })

  it('click produces the correct result message', async () => {
    const cmd = click('result')
    const result = await Effect.runPromise(cmd.effect)
    expect(result).toBe('result')
  })
})
