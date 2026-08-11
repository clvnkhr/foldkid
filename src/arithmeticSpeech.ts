import { t } from './i18n'

export const arithmeticOperatorWord = (operator: string, language: string = 'en'): string => {
  if (operator === '+') return t('calcPlus', language)
  if (operator === '-') return t('calcMinus', language)
  if (operator === '*') return t('calcTimes', language)
  if (operator === '/') return t('calcDivide', language)
  if (operator === '=') return t('calcEquals', language)
  return operator
}

export const arithmeticExpressionForSpeech = (expression: string, language: string = 'en'): string =>
  expression
    .replace(/[+\-*/=]/g, operator => ` ${arithmeticOperatorWord(operator, language)} `)
    .replaceAll(/\s+/g, ' ')
    .trim()
