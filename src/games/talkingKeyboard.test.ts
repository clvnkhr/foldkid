import { describe, expect, it } from 'vitest'
import * as TalkingKeyboard from './talkingKeyboard'

describe('Talking Keyboard', () => {
  it('starts on A is for apple and has words for every alphabet letter', () => {
    const model = TalkingKeyboard.init()

    expect(model.selectedLetter).toBe('A')
    expect(TalkingKeyboard.selectedWordFor(model.selectedLetter, model.selectedWordIndex)?.word).toBe('apple')
    expect(Object.keys(TalkingKeyboard.LETTER_WORDS)).toHaveLength(26)
    expect(Object.values(TalkingKeyboard.LETTER_WORDS).every(words => words.length >= 4)).toBe(true)
  })

  it('speaks the letter prompt and cycles through that letter’s words', () => {
    const [apple, firstCommands] = TalkingKeyboard.update(
      TalkingKeyboard.init(),
      TalkingKeyboard.PressedLetter({ letter: 'A' }),
    )
    const [astronaut, secondCommands] = TalkingKeyboard.update(
      apple,
      TalkingKeyboard.PressedLetter({ letter: 'A' }),
    )

    expect(TalkingKeyboard.selectedWordFor(apple.selectedLetter, apple.selectedWordIndex)?.word).toBe('apple')
    expect(firstCommands[0]?.name).toBe('Speak')
    expect(TalkingKeyboard.promptFor('A', TalkingKeyboard.selectedWordFor('A', 0)!)).toBe('A is for apple.')
    expect(TalkingKeyboard.selectedWordFor(astronaut.selectedLetter, astronaut.selectedWordIndex)?.word).toBe('astronaut')
    expect(secondCommands[0]?.name).toBe('Speak')
  })

  it('remembers a separate next word for each letter', () => {
    const [firstA] = TalkingKeyboard.update(TalkingKeyboard.init(), TalkingKeyboard.PressedLetter({ letter: 'A' }), true)
    const [firstB] = TalkingKeyboard.update(firstA, TalkingKeyboard.PressedLetter({ letter: 'B' }), true)
    const [secondA] = TalkingKeyboard.update(firstB, TalkingKeyboard.PressedLetter({ letter: 'A' }), true)

    expect(TalkingKeyboard.selectedWordFor(firstB.selectedLetter, firstB.selectedWordIndex)?.word).toBe('balloon')
    expect(TalkingKeyboard.selectedWordFor(secondA.selectedLetter, secondA.selectedWordIndex)?.word).toBe('astronaut')
  })

  it('does not speak while muted and ignores non-letter keys', () => {
    const model = TalkingKeyboard.init()
    const [muted, mutedCommands] = TalkingKeyboard.update(model, TalkingKeyboard.PressedLetter({ letter: 'Z' }), true)
    const [unchanged, invalidCommands] = TalkingKeyboard.update(model, TalkingKeyboard.PressedLetter({ letter: '1' }))

    expect(muted.selectedLetter).toBe('Z')
    expect(mutedCommands).toEqual([])
    expect(unchanged).toEqual(model)
    expect(invalidCommands).toEqual([])
  })

  it('shows the answer after a wrong letter, then returns to normal keyboard behavior', () => {
    const [question, questionCommands] = TalkingKeyboard.update(
      TalkingKeyboard.init(),
      TalkingKeyboard.AskQuestion(),
    )
    const wrongLetter = question.questionLetter === 'A' ? 'B' : 'A'
    const [wrong, wrongCommands] = TalkingKeyboard.update(
      question,
      TalkingKeyboard.PressedLetter({ letter: wrongLetter }),
    )
    const [normal, normalCommands] = TalkingKeyboard.update(
      wrong,
      TalkingKeyboard.PressedLetter({ letter: 'C' }),
    )

    expect(question.questionState).toBe('asking')
    expect(TalkingKeyboard.selectedWordFor(question.questionLetter, question.questionWordIndex)).toBeDefined()
    expect(questionCommands[0]?.name).toBe('Speak')
    expect(wrong.questionState).toBe('failed')
    expect(wrong.lastGuess).toBe(wrongLetter)
    expect(wrongCommands).toEqual([])
    expect(normal.questionState).toBe('idle')
    expect(normal.selectedLetter).toBe('C')
    expect(normalCommands[0]?.name).toBe('Speak')
  })

  it('plays a fanfare when the requested letter is chosen', () => {
    const question = {
      ...TalkingKeyboard.init(),
      questionState: 'asking' as const,
      questionLetter: 'P',
      questionWordIndex: 0,
    }
    const [correct, commands] = TalkingKeyboard.update(
      question,
      TalkingKeyboard.PressedLetter({ letter: 'P' }),
    )

    expect(correct.questionState).toBe('correct')
    expect(correct.lastGuess).toBe('P')
    expect(commands[0]?.name).toBe('PlayFanfare')

    const [normal, normalCommands] = TalkingKeyboard.update(
      correct,
      TalkingKeyboard.PressedLetter({ letter: 'A' }),
    )
    expect(normal.questionState).toBe('idle')
    expect(normal.selectedLetter).toBe('A')
    expect(normalCommands[0]?.name).toBe('Speak')
  })
})
