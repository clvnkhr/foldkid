import { describe, expect, it } from 'vitest'

import { adjustForSecondCrossing, CheckCurrentTime, init, SetTime, timeFromHourHandAngle, timeFromMinuteHandAngle, timePhrase, update, windingAngles, WindToNow } from './talkingClock'

describe('talking clock', () => {
  it('starts at the supplied current time', () => {
    expect(init(new Date(2026, 7, 4, 14, 37, 42))).toMatchObject({ hour: 2, minute: 37, second: 42, live: true, isWinding: false })
  })

  it('uses familiar figures of speech', () => {
    expect(timePhrase(10, 0)).toBe("10 o'clock")
    expect(timePhrase(10, 10)).toBe('10 minutes past 10')
    expect(timePhrase(2, 15)).toBe('quarter past 2')
    expect(timePhrase(4, 30)).toBe('half past 4')
    expect(timePhrase(7, 45)).toBe('quarter to 8')
    expect(timePhrase(11, 50)).toBe('10 minutes to 12')
  })

  it('supports a digital speaking style', () => {
    expect(timePhrase(2, 5, 'digital')).toBe('2 05')
  })

  it('clamps hand movement to a valid clock time', () => {
    const [next] = update(init(new Date(2026, 7, 4, 10, 0)), SetTime({ hour: 13, minute: 99 }))
    expect(next).toMatchObject({ hour: 1, minute: 59 })
    expect(next.live).toBe(false)
  })

  it('wraps hours in either direction', () => {
    const start = init(new Date(2026, 7, 4, 23, 55))
    const [afterMidnight] = update(start, SetTime({ hour: start.hour + 1, minute: 0 }))
    const [backAgain] = update(afterMidnight, SetTime({ hour: afterMidnight.hour - 1, minute: 55 }))
    expect(afterMidnight).toMatchObject({ hour: 0, minute: 0 })
    expect(backAgain).toMatchObject({ hour: 11, minute: 55 })
  })

  it('ticks only while it is in current-time mode', () => {
    const live = init(new Date(2026, 7, 4, 10, 0, 0))
    const [ticked] = update(live, CheckCurrentTime({ hour: 10, minute: 0, second: 1, key: 'tick' }), true)
    const [manual] = update(ticked, SetTime({ hour: 4, minute: 30 }))
    const [stillManual] = update(manual, CheckCurrentTime({ hour: 10, minute: 1, second: 2, key: 'tick-2' }), true)
    const [resumed] = update(stillManual, WindToNow({ hour: 10, minute: 1, second: 3 }))
    expect(ticked).toMatchObject({ hour: 10, minute: 0, second: 1, live: true })
    expect(stillManual).toMatchObject({ hour: 4, minute: 30, live: false })
    expect(resumed).toMatchObject({ hour: 10, minute: 1, second: 3, live: true, isWinding: true })
  })

  it('drives minutes and hours when the seconds hand crosses 12', () => {
    expect(adjustForSecondCrossing(3, 24, 59, 0)).toEqual({ hour: 3, minute: 25 })
    expect(adjustForSecondCrossing(3, 25, 0, 59)).toEqual({ hour: 3, minute: 24 })
    expect(adjustForSecondCrossing(11, 59, 59, 0)).toEqual({ hour: 0, minute: 0 })
    expect(adjustForSecondCrossing(0, 0, 0, 59)).toEqual({ hour: 11, minute: 59 })
  })

  it('derives the whole time from the hour hand position', () => {
    expect(timeFromHourHandAngle(0)).toEqual({ hour: 0, minute: 0, second: 0 })
    expect(timeFromHourHandAngle(90)).toEqual({ hour: 3, minute: 0, second: 0 })
    expect(timeFromHourHandAngle(97.5)).toEqual({ hour: 3, minute: 15, second: 0 })
    expect(timeFromHourHandAngle(359.5)).toEqual({ hour: 11, minute: 59, second: 0 })
  })

  it('derives minutes and seconds from the minute hand position', () => {
    expect(timeFromMinuteHandAngle(0)).toEqual({ minute: 0, second: 0 })
    expect(timeFromMinuteHandAngle(90)).toEqual({ minute: 15, second: 0 })
    expect(timeFromMinuteHandAngle(93)).toEqual({ minute: 15, second: 30 })
    expect(timeFromMinuteHandAngle(359.9)).toEqual({ minute: 59, second: 59 })
  })

  it('winds through the full elapsed time rather than directly to hand parameters', () => {
    const forward = windingAngles({ hour: 1, minute: 0, second: 0 }, { hour: 3, minute: 0, second: 0 })
    expect(forward.deltaSeconds).toBe(7200)
    expect(forward.minute).toBe(720)
    expect(forward.hour).toBe(90)
    const backward = windingAngles({ hour: 11, minute: 0, second: 0 }, { hour: 9, minute: 0, second: 0 })
    expect(backward.deltaSeconds).toBe(-7200)
    expect(backward.minute).toBe(-720)
  })
})
