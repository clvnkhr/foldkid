import { Effect, Match as M, Queue, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { speak, type SpeechOptions } from '../speech'
import { warmAudio } from '../audio'

export const PhraseStyle = S.Union([S.Literal('natural'), S.Literal('digital')])
export type PhraseStyle = typeof PhraseStyle.Type

export const Model = S.Struct({
  hour: S.Number,
  minute: S.Number,
  second: S.Number,
  live: S.Boolean,
  timeOffsetMs: S.Number,
  isWinding: S.Boolean,
  justWound: S.Boolean,
  windHourAngle: S.Number,
  windMinuteAngle: S.Number,
  windSecondAngle: S.Number,
  phraseStyle: PhraseStyle,
  lastAutoKey: S.String,
  winding: S.Number,
})
export type Model = typeof Model.Type

export const SetTime = m('TalkingClockSetTime', { hour: S.Number, minute: S.Number, second: S.optionalKey(S.Number) })
export const WindToNow = m('TalkingClockWindToNow', { hour: S.Number, minute: S.Number, second: S.Number })
export const FinishWinding = m('TalkingClockFinishWinding', { hour: S.Number, minute: S.Number, second: S.Number })
export const FinishWindSettling = m('TalkingClockFinishWindSettling')
export const SpeakTime = m('TalkingClockSpeakTime')
export const SetPhraseStyle = m('TalkingClockSetPhraseStyle', { value: PhraseStyle })
export const CheckCurrentTime = m('TalkingClockCheckCurrentTime', { hour: S.Number, minute: S.Number, second: S.Number, key: S.String })
export const SoundPlayed = m('TalkingClockSoundPlayed')
export const Message = S.Union([SetTime, WindToNow, FinishWinding, FinishWindSettling, SpeakTime, SetPhraseStyle, CheckCurrentTime, SoundPlayed])
export type Message = typeof Message.Type

const currentParts = (date: Date = new Date()): { hour: number; minute: number; second: number } => ({
  hour: date.getHours() % 12,
  minute: date.getMinutes(),
  second: date.getSeconds(),
})

export const init = (date: Date = new Date()): Model => ({
  ...currentParts(date),
  phraseStyle: 'digital',
  live: true,
  timeOffsetMs: 0,
  isWinding: false,
  justWound: false,
  windHourAngle: 0,
  windMinuteAngle: 0,
  windSecondAngle: 0,
  lastAutoKey: '',
  winding: 0,
})

const displayHour = (hour: number): number => ((hour % 12) + 12) % 12 || 12
const pad = (n: number): string => n.toString().padStart(2, '0')

export const offsetForTime = (hour: number, minute: number, second: number, now: Date = new Date()): number => {
  const target = new Date(now)
  target.setHours(displayHour(hour) % 12, minute, second, 0)
  let offset = target.getTime() - now.getTime()
  const halfDay = 12 * 60 * 60 * 1000
  while (offset > halfDay) offset -= halfDay * 2
  while (offset < -halfDay) offset += halfDay * 2
  return offset
}

export const timePhrase = (hour: number, minute: number, style: PhraseStyle = 'natural'): string => {
  const h = displayHour(hour)
  const next = displayHour(hour + 1)
  if (minute === 30) return `half past ${h}`
  if (style === 'digital') return `${h}:${pad(minute)}`
  if (minute === 0) return `${h} o'clock`
  if (minute === 15) return `quarter past ${h}`
  if (minute === 30) return `half past ${h}`
  if (minute === 45) return `quarter to ${next}`
  if (minute < 30) return `${minute} ${minute === 1 ? 'minute' : 'minutes'} past ${h}`
  const remaining = 60 - minute
  return `${remaining} ${remaining === 1 ? 'minute' : 'minutes'} to ${next}`
}

export const adjustForSecondCrossing = (
  hour: number,
  minute: number,
  previousSecond: number,
  nextSecond: number,
): { hour: number; minute: number } => {
  if (previousSecond >= 45 && nextSecond <= 15) {
    const nextMinute = minute + 1
    return nextMinute >= 60 ? { hour: (hour + 1) % 12, minute: 0 } : { hour, minute: nextMinute }
  }
  if (previousSecond <= 15 && nextSecond >= 45) {
    const nextMinute = minute - 1
    return nextMinute < 0 ? { hour: (hour + 11) % 12, minute: 59 } : { hour, minute: nextMinute }
  }
  return { hour, minute }
}

export const timeFromHourHandAngle = (angle: number): { hour: number; minute: number; second: number } => {
  const normalized = ((angle % 360) + 360) % 360
  const totalSeconds = Math.round(normalized / 360 * 12 * 60 * 60) % (12 * 60 * 60)
  return {
    hour: Math.floor(totalSeconds / 3600),
    minute: Math.floor(totalSeconds % 3600 / 60),
    second: totalSeconds % 60,
  }
}

export const timeFromMinuteHandAngle = (angle: number): { minute: number; second: number } => {
  const normalized = ((angle % 360) + 360) % 360
  const totalSeconds = Math.round(normalized / 360 * 60 * 60) % (60 * 60)
  return {
    minute: Math.floor(totalSeconds / 60),
    second: totalSeconds % 60,
  }
}

const speakCommand = (model: Model, speech: SpeechOptions): Command.Command<Message> =>
  speak(`It's ${timePhrase(model.hour, model.minute, model.phraseStyle)}.`, SoundPlayed(), { ...speech, lang: 'en' })

const finishWindingCommand = (): Command.Command<Message> => ({
  name: 'TalkingClockFinishWindingDelay',
  effect: Effect.sleep('2400 millis').pipe(
    Effect.andThen(Effect.sync(() => FinishWinding(currentParts()))),
  ),
})

const finishWindSettlingCommand = (): Command.Command<Message> => ({
  name: 'TalkingClockFinishWindSettlingDelay',
  effect: Effect.sleep('50 millis').pipe(Effect.as(FinishWindSettling())),
})

const animateWindingCommand = (
  from: { hour: number; minute: number; second: number },
  to: { hour: number; minute: number; second: number },
): Command.Command<Message> => ({
  name: 'TalkingClockMechanicalWindAnimation',
  effect: Effect.sync(() => {
    const face = document.querySelector<HTMLElement>('.clock-face')
    if (!face) return
    const duration = 2400
    const easing = 'cubic-bezier(.76, 0, .24, 1)'
    const start = {
      hour: from.hour * 30 + from.minute * 0.5 + from.second / 120,
      minute: from.minute * 6 + from.second * 0.1,
      second: from.second * 6,
    }
    const animateHand = (selector: string, startAngle: number, endAngle: number): Animation | undefined => {
      const hand = face.querySelector<HTMLElement>(selector)
      return hand?.animate(
        [
          { transform: `translateX(-50%) rotate(${startAngle}deg)` },
          { transform: `translateX(-50%) rotate(${endAngle}deg)` },
        ],
        { duration, easing, fill: 'forwards' },
      )
    }
    const animations = [
      animateHand('.clock-hand--hour', start.hour, to.hour),
      animateHand('.clock-hand--minute', start.minute, to.minute),
      animateHand('.clock-hand--second', start.second, to.second),
    ].filter((animation): animation is Animation => animation !== undefined)
    const transformAnimations = animations.slice()
    const retarget = (): void => {
      // Aim at where the real clock will be when the animation completes, not
      // where it was when the button was pressed. Re-sampling also absorbs
      // timer and rendering delays while the wind is in progress.
      const elapsed = Math.min(duration, performance.now() - startedAt)
      const predictedFinish = new Date(Date.now() + Math.max(0, duration - elapsed))
      const target = windingAngles(from, currentParts(predictedFinish))
      const ends = [target.hour, target.minute, target.second]
      transformAnimations.forEach((animation, index) => {
        if (animation.effect instanceof KeyframeEffect) {
          const starts = [start.hour, start.minute, start.second]
          animation.effect.setKeyframes([
            { transform: `translateX(-50%) rotate(${starts[index]}deg)` },
            { transform: `translateX(-50%) rotate(${ends[index]}deg)` },
          ])
        }
      })
    }
    const startedAt = performance.now()
    const sampleTimer = window.setInterval(retarget, 200)
    retarget()
    if (Math.abs(to.second - start.second) > 360) {
      const secondHand = face.querySelector<HTMLElement>('.clock-hand--second')
      const blur = secondHand?.animate(
        [
          { filter: 'blur(0px)', opacity: 1, offset: 0 },
          { filter: 'blur(4px) drop-shadow(0 0 10px rgba(242,184,75,.65))', opacity: .7, offset: .3 },
          { filter: 'blur(10px) drop-shadow(0 0 22px rgba(242,184,75,.9))', opacity: .38, offset: .5 },
          { filter: 'blur(4px) drop-shadow(0 0 10px rgba(242,184,75,.65))', opacity: .7, offset: .7 },
          { filter: 'blur(0px)', opacity: 1, offset: 1 },
        ],
        { duration, easing: 'linear', fill: 'forwards' },
      )
      if (blur) animations.push(blur)
    }
    // Keep the final animation frame over the hand briefly. During this grace
    // period the live requestAnimationFrame loop resumes underneath it; when
    // the animations are cancelled there is no unpositioned-frame flash.
    window.setTimeout(() => {
      window.clearInterval(sampleTimer)
      retarget()
      animations.forEach(animation => animation.cancel())
    }, duration + 120)
  }).pipe(Effect.as(SoundPlayed())),
})

export const windingAngles = (
  from: { hour: number; minute: number; second: number },
  to: { hour: number; minute: number; second: number },
): { hour: number; minute: number; second: number; deltaSeconds: number } => {
  const cycle = 12 * 60 * 60
  const fromSeconds = from.hour * 3600 + from.minute * 60 + from.second
  const toSeconds = to.hour * 3600 + to.minute * 60 + to.second
  let deltaSeconds = toSeconds - fromSeconds
  if (deltaSeconds > cycle / 2) deltaSeconds -= cycle
  if (deltaSeconds < -cycle / 2) deltaSeconds += cycle
  return {
    hour: from.hour * 30 + from.minute * 0.5 + from.second / 120 + deltaSeconds / 120,
    minute: from.minute * 6 + from.second * 0.1 + deltaSeconds * 0.1,
    second: from.second * 6 + deltaSeconds * 6,
    deltaSeconds,
  }
}

export const update = (
  model: Model,
  message: Message,
  muted: boolean = false,
  speech: SpeechOptions = {},
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      TalkingClockSetTime: msg => {
        const hour = ((msg.hour % 12) + 12) % 12
        const minute = Math.min(59, Math.max(0, Math.round(msg.minute)))
        const second = msg.second === undefined ? model.second : Math.min(59, Math.max(0, Math.round(msg.second)))
        return [{ ...model, hour, minute, second, live: true, timeOffsetMs: offsetForTime(hour, minute, second), isWinding: false, justWound: false }, []]
      },
      TalkingClockWindToNow: msg => {
        if (model.live && !model.isWinding && Math.abs(model.timeOffsetMs) < 1000) return [model, []]
        const angles = windingAngles(model, msg)
        return [{ ...model, hour: msg.hour % 12, minute: msg.minute, second: msg.second, live: true, timeOffsetMs: 0, isWinding: true, justWound: false, windHourAngle: angles.hour, windMinuteAngle: angles.minute, windSecondAngle: angles.second, winding: model.winding + 1 }, [animateWindingCommand(model, angles), finishWindingCommand()]]
      },
      TalkingClockFinishWinding: msg => [{ ...model, hour: msg.hour, minute: msg.minute, second: msg.second, timeOffsetMs: 0, isWinding: false, justWound: true }, [finishWindSettlingCommand()]],
      TalkingClockFinishWindSettling: () => [{ ...model, justWound: false }, []],
      TalkingClockSpeakTime: () => [model, muted ? [] : [speakCommand(model, speech)]],
      TalkingClockSetPhraseStyle: msg => [{ ...model, phraseStyle: msg.value }, []],
      TalkingClockCheckCurrentTime: () => {
        if (!model.live || model.isWinding) return [model, []]
        const simulated = new Date(Date.now() + model.timeOffsetMs)
        const simulatedHour = simulated.getHours() % 12
        const simulatedMinute = simulated.getMinutes()
        const simulatedSecond = simulated.getSeconds()
        const simulatedKey = `${simulated.getFullYear()}-${simulated.getMonth()}-${simulated.getDate()}-${simulated.getHours()}-${simulated.getMinutes()}`
        const shouldAnnounce = (simulatedMinute === 0 || simulatedMinute === 30) && simulatedSecond <= 1 && simulatedKey !== model.lastAutoKey
        const next = {
          ...model,
          hour: simulatedHour,
          minute: simulatedMinute,
          second: simulatedSecond,
          lastAutoKey: shouldAnnounce ? simulatedKey : model.lastAutoKey,
        }
        return [next, shouldAnnounce && !muted ? [speakCommand(next, speech)] : []]
      },
      TalkingClockSoundPlayed: () => [model, []],
    }),
  )

