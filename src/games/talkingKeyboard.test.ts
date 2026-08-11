import { describe, expect, it } from 'vitest'
import { Scene } from 'foldkit/test'
import * as TalkingKeyboard from './talkingKeyboard'

describe('Talking Keyboard', () => {
  it('starts on A is for apple and has words for every alphabet letter', () => {
    const model = TalkingKeyboard.init()

    expect(model.selectedLetter).toBe('A')
    expect(TalkingKeyboard.selectedWordFor(model.selectedLetter, model.selectedWordIndex)?.word).toBe('apple')
    expect(Object.keys(TalkingKeyboard.LETTER_WORDS)).toHaveLength(26)
    expect(Object.values(TalkingKeyboard.LETTER_WORDS).every(words => words.length >= 4)).toBe(true)
    expect(model.enabledPacks).toEqual(TalkingKeyboard.DEFAULT_WORD_PACK_KEYS)
  })

  it('offers a large, visualizable vocabulary without padding every letter equally', () => {
    const entries = Object.entries(TalkingKeyboard.LETTER_WORDS)
    const wordCount = entries.reduce((total, [, words]) => total + words.length, 0)

    expect(wordCount).toBeGreaterThan(300)
    expect(new Set(entries.map(([, words]) => words.length)).size).toBeGreaterThan(1)
    for (const [letter, words] of entries) {
      expect(words.every(({ word, emoji, illustration }) =>
        word.toUpperCase().startsWith(letter) && Boolean(emoji || illustration),
      )).toBe(true)
      expect(new Set(words.map(({ word }) => word)).size).toBe(words.length)
    }
    expect(TalkingKeyboard.wordsFor('X').some(({ word }) => word === 'xenops')).toBe(false)
    expect(TalkingKeyboard.wordsFor('Z').some(({ word }) => word === 'zzz')).toBe(false)
  })

  it('uses simple labels and omits redundant pictures', () => {
    expect(TalkingKeyboard.wordsFor('E').map(({ word }) => word)).not.toEqual(expect.arrayContaining([
      'electric plug', 'evergreen tree',
    ]))
    expect(TalkingKeyboard.wordsFor('P').some(({ word }) => word === 'plug')).toBe(true)
    expect(TalkingKeyboard.wordsFor('T').some(({ word }) => word === 'tree')).toBe(true)
    expect(TalkingKeyboard.wordsFor('N').some(({ word }) => word === 'new moon')).toBe(false)
    expect(TalkingKeyboard.wordsFor('S').some(({ word }) => word === 'sailboat')).toBe(false)
    expect(TalkingKeyboard.wordPackFor('plug')).toBe('things')
    expect(TalkingKeyboard.wordPackFor('tree')).toBe('nature')
  })

  it('splits every word across the seven thematic packs', () => {
    const packCounts = Object.fromEntries(TalkingKeyboard.WORD_PACKS.map(({ key }) => [key, 0])) as Record<TalkingKeyboard.WordPackKey, number>
    for (const words of Object.values(TalkingKeyboard.LETTER_WORDS)) {
      for (const { word } of words) packCounts[TalkingKeyboard.wordPackFor(word)] += 1
    }

    expect(Object.keys(packCounts)).toHaveLength(7)
    expect(Object.values(packCounts).every(count => count >= 10)).toBe(true)
  })

  it('filters letter cycling and questions to enabled packs', () => {
    expect(TalkingKeyboard.wordsFor('B', ['food']).map(({ word }) => word)).toEqual([
      'banana', 'bread', 'broccoli', 'burger', 'blueberries',
    ])
    expect(TalkingKeyboard.questionsForPacks(['animals']).every(({ word }) =>
      TalkingKeyboard.wordPackFor(word.word) === 'animals',
    )).toBe(true)

    const [banana] = TalkingKeyboard.update(
      TalkingKeyboard.init(['food']),
      TalkingKeyboard.PressedLetter({ letter: 'B' }),
      true,
    )
    expect(TalkingKeyboard.selectedWordFor('B', banana.selectedWordIndex, banana.enabledPacks)?.word).toBe('banana')
  })

  it('keeps one pack enabled and moves away from letters with no remaining words', () => {
    const model = {
      ...TalkingKeyboard.init(['animals', 'food']),
      selectedLetter: 'X',
      selectedWordIndex: 0,
      questionState: 'asking' as const,
      questionLetter: 'X',
    }
    const [foodOnly] = TalkingKeyboard.update(
      model,
      TalkingKeyboard.SetWordPackEnabled({ key: 'animals', value: false }),
      true,
    )
    const [unchanged] = TalkingKeyboard.update(
      foodOnly,
      TalkingKeyboard.SetWordPackEnabled({ key: 'food', value: false }),
      true,
    )

    expect(foodOnly.enabledPacks).toEqual(['food'])
    expect(foodOnly.selectedLetter).toBe('A')
    expect(foodOnly.questionState).toBe('idle')
    expect(unchanged).toEqual(foodOnly)
  })

  it('disables letter keys that have no words in the enabled packs', () => {
    Scene.scene(
      { update: TalkingKeyboard.update, view: TalkingKeyboard.view },
      Scene.with(TalkingKeyboard.init(['food'])),
      Scene.expect(Scene.label('A is for apple.')).not.toBeDisabled(),
      Scene.expect(Scene.label('X')).toBeDisabled(),
      Scene.expect(Scene.label('Ask a question')).not.toBeDisabled(),
      Scene.Command.expectNone(),
    )
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

  it('renders the zoo animals as a three-piece picture', () => {
    Scene.scene(
      { update: TalkingKeyboard.update, view: TalkingKeyboard.view },
      Scene.with({ ...TalkingKeyboard.init(), selectedLetter: 'Z', selectedWordIndex: 1 }),
      Scene.expect(Scene.selector('.talking-keyboard-emoji-trio')).toExist(),
      Scene.expectAll(Scene.all.selector('.talking-keyboard-emoji-trio span')).toHaveCount(3),
      Scene.Command.expectNone(),
    )
  })

  for (const [letter, wordIndex, illustration] of [
    ['I', 0, 'igloo'],
    ['I', 4, 'ink'],
    ['J', 3, 'jam'],
    ['K', 4, 'king'],
    ['Q', 0, 'queen'],
    ['Q', 3, 'quarter'],
    ['U', 4, 'ukulele'],
    ['X', 0, 'xylophone'],
    ['Y', 0, 'yak'],
    ['Y', 3, 'yogurt'],
    ['Z', 3, 'zipper'],
    ['Z', 4, 'zigzag'],
  ] as const) {
    it(`renders a purpose-built ${illustration} illustration`, () => {
      Scene.scene(
        { update: TalkingKeyboard.update, view: TalkingKeyboard.view },
        Scene.with({ ...TalkingKeyboard.init(), selectedLetter: letter, selectedWordIndex: wordIndex }),
        Scene.expect(Scene.selector(`[data-talking-keyboard-illustration="${illustration}"]`)).toExist(),
        Scene.Command.expectNone(),
      )
    })
  }

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
