import type { StringKey } from '../../i18n'
import type { Song } from '../musicboxDomain'
import { song as birthday } from './birthday'
import { song as happy } from './happy'
import { song as london } from './london'
import { song as mary } from './mary'
import { song as oldMac } from './oldMac'
import { song as row } from './row'
import { song as twinkle } from './twinkle'

export const SONGS: Song[] = [
  twinkle,
  mary,
  london,
  row,
  oldMac,
  happy,
  birthday,
]

export const SONG_TKEYS: Record<string, StringKey> = {
  twinkle: 'musicBoxTwinkle',
  mary: 'musicBoxMary',
  london: 'musicBoxLondon',
  row: 'musicBoxRow',
  oldMac: 'musicBoxOldMac',
  happy: 'musicBoxHappy',
  birthday: 'musicBoxHappyBirthday',
}