const clockMount = {
  name: 'talkingClockControls',
  f: (element: Element) => Stream.callback<Message>(queue =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const face = element as HTMLElement
          const doc = face.ownerDocument
          let dragging: 'hour' | 'minute' | 'second' | null = null
          let dragPointerId: number | null = null
          let dragTarget: Element | null = null
          let captured = false
          let touchPointer = false
          let startClientX = 0
          let startClientY = 0
          let startedAt = 0
          let lastTime = 0
          let paired = false
          let nextTouchId = Number.MIN_SAFE_INTEGER
          const nativeTouches = new Map<number, number>()
          const adoptedPointers = new Map<number, number>()
          let dragHour = 0
          let dragMinute = 0
          let dragSecond = 0
          let dragStart = { hour: 0, minute: 0, second: 0 }
          const frameState = { id: 0, running: true }
          const paintDraggedHands = (): void => {
            const hourHand = face.querySelector<HTMLElement>('.clock-hand--hour')
            const minuteHand = face.querySelector<HTMLElement>('.clock-hand--minute')
            const secondHand = face.querySelector<HTMLElement>('.clock-hand--second')
            const hourAngle = dragHour * 30 + dragMinute * 0.5 + dragSecond / 120
            const minuteAngle = dragMinute * 6 + dragSecond * 0.1
            const secondAngle = dragSecond * 6
            if (hourHand) hourHand.style.transform = `translateX(-50%) rotate(${hourAngle}deg)`
            if (minuteHand) minuteHand.style.transform = `translateX(-50%) rotate(${minuteAngle}deg)`
            if (secondHand) secondHand.style.transform = `translateX(-50%) rotate(${secondAngle}deg)`
          }
          const updateFromPointer = (event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'timeStamp'>): void => {
            if (!dragging || dragPointerId !== event.pointerId) return
            if (event.timeStamp < lastTime) return
            const rect = face.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0 || ![rect.left, rect.top, rect.width, rect.height, event.clientX, event.clientY].every(Number.isFinite)) return
            const previous = { hour: dragHour, minute: dragMinute, second: dragSecond }
            lastTime = event.timeStamp
            const angle = Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI + 90
            const normalized = (angle + 360) % 360
            if (dragging === 'second') {
              const nextSecond = Math.round(normalized / 6) % 60
              const adjusted = adjustForSecondCrossing(dragHour, dragMinute, dragSecond, nextSecond)
              dragHour = adjusted.hour
              dragMinute = adjusted.minute
              dragSecond = nextSecond
            } else if (dragging === 'minute') {
              const time = timeFromMinuteHandAngle(normalized)
              const nextMinute = time.minute
              // Moving through 12 changes the hour in the same direction. The
              // wide thresholds avoid treating an ordinary jump around the
              // face as a boundary crossing.
              if (dragMinute >= 45 && nextMinute <= 15) dragHour = (dragHour + 1) % 12
              else if (dragMinute <= 15 && nextMinute >= 45) dragHour = (dragHour + 11) % 12
              dragMinute = nextMinute
              dragSecond = time.second
            } else {
              const time = timeFromHourHandAngle(normalized)
              dragHour = time.hour
              dragMinute = time.minute
              dragSecond = time.second
            }
            if (dragHour !== previous.hour || dragMinute !== previous.minute || dragSecond !== previous.second) {
              Queue.offerUnsafe(queue, SetTime({ hour: dragHour, minute: dragMinute, second: dragSecond }))
            }
            paintDraggedHands()
          }
          const start = (event: Pick<PointerEvent, 'pointerId' | 'pointerType' | 'button' | 'target' | 'clientX' | 'clientY' | 'timeStamp'>, fromPointer = true): void => {
            if (dragging || event.button !== 0) return
            const target = event.target
            if (!(target instanceof Element) || !face.contains(target)) return
            dragging = target.closest('.clock-hand--second') ? 'second' : target.closest('.clock-hand--minute') ? 'minute' : target.closest('.clock-hand--hour') ? 'hour' : null
            if (!dragging) return
            dragTarget = target.closest(`.clock-hand--${dragging}`)
            dragPointerId = event.pointerId
            touchPointer = event.pointerType === 'touch'
            paired = fromPointer
            startClientX = event.clientX
            startClientY = event.clientY
            startedAt = event.timeStamp
            lastTime = event.timeStamp
            dragHour = Number(face.dataset.hour ?? 0)
            dragMinute = Number(face.dataset.minute ?? 0)
            dragSecond = Number(face.dataset.second ?? 0)
            dragStart = { hour: dragHour, minute: dragMinute, second: dragSecond }
            face.classList.add('clock-face--dragging')
            captured = false
            if (!touchPointer) {
              try { face.setPointerCapture(event.pointerId); captured = true } catch { /* Document listeners keep the drag active. */ }
            }
          }
          const finish = (event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'timeStamp' | 'type'>): void => {
            if (!dragging || dragPointerId !== event.pointerId) return
            if (event.type === 'pointerup') updateFromPointer(event)
            const changed = dragHour !== dragStart.hour || dragMinute !== dragStart.minute || dragSecond !== dragStart.second
            cancelDrag()
            if (changed && event.type === 'pointerup') Queue.offerUnsafe(queue, SpeakTime())
            if (event.type === 'pointerup') warmAudio()
          }
          const cancelDrag = (): void => {
            const pointerId = dragPointerId
            dragging = null
            dragPointerId = null
            dragTarget = null
            face.classList.remove('clock-face--dragging')
            if (pointerId !== null && captured) {
              try { if (face.hasPointerCapture(pointerId)) face.releasePointerCapture(pointerId) } catch { /* Capture may already be gone. */ }
            }
            captured = false
            nativeTouches.clear()
            adoptedPointers.clear()
          }
          const visibility = (): void => { if (doc.hidden) cancelDrag() }
          const down = (event: PointerEvent): void => {
            if (event.button !== 0) return
            if (dragging && touchPointer && !paired && nativeTouches.size > 0 && dragPointerId !== null && event.pointerType === 'touch'
              && event.target instanceof Element && event.target.closest(`.clock-hand--${dragging}`) === dragTarget
              && Math.hypot(startClientX - event.clientX, startClientY - event.clientY) <= 1 && Math.abs(startedAt - event.timeStamp) <= 40) {
              paired = true
              adoptedPointers.set(event.pointerId, dragPointerId)
              return
            }
            start(event)
          }
          const move = (event: PointerEvent): void => {
            if (!adoptedPointers.has(event.pointerId) && ![...nativeTouches.values()].includes(event.pointerId)) updateFromPointer(event)
          }
          const up = (event: PointerEvent): void => {
            const owner = adoptedPointers.get(event.pointerId) ?? ([...nativeTouches.values()].includes(event.pointerId) ? event.pointerId : undefined)
            if (owner !== undefined) {
              if (event.type === 'pointercancel') finish({ pointerId: owner, clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp, type: event.type })
              else if (event.type === 'pointerup') adoptedPointers.delete(event.pointerId)
              return
            }
            finish(event)
          }
          const eachTouch = (event: TouchEvent, action: (touch: Touch) => boolean): void => {
            let handled = false
            for (let index = 0; index < event.changedTouches.length; index++) {
              const touch = typeof event.changedTouches.item === 'function' ? event.changedTouches.item(index) : event.changedTouches[index]
              if (touch && action(touch)) handled = true
            }
            if (handled) event.preventDefault()
          }
          const touchStart = (event: TouchEvent): void => eachTouch(event, touch => {
            if (nativeTouches.has(touch.identifier)) return false
            if (dragging && touchPointer && dragPointerId !== null && nativeTouches.size === 0
              && touch.target instanceof Element && touch.target.closest(`.clock-hand--${dragging}`) === dragTarget
              && Math.hypot(startClientX - touch.clientX, startClientY - touch.clientY) <= 1 && Math.abs(startedAt - event.timeStamp) <= 40) {
              nativeTouches.set(touch.identifier, dragPointerId)
              adoptedPointers.set(dragPointerId, dragPointerId)
              return true
            }
            if (dragging) return false
            const id = nextTouchId++
            start({ pointerId: id, pointerType: 'touch', button: 0, target: touch.target, clientX: touch.clientX, clientY: touch.clientY, timeStamp: event.timeStamp }, false)
            if (dragPointerId !== id) return false
            nativeTouches.set(touch.identifier, id)
            return true
          })
          const touchMove = (event: TouchEvent): void => eachTouch(event, touch => {
            const id = nativeTouches.get(touch.identifier)
            if (id === undefined) return false
            updateFromPointer({ pointerId: id, clientX: touch.clientX, clientY: touch.clientY, timeStamp: event.timeStamp })
            return true
          })
          const touchEnd = (event: TouchEvent): void => eachTouch(event, touch => {
            const id = nativeTouches.get(touch.identifier)
            if (id === undefined) return false
            finish({ pointerId: id, clientX: touch.clientX, clientY: touch.clientY, timeStamp: event.timeStamp, type: event.type === 'touchend' ? 'pointerup' : 'pointercancel' })
            return true
          })
          const check = (): void => {
            const now = new Date()
            const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
            Queue.offerUnsafe(queue, CheckCurrentTime({ hour: now.getHours() % 12, minute: now.getMinutes(), second: now.getSeconds(), key }))
          }
          const sweep = (): void => {
            if (!frameState.running) return
            if (face.dataset.live === 'true' && face.dataset.winding !== 'true' && dragging === null) {
              const now = new Date(Date.now() + Number(face.dataset.offset ?? 0))
              const second = now.getSeconds() + now.getMilliseconds() / 1000
              const minute = now.getMinutes() + second / 60
              const hour = (now.getHours() % 12) + minute / 60
              const hourHand = face.querySelector<HTMLElement>('.clock-hand--hour')
              const minuteHand = face.querySelector<HTMLElement>('.clock-hand--minute')
              const secondHand = face.querySelector<HTMLElement>('.clock-hand--second')
              if (hourHand) hourHand.style.transform = `translateX(-50%) rotate(${hour * 30}deg)`
              if (minuteHand) minuteHand.style.transform = `translateX(-50%) rotate(${minute * 6}deg)`
              if (secondHand) secondHand.style.transform = `translateX(-50%) rotate(${second * 6}deg)`
            }
            frameState.id = requestAnimationFrame(sweep)
          }
          face.addEventListener('pointerdown', down)
          doc.addEventListener('pointermove', move, { capture: true })
          doc.addEventListener('pointerup', up, { capture: true })
          doc.addEventListener('pointercancel', up, { capture: true })
          face.addEventListener('lostpointercapture', up)
          face.addEventListener('touchstart', touchStart, { passive: false })
          doc.addEventListener('touchmove', touchMove, { capture: true, passive: false })
          doc.addEventListener('touchend', touchEnd, { capture: true, passive: false })
          doc.addEventListener('touchcancel', touchEnd, { capture: true, passive: false })
          doc.addEventListener('visibilitychange', visibility)
          doc.defaultView?.addEventListener('blur', cancelDrag)
          const timer = window.setInterval(check, 1_000)
          check()
          frameState.id = requestAnimationFrame(sweep)
          return { face, doc, down, move, up, touchStart, touchMove, touchEnd, cancelDrag, visibility, timer, frameState }
        }),
        ({ face, doc, down, move, up, touchStart, touchMove, touchEnd, cancelDrag, visibility, timer, frameState }) => Effect.sync(() => {
          frameState.running = false
          cancelAnimationFrame(frameState.id)
          window.clearInterval(timer)
          face.removeEventListener('pointerdown', down)
          doc.removeEventListener('pointermove', move, { capture: true })
          doc.removeEventListener('pointerup', up, { capture: true })
          doc.removeEventListener('pointercancel', up, { capture: true })
          face.removeEventListener('lostpointercapture', up)
          face.removeEventListener('touchstart', touchStart)
          doc.removeEventListener('touchmove', touchMove, { capture: true })
          doc.removeEventListener('touchend', touchEnd, { capture: true })
          doc.removeEventListener('touchcancel', touchEnd, { capture: true })
          doc.removeEventListener('visibilitychange', visibility)
          doc.defaultView?.removeEventListener('blur', cancelDrag)
          cancelDrag()
        }),
      )
      return yield* Effect.never
    }),
  ),
}

