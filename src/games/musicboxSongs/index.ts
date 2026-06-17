import type { StringKey } from '../../i18n'
import type { Song } from '../musicboxDomain'
import { song as birthday } from './birthday'
import { song as duke } from './duke'
import { song as fish } from './fish'
import { song as frere } from './frere'
import { song as happy } from './happy'
import { song as incy } from './incy'
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
  incy,
  fish,
  duke,
  frere,
  happy,
  birthday,
]

export const SONG_TKEYS: Record<string, StringKey> = {
  twinkle: 'musicBoxTwinkle',
  mary: 'musicBoxMary',
  london: 'musicBoxLondon',
  row: 'musicBoxRow',
  oldMac: 'musicBoxOldMac',
  incy: 'musicBoxIncy',
  fish: 'musicBoxFish',
  duke: 'musicBoxDuke',
  frere: 'musicBoxFrere',
  happy: 'musicBoxHappy',
  birthday: 'musicBoxHappyBirthday',
}
