import { Effect, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { SettingsDragMoved, SettingsDragEnded } from './message'
import type { Model, Message } from './main'

export const subscriptions = Subscription.make<Model, Message>()(entry => ({
  settingsDragPointer: entry(
    { isDraggingSettings: S.Boolean },
    {
      modelToDependencies: model => ({ isDraggingSettings: model.isDraggingSettings }),
      dependenciesToStream: ({ isDraggingSettings }) =>
        Stream.when(
          Stream.merge(
            Stream.fromEventListener<PointerEvent>(document, 'pointermove').pipe(
              Stream.map(event => SettingsDragMoved({ screenX: event.screenX })),
            ),
            Stream.fromEventListener<PointerEvent>(document, 'pointerup').pipe(
              Stream.map(() => SettingsDragEnded()),
            ),
          ),
          Effect.sync(() => isDraggingSettings),
        ),
    },
  ),
}))
