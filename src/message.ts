import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

export const ClickedLanding = m('ClickedLanding')
export const ClickedGreeting = m('ClickedGreeting')
export const ClickedCounter = m('ClickedCounter')
export const ClickedFindIt = m('ClickedFindIt')
export const ClickedBubbles = m('ClickedBubbles')
export const ClickedMusicBox = m('ClickedMusicBox')
export const ClickedAudioTest = m('ClickedAudioTest')
export const ClickedDarkMode = m('ClickedDarkMode')
export const ClickedSettings = m('ClickedSettings')
export const SetLanguage = m('SetLanguage', { value: S.String })
export const SystemDarkModeChanged = m('SystemDarkModeChanged')
export const ToggleMute = m('ToggleMute')
export const SettingsPersisted = m('SettingsPersisted')