export const mountTalkingClock = clockMount.f

export const view = (model: Model) => {
  const h = html<Message>()
  const hourAngle = model.isWinding ? model.windHourAngle : model.hour * 30 + model.minute * 0.5 + model.second / 120
  const minuteAngle = model.isWinding ? model.windMinuteAngle : model.minute * 6 + model.second * 0.1
  const secondAngle = model.isWinding ? model.windSecondAngle : model.second * 6
  const isLargeWind = model.isWinding && Math.abs(model.windSecondAngle - model.second * 6) > 360
  const now = currentParts()
  return h.div([h.Class('page talking-clock-page')], [
    h.div([h.Class('talking-clock-shell')], [
      h.div([h.Class('talking-clock-heading')], [
        h.div([], [h.p([h.Class('talking-clock-kicker')], ['TIME EXPLORER']), h.h1([], ['Talking Clock'])]),
        h.p([], ['Drag a hand to set the time, tap the speaker to hear it, or wind the crown to now.']),
      ]),
      h.div([h.Class('talking-clock-layout')], [
        h.div([h.Class('clock-stage')], [
          h.div([
            h.Class(`clock-face${model.isWinding ? ' clock-face--winding' : ''}${isLargeWind ? ' clock-face--large-wind' : ''}${model.justWound ? ' clock-face--settling' : ''}`),
            h.Attribute('data-hour', model.hour.toString()), h.Attribute('data-minute', model.minute.toString()), h.Attribute('data-second', model.second.toString()),
            h.Attribute('data-live', model.live.toString()), h.Attribute('data-winding', model.isWinding.toString()),
            h.Attribute('data-offset', model.timeOffsetMs.toString()),
            h.Attribute('role', 'group'), h.Attribute('aria-label', `Analog clock showing ${timePhrase(model.hour, model.minute, model.phraseStyle)}`),
            h.OnMount(clockMount),
          ], [
            ...Array.from({ length: 60 }, (_, i) => h.span([h.Class(i % 5 === 0 ? 'clock-tick clock-tick--hour' : 'clock-tick'), h.Style({ transform: `rotate(${i * 6}deg)` })], [])),
            ...Array.from({ length: 12 }, (_, i) => {
              const angle = (i + 1) * Math.PI / 6
              return h.span([h.Class('clock-number'), h.Style({ left: `${50 + Math.sin(angle) * 36}%`, top: `${50 - Math.cos(angle) * 36}%` })], [(i + 1).toString()])
            }),
            h.div([
              h.Class('clock-hand clock-hand--hour'),
              ...(model.live && !model.isWinding ? [] : [h.Style({ transform: `translateX(-50%) rotate(${hourAngle}deg)` })]),
              h.Attribute('aria-label', 'Drag the hour hand'),
            ], []),
            h.div([
              h.Class('clock-hand clock-hand--minute'),
              ...(model.live && !model.isWinding ? [] : [h.Style({ transform: `translateX(-50%) rotate(${minuteAngle}deg)` })]),
              h.Attribute('aria-label', 'Drag the minute hand'),
            ], []),
            h.div([
              h.Class('clock-hand clock-hand--second'),
              ...(model.live && !model.isWinding ? [] : [h.Style({ transform: `translateX(-50%) rotate(${secondAngle}deg)` })]),
              h.Attribute('aria-label', 'Drag the seconds hand'),
            ], []),
            h.div([h.Class('clock-pin')], []),
            h.div([h.Class('clock-face-readout'), h.Attribute('aria-live', 'polite')], [
              h.div([h.Class('clock-digital')], [`${displayHour(model.hour)}:${pad(model.minute)}`]),
            ]),
            h.button([
              h.Class('clock-face-speak'),
              h.Attribute('aria-label', 'Speak the time'),
              h.OnClick(SpeakTime()),
            ], ['🔊']),
            h.button([
              h.Class('clock-crown'),
              h.Attribute('aria-label', 'Wind to current time'),
              h.OnClick(WindToNow(now)),
            ], ['↻']),
          ]),
        ]),
      ]),
      h.p([h.Class(`clock-mode ${model.live ? 'clock-mode--live' : ''}`)], [model.live ? '● Current time · clock is running' : '○ Manual time · clock is paused']),
      h.p([h.Class('clock-auto-note')], ['Auto-speaks on the hour and half hour · crown winds to now']),
    ]),
  ])
}
